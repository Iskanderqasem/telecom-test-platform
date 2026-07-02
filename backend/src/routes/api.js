const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { query } = require('../db/pool');
const adb = require('../services/device/adb/adbClient');
const { executeTestCase, executeBatch } = require('../services/execution/engine');
const { exportToExcel, exportToCsv, getResultsData } = require('../services/reports/exportService');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ================================================================
// HANDSETS
// ================================================================

router.get('/handsets', async (req, res) => {
  const result = await query('SELECT * FROM handsets ORDER BY label');
  res.json(result.rows);
});

router.post('/handsets', async (req, res) => {
  const { label, make, model, android_version, adb_serial, msisdn, operator, network_type, profile, agent_url, notes } = req.body;
  if (!label) return res.status(400).json({ error: 'label is required' });
  try {
    // Clear this serial from any other handset first — phones move between slots
    if (adb_serial) {
      await query('UPDATE handsets SET adb_serial=NULL WHERE adb_serial=$1 AND label!=$2', [adb_serial, label]);
    }
    const result = await query(
      `INSERT INTO handsets (label, make, model, android_version, adb_serial, msisdn, operator, network_type, profile, agent_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (label) DO UPDATE SET
         make=EXCLUDED.make, model=EXCLUDED.model, android_version=EXCLUDED.android_version,
         adb_serial=EXCLUDED.adb_serial, msisdn=EXCLUDED.msisdn, operator=EXCLUDED.operator,
         network_type=EXCLUDED.network_type, profile=EXCLUDED.profile,
         agent_url=EXCLUDED.agent_url, notes=EXCLUDED.notes
       RETURNING *`,
      [label, make, model, android_version, adb_serial || null, msisdn, operator, network_type, profile, agent_url || null, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/handsets/:label', async (req, res) => {
  const fields = ['make','model','android_version','adb_serial','msisdn','operator','network_type','profile','agent_url','status','notes'];
  const updates = []; const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { params.push(req.body[f]); updates.push(`${f}=$${params.length}`); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.label);
  const result = await query(`UPDATE handsets SET ${updates.join(',')} WHERE label=$${params.length} RETURNING *`, params);
  if (!result.rows.length) return res.status(404).json({ error: 'Handset not found' });
  res.json(result.rows[0]);
});

router.delete('/handsets/:label', async (req, res) => {
  await query('DELETE FROM handsets WHERE label=$1', [req.params.label]);
  res.json({ deleted: true });
});

// Live ADB check
router.get('/handsets/adb/connected', async (req, res) => {
  const serials = await adb.listDevices().catch(() => []);
  res.json({ connected: serials });
});

// Fix serials: set correct WiFi serial for a handset
router.post('/handsets/:label/set-serial', async (req, res) => {
  const { label } = req.params;
  const { serial, agent_url } = req.body;
  try {
    // If serial is being set, clear it from any other handset first (avoid unique constraint)
    if (serial) {
      await query('UPDATE handsets SET adb_serial=NULL WHERE adb_serial=$1 AND label!=$2', [serial, label]);
    }
    const fields = [];
    const vals = [];
    if (serial !== undefined) { vals.push(serial || null); fields.push(`adb_serial=$${vals.length}`); }
    if (agent_url !== undefined) { vals.push(agent_url || null); fields.push(`agent_url=$${vals.length}`); }
    if (!fields.length) return res.json({ ok: false, error: 'Nothing to update' });
    vals.push(label);
    await query(`UPDATE handsets SET ${fields.join(',')} WHERE label=$${vals.length}`, vals);
    res.json({ ok: true, message: `Handset ${label} updated: serial=${serial}, agent_url=${agent_url}` });
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

// One-time fix: clear wrong ADB serials for handsets that shouldn't have them
router.post('/handsets/:label/clear-serial', async (req, res) => {
  const { label } = req.params;
  await query('UPDATE handsets SET adb_serial=NULL WHERE label=$1', [label]);
  res.json({ ok: true, message: `ADB serial cleared for Handset ${label}` });
});

router.get('/handsets/:label/adb-check', async (req, res) => {
  const h = await query('SELECT adb_serial FROM handsets WHERE label=$1', [req.params.label]);
  if (!h.rows.length) return res.status(404).json({ error: 'Not found' });
  const connected = await adb.isConnected(h.rows[0].adb_serial).catch(() => false);
  res.json({ label: req.params.label, adb_serial: h.rows[0].adb_serial, connected });
});

// ================================================================
// TEST CASES
// ================================================================

router.get('/test-cases', async (req, res) => {
  const { environment, project_id, work_type, test_reason_type, assigned_to, status, search } = req.query;
  const conditions = [];
  const params = [];

  if (environment)      { params.push(environment);      conditions.push(`tc.environment=$${params.length}`); }
  if (project_id)       { params.push(project_id);       conditions.push(`tc.project_id=$${params.length}`); }
  if (work_type)        { params.push(work_type);        conditions.push(`tc.work_type=$${params.length}`); }
  if (test_reason_type) { params.push(test_reason_type); conditions.push(`tc.test_reason_type=$${params.length}`); }
  if (assigned_to)      { params.push(assigned_to);      conditions.push(`tc.assigned_to=$${params.length}`); }
  if (status)           { params.push(status);           conditions.push(`tc.status=$${params.length}`); }
  if (search) {
    params.push('%' + search.toLowerCase() + '%');
    conditions.push(`(LOWER(tc.tc_id) LIKE $${params.length} OR LOWER(tc.description) LIKE $${params.length} OR LOWER(tc.test_reason_ref) LIKE $${params.length} OR LOWER(tc.work_ref_name) LIKE $${params.length})`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await query(`
    SELECT tc.*,
      p.name AS project_name, p.code AS project_code,
      p.type AS project_type, p.project_number, p.owner_name AS project_owner
    FROM test_cases tc
    LEFT JOIN projects p ON p.id = tc.project_id
    ${where}
    ORDER BY tc.sort_order, tc.tc_id
  `, params);
  res.json(result.rows);
});

router.get('/test-cases/:id', async (req, res) => {
  const result = await query('SELECT * FROM test_cases WHERE id=$1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.post('/test-cases', async (req, res) => {
  const {
    tc_id, traceability_label, flow, environment, description,
    a_party_msisdn, a_party_network, a_party_profile, a_party_handset_label,
    b_party_msisdn, b_party_network, b_party_profile, b_party_handset_label,
    exp_call_mo, exp_call_mt, exp_sms, exp_sms_notification, exp_delivery_report,
    call_duration_seconds, call_type, sms_text, assigned_to, sort_order,
  } = req.body;

  if (!tc_id) return res.status(400).json({ error: 'tc_id is required' });

  const result = await query(
    `INSERT INTO test_cases (
      tc_id, traceability_label, flow, environment, description,
      a_party_msisdn, a_party_network, a_party_profile, a_party_handset_label,
      b_party_msisdn, b_party_network, b_party_profile, b_party_handset_label,
      exp_call_mo, exp_call_mt, exp_sms, exp_sms_notification, exp_delivery_report,
      call_duration_seconds, call_type, sms_text, assigned_to, sort_order
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    RETURNING *`,
    [tc_id, traceability_label, flow, environment || 'Prod', description,
     a_party_msisdn, a_party_network, a_party_profile, a_party_handset_label,
     b_party_msisdn, b_party_network, b_party_profile, b_party_handset_label,
     exp_call_mo || 'Y', exp_call_mt || 'Y', exp_sms || 'Y',
     exp_sms_notification || 'Y', exp_delivery_report || 'N',
     call_duration_seconds || 15, call_type || 'VoLTE', sms_text || 'Test 123',
     assigned_to, sort_order || 0]
  );
  res.status(201).json(result.rows[0]);
});

router.patch('/test-cases/:id', async (req, res) => {
  const fields = [
    'tc_id','traceability_label','flow','environment','description',
    'a_party_msisdn','a_party_network','a_party_profile','a_party_handset_label',
    'b_party_msisdn','b_party_network','b_party_profile','b_party_handset_label',
    'exp_call_mo','exp_call_mt','exp_sms','exp_sms_notification','exp_delivery_report',
    'call_duration_seconds','call_type','sms_text','assigned_to','sort_order','status','project_id',
    'work_type','work_ref_number','work_ref_name','work_owner','test_reason_type','test_reason_ref',
  ];
  const updates = []; const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { params.push(req.body[f]); updates.push(`${f}=$${params.length}`); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  const result = await query(`UPDATE test_cases SET ${updates.join(',')} WHERE id=$${params.length} RETURNING *`, params);
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// Copy a test case
router.post('/test-cases/:id/copy', async (req, res) => {
  const original = await query('SELECT * FROM test_cases WHERE id=$1', [req.params.id]);
  if (!original.rows.length) return res.status(404).json({ error: 'Not found' });
  const o = original.rows[0];
  const result = await query(
    `INSERT INTO test_cases (
      tc_id, traceability_label, flow, environment, description,
      a_party_msisdn, a_party_network, a_party_profile, a_party_handset_label,
      b_party_msisdn, b_party_network, b_party_profile, b_party_handset_label,
      exp_call_mo, exp_call_mt, exp_sms, exp_sms_notification, exp_delivery_report,
      call_duration_seconds, call_type, sms_text, assigned_to, sort_order, project_id,
      work_type, work_ref_number, work_ref_name, work_owner, test_reason_type, test_reason_ref
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
    RETURNING *`,
    [
      (req.body.tc_id || o.tc_id + '-COPY'),
      o.traceability_label, o.flow, o.environment,
      req.body.description || o.description,
      o.a_party_msisdn, o.a_party_network, o.a_party_profile, o.a_party_handset_label,
      o.b_party_msisdn, o.b_party_network, o.b_party_profile, o.b_party_handset_label,
      o.exp_call_mo, o.exp_call_mt, o.exp_sms, o.exp_sms_notification, o.exp_delivery_report,
      o.call_duration_seconds, o.call_type, o.sms_text, o.assigned_to,
      (o.sort_order || 0) + 1, o.project_id,
      o.work_type, o.work_ref_number, o.work_ref_name, o.work_owner,
      o.test_reason_type, o.test_reason_ref,
    ]
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/test-cases/:id', async (req, res) => {
  await query('DELETE FROM test_cases WHERE id=$1', [req.params.id]);
  res.json({ deleted: true });
});

router.delete('/test-cases', async (req, res) => {
  await query('DELETE FROM test_cases');
  res.json({ deleted: true });
});

// Reset all test case statuses to "Not Run"
router.post('/test-cases/reset-all', async (req, res) => {
  await query(`UPDATE test_cases SET status='Not Run'`);
  res.json({ reset: true });
});

// ================================================================
// CSV / EXCEL IMPORT
// ================================================================

router.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const content = req.file.buffer.toString('utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

  const inserted = [];
  for (const [idx, r] of records.entries()) {
    if (!r['TC ID']) continue;
    const result = await query(
      `INSERT INTO test_cases (
        tc_id, traceability_label, flow, environment, description,
        a_party_msisdn, a_party_network, a_party_profile, a_party_handset_label,
        b_party_msisdn, b_party_network, b_party_profile, b_party_handset_label,
        exp_call_mo, exp_call_mt, exp_sms, exp_sms_notification, exp_delivery_report,
        call_duration_seconds, call_type, sms_text, assigned_to, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING id`,
      [
        r['TC ID'], r['Traceability Label'] || '', r['Flow'] || '',
        r['Environment'] || 'Prod', r['Test Case Description'] || r['Description'] || '',
        r['A-Party MSISDN'] || '', r['A-Party Network'] || '', r['A-Party Profile'] || '', r['A-Party Handset'] || 'A',
        r['B-Party MSISDN'] || '', r['B-Party Network'] || '', r['B-Party Profile'] || '', r['B-Party Handset'] || 'B',
        r['Call MO'] || 'Y', r['Call MT'] || 'Y', r['SMS'] || 'Y',
        r['SMS Notification'] || r['SMS Notification Sent'] || 'Y',
        r['Delivery Report'] || r['Delivery Report Available'] || 'N',
        Number(r['Call Duration'] || 15), r['Call Type'] || 'VoLTE',
        r['SMS Text'] || 'Test 123', r['Assigned To'] || '', idx,
      ]
    );
    inserted.push(result.rows[0].id);
  }
  res.json({ imported: inserted.length, ids: inserted });
});

// ================================================================
// EXECUTION
// ================================================================

// Run a single test case
router.post('/execute/:id', async (req, res) => {
  const { id } = req.params;
  if (!id || id === 'undefined') {
    return res.status(400).json({ error: 'Invalid test case ID. Please refresh the page and try again.' });
  }
  const tc = await query('SELECT * FROM test_cases WHERE id=$1', [id]);
  if (!tc.rows.length) return res.status(404).json({ error: 'Test case not found' });
  // Get username from JWT token if available
  let triggeredBy = 'web-ui';
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'telecom-test-platform-secret-2026');
      const userRes = await query('SELECT username, full_name FROM users WHERE id=$1', [payload.userId]);
      if (userRes.rows.length) triggeredBy = userRes.rows[0].full_name || userRes.rows[0].username;
    }
  } catch(e) {}
  const result = await executeTestCase(id, triggeredBy);
  res.json(result);
});

// Run ALL test cases sequentially
router.post('/execute-all', async (req, res) => {
  const { environment, ids } = req.body || {};
  let testIds;
  if (ids && Array.isArray(ids)) {
    testIds = ids;
  } else {
    const params = []; let where = '';
    if (environment) { params.push(environment); where = `WHERE environment=$1`; }
    const result = await query(`SELECT id FROM test_cases ${where} ORDER BY sort_order, tc_id`, params);
    testIds = result.rows.map(r => r.id);
  }
  if (!testIds.length) return res.status(400).json({ error: 'No test cases to run' });

  // Run in background, return immediately with job info
  const jobId = uuidv4();
  res.json({ jobId, count: testIds.length, message: 'Execution started. Poll /api/results for progress.' });

  // Execute sequentially in background
  // Get username
  let triggeredBy = 'web-ui';
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'telecom-test-platform-secret-2026');
      const userRes = await query('SELECT username, full_name FROM users WHERE id=$1', [payload.userId]);
      if (userRes.rows.length) triggeredBy = userRes.rows[0].full_name || userRes.rows[0].username;
    }
  } catch(e) {}
  executeBatch(testIds, triggeredBy).catch(err => console.error('Batch execution error:', err));
});

// ================================================================
// RESULTS & REPORTING
// ================================================================

router.get('/results', async (req, res) => {
  const filters = {
    environment:    req.query.environment    || '',
    status:         req.query.status         || '',
    assigned_to:    req.query.assigned_to    || '',
    a_party_handset: req.query.a_party_handset || '',
    b_party_handset: req.query.b_party_handset || '',
    date_from:      req.query.date_from      || '',
    date_to:        req.query.date_to        || '',
  };
  // Remove empty filters
  Object.keys(filters).forEach(k => { if (!filters[k]) delete filters[k]; });
  const rows = await getResultsData(filters);
  res.json(rows);
});

// Project summary for dashboard
router.get('/projects/summary', async (req, res) => {
  const result = await query(`
    SELECT
      p.id, p.name, p.code, p.project_number, p.type, p.status, p.owner_name,
      COUNT(tc.id) AS total_tc,
      COUNT(CASE WHEN tc.status = 'Passed' THEN 1 END) AS passed,
      COUNT(CASE WHEN tc.status = 'Failed' THEN 1 END) AS failed,
      COUNT(CASE WHEN tc.status = 'Blocked' THEN 1 END) AS blocked,
      COUNT(CASE WHEN tc.status = 'Not Run' OR tc.status IS NULL THEN 1 END) AS not_run,
      COUNT(CASE WHEN tc.status = 'Running' THEN 1 END) AS running
    FROM projects p
    LEFT JOIN test_cases tc ON tc.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  res.json(result.rows);
});

// Work type summary (Individual/Project breakdown)
router.get('/test-cases/summary', async (req, res) => {
  const result = await query(`
    SELECT
      COALESCE(work_type, 'Individual') AS work_type,
      COALESCE(test_reason_type, 'BAU') AS test_reason_type,
      COUNT(*) AS total,
      COUNT(CASE WHEN status = 'Passed' THEN 1 END) AS passed,
      COUNT(CASE WHEN status = 'Failed' THEN 1 END) AS failed,
      COUNT(CASE WHEN status = 'Blocked' THEN 1 END) AS blocked,
      COUNT(CASE WHEN status IS NULL OR status = 'Not Run' THEN 1 END) AS not_run
    FROM test_cases
    GROUP BY work_type, test_reason_type
    ORDER BY work_type, test_reason_type
  `);
  res.json(result.rows);
});

router.get('/results/summary', async (req, res) => {
  const result = await query(`
    SELECT status, COUNT(*) as count FROM test_cases GROUP BY status
  `);
  const summary = { Passed: 0, Failed: 0, Blocked: 0, 'Not Run': 0, Running: 0, total: 0 };
  for (const row of result.rows) {
    summary[row.status] = Number(row.count);
    summary.total += Number(row.count);
  }
  res.json(summary);
});

// All executions across all test cases - for Reports page history view
router.get('/executions/all', async (req, res) => {
  const params = [];
  const conditions = [];
  if (req.query.date_from) {
    // Frontend sends UTC string like "2026-06-26 06:25:00"
    params.push(req.query.date_from);
    conditions.push(`e.created_at >= $${params.length}::timestamptz`);
  }
  if (req.query.date_to) {
    params.push(req.query.date_to);
    conditions.push(`e.created_at <= $${params.length}::timestamptz`);
  }
  if (req.query.assigned_to) { params.push(req.query.assigned_to); conditions.push(`tc.assigned_to = $${params.length}`); }
  if (req.query.status)    { params.push(req.query.status);    conditions.push(`e.status = $${params.length}`); }
  if (req.query.environment) { params.push(req.query.environment); conditions.push(`tc.environment = $${params.length}`); }
  if (req.query.a_party_handset) { params.push(req.query.a_party_handset); conditions.push(`tc.a_party_handset_label = $${params.length}`); }
  if (req.query.b_party_handset) { params.push(req.query.b_party_handset); conditions.push(`tc.b_party_handset_label = $${params.length}`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await query(`
    SELECT
      tc.id, tc.tc_id, tc.traceability_label, tc.flow, tc.environment, tc.description,
      tc.a_party_msisdn, tc.a_party_network, tc.a_party_profile, tc.a_party_handset_label,
      tc.b_party_msisdn, tc.b_party_network, tc.b_party_profile, tc.b_party_handset_label,
      tc.exp_call_mo, tc.exp_call_mt, tc.exp_sms, tc.exp_sms_notification, tc.exp_delivery_report,
      tc.assigned_to,
      ha.msisdn AS a_handset_msisdn, hb.msisdn AS b_handset_msisdn,
      e.id AS execution_id,
      e.actual_call_mo, e.actual_call_mt, e.actual_sms,
      e.actual_sms_notification, e.actual_delivery_report,
      e.status, e.failure_reason, e.duration_ms,
      e.created_at AS executed_at,
      e.triggered_by
    FROM executions e
    JOIN test_cases tc ON tc.id = e.test_case_id
    LEFT JOIN handsets ha ON ha.label = tc.a_party_handset_label
    LEFT JOIN handsets hb ON hb.label = tc.b_party_handset_label
    ${where}
    ORDER BY e.created_at DESC
    LIMIT 500
  `, params);
  res.json(result.rows);
});

router.get('/executions/:testCaseId', async (req, res) => {
  const result = await query(
    `SELECT e.*, ev.evidence_type, ev.file_path
     FROM executions e
     LEFT JOIN evidence ev ON ev.execution_id = e.id
     WHERE e.test_case_id = $1
     ORDER BY e.created_at DESC`,
    [req.params.testCaseId]
  );
  res.json(result.rows);
});

// Export Excel
router.get('/export/excel', async (req, res) => {
  const filters = {};
  ['environment','status','assigned_to','a_party_handset','b_party_handset','date_from','date_to']
    .forEach(k => { if (req.query[k]) filters[k] = req.query[k]; });
  // Use all_executions mode when date filter is set, otherwise latest per TC
  filters.mode = (filters.date_from || filters.date_to) ? 'all' : 'latest';
  const wb = await exportToExcel(filters);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="telecom-test-results-${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// Export CSV
router.get('/export/csv', async (req, res) => {
  const filters = {};
  ['environment','status','assigned_to','a_party_handset','b_party_handset','date_from','date_to']
    .forEach(k => { if (req.query[k]) filters[k] = req.query[k]; });
  filters.mode = (filters.date_from || filters.date_to) ? 'all' : 'latest';
  const csv = await exportToCsv(filters);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="telecom-test-results-${Date.now()}.csv"`);
  res.send(csv);
});

// ── ADB Session Setup ─────────────────────────────────────────────────────────
router.post('/handsets/adb/start-session', async (req, res) => {
  const { execFileSync } = require('child_process');
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  const ADB = process.env.ADB_PATH || 'adb';
  const results = [];

  const agentPortMap = {A:8765,B:8766,C:8767,D:8768,E:8769,F:8770};
  const wifiPortMap  = {A:5555,B:5556,C:5557,D:5558,E:5559,F:5560};

  const apkCandidates = [
    path.join(process.cwd(), 'app-debug.apk'),
    path.join(process.cwd(), '..', 'app-debug.apk'),
    path.join(process.cwd(), '..', 'telecom-agent-apk', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  ];
  const apkPath = apkCandidates.find(p => fs.existsSync(p)) || null;

  function run(args, ms=12000) {
    try {
      return execFileSync(ADB, args, {timeout:ms, maxBuffer:2*1024*1024, stdio:['pipe','pipe','pipe']}).toString().trim();
    } catch(e) { return ((e.stdout||'').toString().trim()) || e.message || ''; }
  }

  function log(step, ok, output) {
    results.push({step, ok, output: String(output||'').substring(0,300)});
  }

  async function httpGet(url, ms=5000) {
    return new Promise(resolve => {
      const req = http.get(url, {timeout:ms}, resp => {
        let d=''; resp.on('data',c=>d+=c);
        resp.on('end',()=>{ try{resolve(JSON.parse(d))}catch{resolve(null)} });
      });
      req.on('error',()=>resolve(null));
      req.on('timeout',()=>{req.destroy();resolve(null)});
    });
  }

  // Get MAC address from device
  function getMac(serial) {
    const out = run(['-s', serial, 'shell', 'cat /sys/class/net/wlan0/address'], 5000);
    const mac = (out||'').trim().toLowerCase();
    return mac.match(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/) ? mac : null;
  }

  // Get current WiFi IP from device
  function getIp(serial) {
    // Most reliable: ip route get 8.8.8.8
    const r1 = run(['-s', serial, 'shell', 'ip route get 8.8.8.8'], 6000);
    const m1 = r1.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
    if (m1 && !m1[1].endsWith('.0')) return m1[1];
    // Fallback: ip addr wlan0
    const r2 = run(['-s', serial, 'shell', 'ip addr show wlan0'], 6000);
    for (const m of r2.matchAll(/inet\s+(\d+\.\d+\.\d+\.\d+)\/(\d+)/g)) {
      if (!m[1].endsWith('.0') && !m[1].endsWith('.255') && !m[1].startsWith('169.')) return m[1];
    }
    // Fallback: getprop
    for (const p of ['dhcp.wlan0.ipaddress','net.wlan0.ipaddress']) {
      const r = run(['-s', serial, 'shell', 'getprop '+p], 4000).trim();
      if (r.match(/^\d+\.\d+\.\d+\.\d+$/) && !r.endsWith('.0')) return r;
    }
    return null;
  }

  async function checkApk(agentUrl) {
    const info = await httpGet(agentUrl+'/health');
    return info && info.model ? info : null;
  }

  async function installAndLaunch(serial, label, agentUrl) {
    // Step 1: Try to launch existing install via monkey (fastest, no install needed)
    run(['-s', serial, 'shell', 'monkey -p com.telecom.testagent -c android.intent.category.LAUNCHER 1'], 5000);
    await new Promise(r=>setTimeout(r,2500));
    const c1 = await checkApk(agentUrl);
    if (c1) { log(label+': APK', true, '✓ '+c1.model+' Android '+c1.android_version+' — agent running'); return true; }

    // Step 2: Check if package exists on device (installed but not running)
    // Use short timeout — if it times out, assume installed (safer)
    const pkgCheck = run(['-s', serial, 'shell', 'pm list packages com.telecom.testagent'], 4000);
    const isInstalled = pkgCheck.includes('com.telecom.testagent') || pkgCheck.includes('ETIMEDOUT') || pkgCheck === '';

    if (isInstalled) {
      // App is installed or check timed out — try launching
      run(['-s', serial, 'shell', 'am start -n com.telecom.testagent/.MainActivity'], 5000);
      await new Promise(r=>setTimeout(r,3000));
      const c2 = await checkApk(agentUrl);
      if (c2) {
        log(label+': APK', true, '✓ '+c2.model+' Android '+c2.android_version+' — agent running');
        return true;
      }
      // Still not responding — try monkey launcher
      run(['-s', serial, 'shell', 'monkey -p com.telecom.testagent -c android.intent.category.LAUNCHER 1'], 4000);
      await new Promise(r=>setTimeout(r,2000));
      const c3 = await checkApk(agentUrl);
      log(label+': APK', !!c3, c3
        ? '✓ '+c3.model+' Android '+c3.android_version+' — agent running'
        : 'Open TelecomTestAgent manually on this phone');
      return !!c3;
    }

    // Step 3: APK genuinely not installed — install from file if available
    if (apkPath) {
      log(label+': APK not installed — installing', true, path.basename(apkPath));
      const out = run(['-s', serial, 'install', '-r', apkPath], 30000);
      const ok = out.includes('Success');
      log(label+': APK install', ok, ok ? 'Installed successfully' : out.substring(0,100));
      if (ok) {
        await new Promise(r=>setTimeout(r,2000));
        run(['-s', serial, 'shell', 'monkey -p com.telecom.testagent -c android.intent.category.LAUNCHER 1'], 5000);
        await new Promise(r=>setTimeout(r,3000));
        const c3 = await checkApk(agentUrl);
        log(label+': APK', !!c3, c3 ? '✓ '+c3.model+' Android '+c3.android_version+' — agent running after install' : 'Open TelecomTestAgent manually');
        return !!c3;
      }
    } else {
      log(label+': APK', false, 'TelecomTestAgent not installed. Place app-debug.apk in backend folder to enable auto-install, or install manually.');
    }
    return false;
  }

  // ── SCAN ────────────────────────────────────────────────────────────────────
  const devOut = run(['devices']);
  log('Scan ADB devices', true, devOut);
  const connLines = devOut.split('\n').filter(l=>l.includes('\tdevice'));
  const allDev = connLines.map(l=>l.split('\t')[0].trim());
  const usbDev = allDev.filter(s=>!s.includes(':'));
  const wifiDev = allDev.filter(s=>s.includes(':'));
  log('Found devices', allDev.length>0,
    'USB: ['+( usbDev.join(', ')||'none')+']  WiFi: ['+(wifiDev.join(', ')||'none')+']');

  const {rows: handsets} = await query('SELECT * FROM handsets ORDER BY label');

  // ── STEP 1: USB devices — identify by MAC, enable WiFi, update DB ───────────
  for (const usbSerial of usbDev) {
    const mac = getMac(usbSerial);
    const model = run(['-s', usbSerial, 'shell', 'getprop ro.product.model'], 4000).trim();

    // Match by MAC first, then by exact USB serial
    let hs = mac ? handsets.find(h => h.mac_address && h.mac_address.toLowerCase() === mac) : null;
    if (!hs) hs = handsets.find(h => h.adb_serial === usbSerial);

    if (!hs) {
      log('USB device: '+usbSerial+(model?' ('+model+')':''), false,
        'Not registered. In Handsets page → edit the handset this phone belongs to → set ADB Serial to: '+usbSerial+(mac?' (MAC: '+mac+')':''));
      continue;
    }

    const label = 'Handset '+hs.label+' ('+hs.msisdn+')';
    const wifiPort = wifiPortMap[hs.label]||5555;
    const agentPort = agentPortMap[hs.label]||8765;
    const agentUrl = 'http://localhost:'+agentPort;

    // Save MAC if not saved yet
    if (mac && !hs.mac_address) {
      await query('UPDATE handsets SET mac_address=$1 WHERE label=$2', [mac, hs.label]);
      log(label+': MAC saved', true, mac+' — phone will be auto-identified in future sessions');
    }

    // Enable WiFi ADB
    run(['-s', usbSerial, 'tcpip', String(wifiPort)]);
    log(label+': enable WiFi ADB', true, 'port '+wifiPort);
    await new Promise(r=>setTimeout(r,2500));

    // Get current WiFi IP
    const ip = getIp(usbSerial);
    if (!ip) {
      log(label+': get WiFi IP', false, 'Cannot read IP — ensure phone is on WiFi. Trying USB connection.');
      run(['-s', usbSerial, 'forward', 'tcp:'+agentPort, 'tcp:8765']);
      await installAndLaunch(usbSerial, label, agentUrl);
      continue;
    }

    const wifiSerial = ip+':'+wifiPort;
    const connOut = run(['connect', wifiSerial]);
    log(label+': connect WiFi '+wifiSerial, connOut.includes('connected'), connOut);
    await new Promise(r=>setTimeout(r,1500));

    // Update DB — clear this serial from any other handset first
    await query('UPDATE handsets SET adb_serial=NULL WHERE adb_serial=$1 AND label!=$2', [wifiSerial, hs.label]);
    await query('UPDATE handsets SET adb_serial=$1, agent_url=$2 WHERE label=$3', [wifiSerial, agentUrl, hs.label]);
    log(label+': serial updated', true, 'IP: '+ip+' → saved as '+wifiSerial+' (WiFi — no USB needed next time)');

    run(['-s', wifiSerial, 'forward', 'tcp:'+agentPort, 'tcp:8765']);
    log(label+': forward '+agentPort, true, 'OK');
    await installAndLaunch(wifiSerial, label, agentUrl);
  }

  // ── STEP 2: Process all registered handsets (WiFi) ──────────────────────────
  const {rows: fresh} = await query('SELECT * FROM handsets ORDER BY label');

  for (const h of fresh) {
    const agentPort = agentPortMap[h.label]||8765;
    const agentUrl = h.agent_url||'http://localhost:'+agentPort;
    const label = 'Handset '+h.label+' ('+h.msisdn+')';

    // External receiver
    if (!h.adb_serial && !h.agent_url) {
      log(label+': external receiver', true, '📞 Receiver-only — no ADB or APK needed');
      continue;
    }

    // Already handled as USB above
    if (h.adb_serial && usbDev.includes(h.adb_serial)) continue;

    if (!h.adb_serial) {
      log(label, false, 'No ADB serial. Plug phone in via USB and click Start Session, or edit handset to set serial.');
      continue;
    }

    if (!h.adb_serial.includes(':')) {
      log(label, false, 'USB serial registered but phone not connected. Plug in USB cable and click Start Session.');
      continue;
    }

    // Try MAC-based IP update first — phone may have new IP
    if (h.mac_address) {
      // Scan WiFi devices for matching MAC
      for (const wifiSerial of wifiDev) {
        if (wifiSerial === h.adb_serial) break; // Already correct
        const mac = getMac(wifiSerial);
        if (mac && mac === h.mac_address.toLowerCase()) {
          // Phone found at new IP — update DB
          await query('UPDATE handsets SET adb_serial=NULL WHERE adb_serial=$1 AND label!=$2', [wifiSerial, h.label]);
          await query('UPDATE handsets SET adb_serial=$1 WHERE label=$2', [wifiSerial, h.label]);
          h.adb_serial = wifiSerial;
          log(label+': IP updated via MAC', true, 'New IP: '+wifiSerial);
          break;
        }
      }
    }

    const serial = h.adb_serial;
    const devCheck = run(['devices']);
    const isConnected = devCheck.includes(serial+'\tdevice');

    if (!isConnected) {
      const connOut = run(['connect', serial]);
      const ok = connOut.includes('connected')||connOut.includes('already');
      log(label+': connect '+serial, ok, connOut);
      if (!ok) {
        log(label, false,
          'Cannot reach '+serial+' — IP may have changed. Plug phone via USB and click Start Session to auto-update IP.');
        continue;
      }
      await new Promise(r=>setTimeout(r,1500));
    } else {
      log(label+': already connected', true, serial);
    }

    run(['-s', serial, 'forward', 'tcp:'+agentPort, 'tcp:8765']);
    log(label+': forward '+agentPort, true, 'OK');

    if (agentUrl.includes('localhost')) {
      const apkInfo = await checkApk(agentUrl);
      if (apkInfo) {
        log(label+': APK', true, '✓ '+apkInfo.model+' Android '+apkInfo.android_version+' — agent running');
      } else {
        await installAndLaunch(serial, label, agentUrl);
      }
    }
  }

  const okN = results.filter(r=>r.ok).length;
  res.json({
    ok: okN===results.length, results,
    message: okN===results.length
      ? '✅ All devices ready!'
      : '⚠️ '+okN+'/'+results.length+' OK'+(apkPath?' — APK auto-install enabled':' — Place app-debug.apk in backend folder'),
  });
});



// ================================================================
// MANAGEMENT — Admin only dropdown list configuration
// ================================================================

router.get('/management/lists', async (req, res) => {
  try {
    const result = await query('SELECT * FROM lookup_lists ORDER BY category, sort_order, value');
    const grouped = {};
    result.rows.forEach(r => {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r);
    });
    res.json(grouped);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/management/lists', async (req, res) => {
  try {
    const { category, value, label } = req.body;
    const result = await query(
      `INSERT INTO lookup_lists (category, value, label, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order),0)+1 FROM lookup_lists WHERE category=$1))
       RETURNING *`,
      [category, value, label || value]
    );
    res.status(201).json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/management/lists/:id', async (req, res) => {
  try {
    const { value, label, sort_order, is_active } = req.body;
    const result = await query(
      `UPDATE lookup_lists SET
         value=COALESCE($1,value), label=COALESCE($2,label),
         sort_order=COALESCE($3,sort_order), is_active=COALESCE($4,is_active)
       WHERE id=$5 RETURNING *`,
      [value, label, sort_order, is_active, req.params.id]
    );
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/management/lists/:id', async (req, res) => {
  try {
    await query('DELETE FROM lookup_lists WHERE id=$1', [req.params.id]);
    res.json({ deleted: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── Manual test execution (recorded by tester after manual testing) ──────────
router.post('/test-cases/:id/manual-execution', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, executed_at, notes, triggered_by } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });

    const result = await query(
      `INSERT INTO executions (test_case_id, status, failure_reason, started_at, ended_at, triggered_by)
       VALUES ($1, $2, $3, $4, $4, $5)
       RETURNING *`,
      [id, status, notes || null, executed_at ? new Date(executed_at) : new Date(), triggered_by || 'Manual']
    );

    // Update test case's last status for quick reference
    await query('UPDATE test_cases SET status=$1 WHERE id=$2', [status, id]);

    res.status(201).json(result.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── TCR Report — grouped test run summary with progress ──────────────────────
router.get('/tcr/runs', async (req, res) => {
  try {
    const tcs = await query(`
      SELECT tc.*, p.name as project_name, p.project_number, p.owner_name,
        (SELECT status FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_status,
        (SELECT created_at FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_executed
      FROM test_cases tc
      LEFT JOIN projects p ON p.id = tc.project_id
      ORDER BY tc.created_at DESC
    `);

    // Group by work_ref_number (project) or 'Individual' bucket
    const groups = {};
    tcs.rows.forEach(tc => {
      const key = tc.work_type === 'Project' && tc.work_ref_number
        ? tc.work_ref_number
        : 'individual-' + (tc.assigned_to || 'unassigned');
      if (!groups[key]) {
        groups[key] = {
          key,
          name: tc.work_ref_name || (tc.work_type === 'Project' ? tc.work_ref_number : 'Individual Tasks — ' + (tc.assigned_to||'Unassigned')),
          type: tc.work_type || 'Individual',
          project_number: tc.work_ref_number,
          owner: tc.work_owner || tc.assigned_to || '',
          test_reason_type: tc.test_reason_type,
          cases: [],
        };
      }
      groups[key].cases.push(tc);
    });

    const runs = Object.values(groups).map(g => {
      const total = g.cases.length;
      const passed = g.cases.filter(c => (c.last_status||c.status) === 'Passed').length;
      const failed = g.cases.filter(c => (c.last_status||c.status) === 'Failed').length;
      const blocked = g.cases.filter(c => (c.last_status||c.status) === 'Blocked').length;
      const notRun = g.cases.filter(c => !c.last_status || c.last_status === 'Not Run').length;
      const inProgress = g.cases.filter(c => c.last_status === 'In-Progress').length;
      const na = g.cases.filter(c => c.last_status === 'N/A').length;
      const executed = passed + failed + blocked + na;
      const lastActivity = g.cases.reduce((max, c) => {
        const t = c.last_executed ? new Date(c.last_executed).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      const status = executed === total ? 'Completed' : (executed > 0 ? 'In Progress' : 'Not Started');

      return {
        key: g.key,
        name: g.name,
        type: g.type,
        project_number: g.project_number,
        owner: g.owner,
        test_reason_type: g.test_reason_type,
        status,
        total, passed, failed, blocked, notRun, inProgress, na, executed,
        progressPct: total > 0 ? Math.round((executed/total)*100) : 0,
        lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
      };
    });

    runs.sort((a,b) => (b.lastActivity||'').localeCompare(a.lastActivity||''));

    const overall = {
      activeRuns: runs.filter(r => r.status === 'In Progress').length,
      totalPassed: runs.reduce((s,r) => s+r.passed, 0),
      totalFailed: runs.reduce((s,r) => s+r.failed, 0),
      totalBlocked: runs.reduce((s,r) => s+r.blocked, 0),
    };

    res.json({ runs, overall });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── TCR Report — detailed results for one run ─────────────────────────────────
router.get('/tcr/runs/:key/details', async (req, res) => {
  try {
    const key = req.params.key;
    let tcs;
    if (key.startsWith('individual-')) {
      const assignee = key.replace('individual-', '');
      tcs = await query(`
        SELECT tc.*,
          (SELECT status FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_status,
          (SELECT failure_reason FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_failure_reason,
          (SELECT created_at FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_executed,
          (SELECT triggered_by FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_triggered_by
        FROM test_cases tc
        WHERE tc.work_type != 'Project' AND COALESCE(tc.assigned_to,'unassigned') = $1
        ORDER BY tc.created_at DESC
      `, [assignee === 'unassigned' ? null : assignee]);
    } else {
      tcs = await query(`
        SELECT tc.*,
          (SELECT status FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_status,
          (SELECT failure_reason FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_failure_reason,
          (SELECT created_at FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_executed,
          (SELECT triggered_by FROM executions e WHERE e.test_case_id=tc.id ORDER BY e.created_at DESC LIMIT 1) as last_triggered_by
        FROM test_cases tc
        WHERE tc.work_ref_number = $1
        ORDER BY tc.created_at DESC
      `, [key]);
    }
    res.json(tcs.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


module.exports = router;
