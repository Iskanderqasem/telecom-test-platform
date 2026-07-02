const { execFile } = require('child_process');
const ADB = process.env.ADB_PATH || 'adb';

function adb(serial, args) {
  const full = serial ? ['-s', serial, ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(ADB, full, { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`adb ${full.join(' ')}: ${stderr || err.message}`));
      resolve(stdout);
    });
  });
}

async function listDevices() {
  const out = await adb(null, ['devices']);
  return out.split('\n').slice(1)
    .filter(l => l.trim().endsWith('\tdevice'))
    .map(l => l.split('\t')[0]);
}

async function isConnected(serial) {
  const devices = await listDevices().catch(() => []);
  return devices.includes(serial);
}

// Call state: IDLE=0, RINGING=1, OFFHOOK=2
async function getCallState(serial) {
  const out = await adb(serial, ['shell', 'dumpsys', 'telephony.registry']);
  const m = out.match(/mCallState=(\d+)/);
  if (!m) return 'UNKNOWN';
  return { 0: 'IDLE', 1: 'RINGING', 2: 'OFFHOOK' }[Number(m[1])] || 'UNKNOWN';
}

async function dialCall(serial, number) {
  await adb(serial, ['shell', 'am', 'start', '-a', 'android.intent.action.CALL', '-d', `tel:${number}`]);
}

async function endCall(serial) {
  await adb(serial, ['shell', 'input', 'keyevent', 'KEYCODE_ENDCALL']);
}

async function answerCall(serial) {
  await adb(serial, ['shell', 'input', 'keyevent', 'KEYCODE_CALL']);
}

async function sendSms(serial, number, text) {
  await adb(serial, ['shell', 'am', 'start',
    '-a', 'android.intent.action.SENDTO',
    '-d', `smsto:${number}`,
    '--es', 'sms_body', text,
    '--ez', 'exit_on_sent', 'true']);
}

async function readSmsInbox(serial, limit = 5) {
  const out = await adb(serial, ['shell', 'content', 'query',
    '--uri', 'content://sms/inbox',
    '--sort', 'date DESC',
    '--projection', 'address:body:date']).catch(() => '');
  return out.split('\n').filter(l => l.trim().startsWith('Row:')).slice(0, limit);
}

async function clearLogcat(serial) {
  await adb(serial, ['shell', 'logcat', '-c']);
}

async function getLogcat(serial, lines = 500) {
  return adb(serial, ['shell', 'logcat', '-d', '-t', String(lines)]);
}

async function screenshot(serial, outPath) {
  const tmp = '/sdcard/_telecom_test_screenshot.png';
  await adb(serial, ['shell', 'screencap', '-p', tmp]);
  await adb(serial, ['pull', tmp, outPath]);
  await adb(serial, ['shell', 'rm', tmp]);
  return outPath;
}

module.exports = {
  adb, listDevices, isConnected,
  getCallState, dialCall, endCall, answerCall,
  sendSms, readSmsInbox,
  clearLogcat, getLogcat, screenshot
};
