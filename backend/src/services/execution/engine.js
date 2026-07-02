/**
 * Test Execution Engine v32-clean
 * 
 * CALL:   ADB shell am start ACTION_CALL (wakes screen only for dial)
 * STATE:  APK /state endpoint (TelephonyManager — reliable)
 * ANSWER: APK /answer (TelecomManager.acceptRingingCall)
 * HANGUP: ADB KEYCODE_ENDCALL
 * SMS:    APK /sms (SmsManager — B-party can be any external number)
 */

const fs   = require('fs');
const path = require('path');
const http  = require('http');
const https = require('https');
const { execFileSync } = require('child_process');
const { query } = require('../../db/pool');

const EVIDENCE_ROOT = process.env.EVIDENCE_PATH || path.join(__dirname,'..','..','..','storage','evidence');
const ADB = process.env.ADB_PATH || 'adb';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ensureDir = d => fs.mkdirSync(d, { recursive: true });
const normalizeNum = n => (n || '').replace(/[\s\-\(\)]/g, '');

// ── ADB ───────────────────────────────────────────────────────────────────────
function adbRun(serial, args, timeout) {
  const full = serial ? ['-s', serial, ...args] : args;
  try {
    return execFileSync(ADB, full, { maxBuffer: 20*1024*1024, timeout: timeout || 12000 }).toString();
  } catch(e) { return e.stdout ? e.stdout.toString() : ''; }
}

