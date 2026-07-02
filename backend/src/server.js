require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const { router: authRoutes } = require('./routes/auth');
const { errorHandler, notFound } = require('./middleware/errors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

// API routes
app.use('/api', authRoutes);
app.use('/api', apiRoutes);

// Serve frontend build — works in both development and production
// Searches several possible locations for the built frontend files
const possibleFrontendPaths = [
  path.join(__dirname, '..', '..', 'frontend', 'dist'),        // from backend/
  path.join(__dirname, '..', '..', '..', 'frontend', 'dist'),  // from root
  path.join(process.cwd(), 'frontend', 'dist'),                 // from cwd
  path.join(process.cwd(), '..', 'frontend', 'dist'),          // one level up
];

const frontendDist = possibleFrontendPaths.find(p => {
  try { return fs.existsSync(path.join(p, 'index.html')); } catch { return false; }
});

if (frontendDist) {
  console.log(`Serving frontend from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.log('Frontend not built yet.');
  console.log('To build: cd ../frontend && npm install && npm run build');
  console.log('Then restart this server.');
  // Show a helpful page at / instead of a 404
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html><html><head><title>Telecom Test Platform</title>
      <style>body{font-family:sans-serif;max-width:600px;margin:60px auto;padding:20px;background:#f0f4f8;}
      h1{color:#1a3a4e;} code{background:#e2e8f0;padding:4px 8px;border-radius:4px;font-size:14px;}
      .step{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;}
      </style></head><body>
      <h1>Telecom Test Platform — Backend Running ✅</h1>
      <p>The API is running. To see the full dashboard, build the frontend first:</p>
      <div class="step"><strong>Step 1</strong> — Open a new PowerShell window:<br><br>
      <code>cd ..\frontend</code><br>
      <code>npm install</code><br>
      <code>npm run build</code>
      </div>
      <div class="step"><strong>Step 2</strong> — Restart the backend (Ctrl+C then npm run dev)</div>
      <div class="step"><strong>Step 3</strong> — Open <a href="http://localhost:4000">http://localhost:4000</a></div>
      <p>API is available at <a href="/api/results/summary">/api/results/summary</a></p>
      </body></html>
    `);
  });
}

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

// ── ADB Keep-Alive ───────────────────────────────────────────────────────────
// Silently maintains WiFi ADB connections. No screen wake. No screenshots.
const { execFileSync: _adbExec } = require('child_process');
function _adb(args, timeout=5000) {
  try { return _adbExec(process.env.ADB_PATH || 'adb', args, { timeout, maxBuffer:1024*1024 }).toString().trim(); }
  catch(e) { return (e.stdout||'').toString().trim(); }
}
async function adbKeepAlive() {
  try {
    const { query: _q } = require('./db/pool');
    // Only WiFi serials need reconnection; USB serials are always connected
    const hs = await _q("SELECT label, adb_serial, agent_url FROM handsets WHERE adb_serial LIKE '%:%'");
    if (!hs.rows.length) return;
    const devices = _adb(['devices']);
    const fwds = _adb(['forward', '--list']);
    const portMap = {A:8765,B:8766,C:8767,D:8768,E:8769,F:8770};
    for (const h of hs.rows) {
      const port = portMap[h.label] || 8765;
      const isConnected = devices.includes(h.adb_serial + '\tdevice');
      // Reconnect if dropped — short timeout to avoid blocking
      if (!isConnected) {
        const r = _adb(['connect', h.adb_serial], 5000);
        if (r.includes('connected')) console.log(`[ADB] Reconnected ${h.label} ${h.adb_serial}`);
        else continue; // Skip port forward if can't connect
      }
      // Restore port forward if missing
      if (!fwds.includes(`tcp:${port} tcp:`)) {
        _adb(['-s', h.adb_serial, 'forward', `tcp:${port}`, 'tcp:8765'], 5000);
      }
    }
  } catch(e) { /* never crash server */ }
}
setTimeout(() => { adbKeepAlive(); setInterval(adbKeepAlive, 30000); }, 10000);
console.log('[ADB-KeepAlive] Started — silent reconnect every 30s');

app.listen(PORT, () => {
  console.log(`\nTelecom Test Platform running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`API:    http://localhost:${PORT}/api\n`);
});

module.exports = app;