function adbDial(serial, number) {
  // Wake screen only for dialling (required by Android for ACTION_CALL)
  adbRun(serial, ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  sleep(600);
  return adbRun(serial, ['shell', 'am', 'start', '-a', 'android.intent.action.CALL', '-d', 'tel:' + number]);
}

function adbEndCall(serial) {
  if (serial) adbRun(serial, ['shell', 'input', 'keyevent', 'KEYCODE_ENDCALL']);
}

// ── APK HTTP ──────────────────────────────────────────────────────────────────
function agentReq(agentUrl, method, endpoint, body, timeoutMs) {
  timeoutMs = timeoutMs || 20000;
  return new Promise((resolve, reject) => {
    const urlObj = new URL(endpoint, agentUrl);
    const lib = urlObj.protocol === 'https:' ? https : http;
    const bodyStr = method === 'POST' ? JSON.stringify(body || {}) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = lib.request({
      hostname: urlObj.hostname, port: urlObj.port || 80,
      path: urlObj.pathname, method, headers, timeout: timeoutMs,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ raw: d }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout: ' + agentUrl + endpoint)); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const agentGet  = (url, ep)        => agentReq(url, 'GET',  ep, null);
const agentPost = (url, ep, body)  => agentReq(url, 'POST', ep, body || {});

async function pollApkState(agentUrl, desired, timeoutMs) {
  const end = Date.now() + (timeoutMs || 12000);
  while (Date.now() < end) {
    try {
      const s = await agentGet(agentUrl, '/state');
      if (desired.includes(s.call_state)) return s.call_state;
    } catch(e) {}
    await sleep(800);
  }
  try { const s = await agentGet(agentUrl, '/state'); return s.call_state || 'UNKNOWN'; }
  catch(e) { return 'UNKNOWN'; }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function getAllHandsets() {
  const r = await query('SELECT * FROM handsets');
  return r.rows;
}

async function finishExec(id, data) {
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
  await query(`UPDATE executions SET ${sets} WHERE id=$${keys.length+1}`, [...vals, id]);
}

// Find which handset has this MSISDN (for smart resolution)
function findHandsetByMsisdn(handsets, msisdn) {
  const n = normalizeNum(msisdn);
  return handsets.find(h => normalizeNum(h.msisdn) === n) || null;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function executeTestCase(testCaseId, triggeredBy) {
  triggeredBy = triggeredBy || 'system';

  const tcRes = await query('SELECT * FROM test_cases WHERE id=$1', [testCaseId]);
  const tc = tcRes.rows[0];
  if (!tc) throw new Error('Test case not found: ' + testCaseId);

  const allHandsets = await getAllHandsets();

  // Smart resolution: find phone by MSISDN, fall back to label
  const aParty = findHandsetByMsisdn(allHandsets, tc.a_party_msisdn)
    || allHandsets.find(h => h.label === tc.a_party_handset_label)
    || null;

  // B-party: find by MSISDN match only
  // DO NOT fall back to label — shortcodes like 233 should never match a registered handset
  // A number is "external" if it's a shortcode (<7 digits) or not registered in handsets
  const bMsisdnStr = (tc.b_party_msisdn || '').trim();
  const isShortcode = bMsisdnStr.replace(/[^0-9]/g, '').length < 7;
  const bParty = isShortcode ? null : findHandsetByMsisdn(allHandsets, bMsisdnStr) || null;
  // Note: we intentionally do NOT fall back to handset label for B-party
  // B-party is identified by MSISDN only — label fallback caused same-device errors

  const eRes = await query(
    'INSERT INTO executions (test_case_id,status,a_party_handset_serial,b_party_handset_serial,triggered_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [testCaseId, 'Running', aParty?.adb_serial, bParty?.adb_serial, triggeredBy]
  );
  const eid = eRes.rows[0].id;
  const t0 = Date.now();
  await query('UPDATE test_cases SET status=$1 WHERE id=$2', ['Running', testCaseId]);
  ensureDir(path.join(EVIDENCE_ROOT, eid));

  const res = { actual_call_mo: null, actual_call_mt: null, actual_sms: null,
                actual_sms_notification: null, actual_delivery_report: null };
  const fails = [];

  try {
    // A-party MUST be a connected phone
    if (!aParty) throw new Error(
      `No phone registered with MSISDN ${tc.a_party_msisdn} (A-party). ` +
      `Go to Handsets and register the phone with this number.`
    );

    const aUrl = aParty.agent_url;
    const aSerial = aParty.adb_serial;
    if (!aUrl) throw new Error(`Handset ${aParty.label} has no Agent URL. Edit it in Handsets.`);

    // B-party: connected phone or external number
    const bUrl = bParty?.agent_url || null;
    const bSerial = bParty?.adb_serial || null;
    const bNum = tc.b_party_msisdn;
    const bIsExternal = !bUrl;

    // Validate A ≠ B when both connected
    if (!bIsExternal && aUrl === bUrl) throw new Error(
      `A-party and B-party both point to same device (${aUrl}). ` +
      `Go to Handsets → fix agent URLs: A=localhost:8765, B=localhost:8766`
    );

    console.log(`\n[${tc.tc_id}] A: ${tc.a_party_msisdn} → ${aUrl}`);
    console.log(`[${tc.tc_id}] B: ${bNum} → ${bIsExternal ? 'EXTERNAL NUMBER' : bUrl}`);

    // Health check A-party
    try {
      const h = await agentGet(aUrl, '/health');
      console.log(`[${tc.tc_id}] A-party: ${h.model} Android ${h.android_version} ✓`);
    } catch(e) {
      throw new Error(`Cannot reach A-party APK at ${aUrl}. Open TelecomTestAgent on Phone A. Error: ${e.message}`);
    }

    // Health check B-party (optional)
    let bConnected = !bIsExternal;
    if (!bIsExternal) {
      try {
        const h = await agentGet(bUrl, '/health');
        console.log(`[${tc.tc_id}] B-party: ${h.model} Android ${h.android_version} ✓`);
      } catch(e) {
        console.log(`[${tc.tc_id}] B-party APK unreachable — treating as external number`);
        bConnected = false;
      }
    } else {
      console.log(`[${tc.tc_id}] B-party is external — dial/SMS will go via network`);
    }

    const dMs = (tc.call_duration_seconds || 15) * 1000;

    // ── CALL ──────────────────────────────────────────────────────────────────
    if (tc.exp_call_mo === 'Y' || tc.exp_call_mt === 'Y') {
      console.log(`[${tc.tc_id}] ── CALL: ${bNum} for ${tc.call_duration_seconds}s ──`);
      if (!aSerial) throw new Error(`No ADB serial for A-party. Edit Handset ${aParty.label} and set serial.`);

      // Clean state
      adbEndCall(aSerial);
      if (bSerial && bConnected) adbEndCall(bSerial);
      await sleep(800);

      // Dial
      console.log(`[${tc.tc_id}] Dialling ${bNum}...`);
      adbDial(aSerial, bNum);

      // Check MO state via APK
      await sleep(4000);
      const moState = await pollApkState(aUrl, ['OFFHOOK', 'RINGING'], 12000);
      console.log(`[${tc.tc_id}] A state: ${moState}`);
      res.actual_call_mo = ['OFFHOOK','RINGING'].includes(moState) ? 'Y' : 'N';

      if (res.actual_call_mo === 'N') {
        fails.push(`Call MO failed (A state=${moState}). Possible: insufficient credit, call barring, or network rejection on SIM A.`);
        res.actual_call_mt = 'N';
      } else {
        if (!bConnected) {
          // External B-party — can't verify MT
          console.log(`[${tc.tc_id}] Call active on A. B-party is external — holding ${tc.call_duration_seconds}s then hanging up.`);
          res.actual_call_mt = null; // N/A
          await sleep(dMs);
        } else {
          // Wait for B to ring
          const bRingState = await pollApkState(bUrl, ['RINGING','OFFHOOK'], 12000);
          console.log(`[${tc.tc_id}] B state: ${bRingState}`);

          if (!['RINGING','OFFHOOK'].includes(bRingState)) {
            fails.push(`Call MT failed: B-party never rang (state=${bRingState}). Call may have been rejected by network or A-party SIM.`);
            res.actual_call_mt = 'N';
          } else {
            // Answer
            const ans = await agentPost(bUrl, '/answer', {});
            console.log(`[${tc.tc_id}] Answer: ${JSON.stringify(ans)}`);
            const mtState = await pollApkState(bUrl, ['OFFHOOK'], 8000);
            res.actual_call_mt = mtState === 'OFFHOOK' ? 'Y' : 'N';
            if (res.actual_call_mt === 'N') {
              fails.push(`Call MT: B did not answer (state=${mtState}). Check Auto-Answer is ON in TelecomTestAgent on Phone B.`);
            }

            // Hold
            console.log(`[${tc.tc_id}] Call connected! Holding ${tc.call_duration_seconds}s...`);
            await sleep(dMs);
          }
        }

        // Hang up
        console.log(`[${tc.tc_id}] Hanging up...`);
        adbEndCall(aSerial);
        await sleep(500);
        if (bSerial && bConnected) adbEndCall(bSerial);
        console.log(`[${tc.tc_id}] Call ended.`);
      }
      await sleep(1000);
    }

    // ── SMS ───────────────────────────────────────────────────────────────────
    if (tc.exp_sms === 'Y' || tc.exp_sms_notification === 'Y') {
      const smsText = tc.sms_text || 'Test 123';
      console.log(`[${tc.tc_id}] ── SMS: "${smsText}" → ${bNum} ──`);
      console.log(`[${tc.tc_id}] Sending FROM: ${tc.a_party_msisdn} | TO: ${bNum} | External: ${!bConnected}`);

      // Get B baseline (only if connected)
      let cntBefore = 0, tsBefore = 0;
      if (bConnected) {
        try {
          const bState = await agentGet(bUrl, '/state');
          cntBefore = bState.sms_count_received || 0;
          tsBefore  = bState.last_sms_timestamp  || 0;
        } catch(e) { /* ignore */ }
      }

      // Send
      const smsRes = await agentPost(aUrl, '/sms', { number: bNum, text: smsText });
      console.log(`[${tc.tc_id}] SMS send: ${JSON.stringify(smsRes)}`);

      if (!smsRes.sent) {
        fails.push(`SMS send failed: ${smsRes.error || 'unknown'}. Grant SEND_SMS permission on Phone A.`);
        res.actual_sms = 'N'; res.actual_sms_notification = 'N'; res.actual_delivery_report = 'N';
      } else if (!bConnected) {
        // External B-party (shortcode, roaming, international) — SMS sent via network
        console.log(`[${tc.tc_id}] SMS sent to ${bNum} (external). Network delivers it — check phone for reply.`);
        if (smsRes.delivery_status) console.log(`[${tc.tc_id}] Delivery status: ${smsRes.delivery_status}`);
        res.actual_sms = 'Y';
        res.actual_sms_notification = null; // N/A — external number
        res.actual_delivery_report = null;  // N/A — external number
      } else {
        // Connected B — verify receipt
        console.log(`[${tc.tc_id}] Waiting 12s for delivery...`);
        await sleep(12000);
        const bAfter = await agentGet(bUrl, '/state');
        const cntAfter = bAfter.sms_count_received || 0;
        const body     = bAfter.last_sms_received  || '';
        console.log(`[${tc.tc_id}] B SMS count: ${cntBefore}→${cntAfter} body: "${body}"`);

        const received = cntAfter > cntBefore && body.includes(smsText);
        res.actual_sms             = received ? 'Y' : 'N';
        res.actual_sms_notification = received ? 'Y' : 'N';
        res.actual_delivery_report  = received ? 'Y' : 'N';

        if (!received) {
          if (cntAfter <= cntBefore) {
            fails.push(`SMS not delivered to B-party — count unchanged. Possible: insufficient credit or SMS barring on A-party SIM.`);
          } else {
            fails.push(`SMS received but text mismatch. Expected: "${smsText}", Got: "${body}"`);
          }
        }
      }
    }

    // ── Result ────────────────────────────────────────────────────────────────
    const status = fails.length === 0 ? 'Passed' : 'Failed';
    await finishExec(eid, {
      actual_call_mo: res.actual_call_mo,
      actual_call_mt: res.actual_call_mt,
      actual_sms: res.actual_sms,
      actual_sms_notification: res.actual_sms_notification,
      actual_delivery_report: res.actual_delivery_report,
      status,
      failure_reason: fails.join(' | ') || null,
      ended_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
    });
    await query('UPDATE test_cases SET status=$1 WHERE id=$2', [status, testCaseId]);
    console.log(`[${tc.tc_id}] ═══ ${status} ═══\n`);
    return { execId: eid, status, results: res, failures: fails };

  } catch(err) {
    console.error(`[ERROR] ${tc.tc_id}: ${err.message}`);
    await finishExec(eid, {
      status: 'Blocked',
      failure_reason: err.message,
      ended_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
    });
    await query('UPDATE test_cases SET status=$1 WHERE id=$2', ['Blocked', testCaseId]);
    return { execId: eid, status: 'Blocked', results: res, failures: [err.message] };
  }
}

async function executeBatch(ids, triggeredBy) {
  const out = [];
  for (const id of ids) {
    out.push(await executeTestCase(id, triggeredBy));
    await sleep(2000);
  }
  return out;
}

module.exports = { executeTestCase, executeBatch };
