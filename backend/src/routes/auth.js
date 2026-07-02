/**
 * Auth & User Management Routes
 * POST /auth/login
 * POST /auth/logout
 * GET  /auth/me
 * GET  /users           (admin only)
 * POST /users           (admin only)
 * PATCH /users/:id      (admin only)
 * DELETE /users/:id     (admin only)
 * GET  /projects
 * POST /projects        (admin only)
 * PATCH /projects/:id   (admin only)
 * POST /projects/:id/access  (admin only - grant user access)
 * DELETE /projects/:id/access/:userId (admin only)
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db/pool');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'telecom-test-platform-secret-2026';
const SALT_ROUNDS = 10;

// ── Middleware ─────────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await query('SELECT * FROM users WHERE id=$1 AND is_active=true', [payload.userId]);
    if (!result.rows.length) return res.status(401).json({ error: 'User not found or inactive' });
    req.user = result.rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── AUTH ───────────────────────────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const result = await query(
    'SELECT * FROM users WHERE (username=$1 OR email=$1) AND is_active=true',
    [username]
  );
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    }
  });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, username: u.username, email: u.email, full_name: u.full_name, role: u.role });
});

router.post('/auth/logout', requireAuth, async (req, res) => {
  res.json({ ok: true });
});

// ── USERS (admin only) ────────────────────────────────────────────────────────
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const result = await query(
    'SELECT id,username,email,full_name,role,is_active,created_at FROM users ORDER BY created_at DESC'
  );
  res.json(result.rows);
});

router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, email, password, full_name, role } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email, password required' });

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await query(
    `INSERT INTO users (username, email, password_hash, full_name, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING id,username,email,full_name,role,is_active,created_at`,
    [username, email, hash, full_name || username, role || 'tester']
  );
  res.status(201).json(result.rows[0]);
});

router.patch('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { full_name, role, is_active, password } = req.body;
  const updates = []; const params = [];

  if (full_name !== undefined) { params.push(full_name); updates.push(`full_name=$${params.length}`); }
  if (role !== undefined)      { params.push(role);       updates.push(`role=$${params.length}`); }
  if (is_active !== undefined) { params.push(is_active);  updates.push(`is_active=$${params.length}`); }
  if (password) {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    params.push(hash);
    updates.push(`password_hash=$${params.length}`);
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  const result = await query(
    `UPDATE users SET ${updates.join(',')} WHERE id=$${params.length} RETURNING id,username,email,full_name,role,is_active`,
    params
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ deleted: true });
});

// ── PROJECTS ───────────────────────────────────────────────────────────────────
router.get('/projects', requireAuth, async (req, res) => {
  let result;
  if (req.user.role === 'admin') {
    result = await query(`
      SELECT p.*, u.full_name AS created_by_name,
        COUNT(DISTINCT tc.id) AS test_case_count,
        COUNT(DISTINCT up.user_id) AS member_count
      FROM projects p
      LEFT JOIN users u ON u.id = p.created_by
      LEFT JOIN test_cases tc ON tc.project_id = p.id
      LEFT JOIN user_projects up ON up.project_id = p.id
      GROUP BY p.id, u.full_name
      ORDER BY p.created_at DESC
    `);
  } else {
    result = await query(`
      SELECT p.*, u.full_name AS created_by_name,
        COUNT(DISTINCT tc.id) AS test_case_count
      FROM projects p
      JOIN user_projects up ON up.project_id = p.id AND up.user_id = $1
      LEFT JOIN users u ON u.id = p.created_by
      LEFT JOIN test_cases tc ON tc.project_id = p.id
      GROUP BY p.id, u.full_name
      ORDER BY p.created_at DESC
    `, [req.user.id]);
  }
  res.json(result.rows);
});

router.post('/projects', requireAuth, requireAdmin, async (req, res) => {
  const { name, code, type, description, status } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  const result = await query(
    `INSERT INTO projects (name,code,type,description,status,created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, code.toUpperCase(), type || 'BAU', description, status || 'Active', req.user.id]
  );
  res.status(201).json(result.rows[0]);
});

router.patch('/projects/:id', requireAuth, requireAdmin, async (req, res) => {
  const fields = ['name','code','type','description','status'];
  const updates = []; const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { params.push(req.body[f]); updates.push(`${f}=$${params.length}`); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  const result = await query(
    `UPDATE projects SET ${updates.join(',')} WHERE id=$${params.length} RETURNING *`, params
  );
  res.json(result.rows[0]);
});

// Grant user access to project
router.post('/projects/:id/access', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, role } = req.body;
  await query(
    `INSERT INTO user_projects (user_id,project_id,role,granted_by)
     VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,project_id) DO UPDATE SET role=$3`,
    [user_id, req.params.id, role || 'tester', req.user.id]
  );
  res.json({ ok: true });
});

// Revoke user access
router.delete('/projects/:id/access/:userId', requireAuth, requireAdmin, async (req, res) => {
  await query('DELETE FROM user_projects WHERE project_id=$1 AND user_id=$2',
    [req.params.id, req.params.userId]);
  res.json({ ok: true });
});

// Get project members
router.get('/projects/:id/members', requireAuth, async (req, res) => {
  const result = await query(`
    SELECT u.id,u.username,u.full_name,u.email,u.role AS system_role,
           up.role AS project_role, up.granted_at
    FROM user_projects up
    JOIN users u ON u.id = up.user_id
    WHERE up.project_id=$1
    ORDER BY u.full_name
  `, [req.params.id]);
  res.json(result.rows);
});

// ── System Update — Admin only ────────────────────────────────────────────────
router.post('/system/update', requireAuth, requireAdmin, async (req, res) => {
  const { execSync } = require('child_process');
  const path = require('path');
  const fs = require('fs');
  const steps = [];

  function run(cmd, label, opts={}) {
    try {
      const out = execSync(cmd, { timeout: 60000, maxBuffer: 5*1024*1024, ...opts }).toString().trim();
      steps.push({ step: label, ok: true, output: out.substring(0, 300) || 'OK' });
      return out;
    } catch(e) {
      const out = (e.stdout||'').toString().trim() || e.message;
      steps.push({ step: label, ok: false, output: out.substring(0, 300) });
      return null;
    }
  }

  try {
    const rootDir = path.join(__dirname, '..', '..', '..');

    // Check if git repo exists
    const hasGit = fs.existsSync(path.join(rootDir, '.git'));

    if (hasGit) {
      // Auto-configure git remote — token must be set as GITHUB_TOKEN env var
      const ghToken = process.env.GITHUB_TOKEN;
      if (ghToken) {
        const repoUrl = `https://x-access-token:${ghToken}@github.com/Iskanderqasem/telecom-test-platform.git`;
        try { require('child_process').execSync(`git remote set-url origin "${repoUrl}"`, {cwd:rootDir}); } catch(e) {
          try { require('child_process').execSync(`git remote add origin "${repoUrl}"`, {cwd:rootDir}); } catch(e2) {}
        }
        steps.push({step:'Configure GitHub remote', ok:true, output:'Remote configured with token'});
      }
      // Git pull latest code
      run('git fetch origin', 'Fetch latest from GitHub', { cwd: rootDir });
      run('git reset --hard origin/main', 'Pull latest code', { cwd: rootDir });
    } else {
      steps.push({ step: 'Git check', ok: false, output: 'No git repo found — running in standalone mode' });
    }

    // Install any new dependencies
    const backendDir = path.join(rootDir, 'backend');
    run('npm install --production', 'Install dependencies', { cwd: backendDir });

    // Run migrations
    run('node scripts/migrate.js', 'Run database migrations', { cwd: backendDir });

    const allOk = steps.every(s => s.ok);

    res.json({
      ok: allOk,
      steps,
      message: allOk
        ? '✅ Update complete! Restart the server to apply changes.'
        : '⚠️ Update completed with some warnings. Check steps below.',
      needsRestart: hasGit,
    });

    // Auto-restart server after 2 seconds if on Render or if requested
    if (req.body.autoRestart) {
      setTimeout(() => {
        console.log('[SYSTEM] Restarting server after update...');
        process.exit(0); // nodemon/Render will restart automatically
      }, 2000);
    }

  } catch(e) {
    res.status(500).json({ ok: false, steps, error: e.message });
  }
});

// ── System Status ─────────────────────────────────────────────────────────────
router.get('/system/status', requireAuth, requireAdmin, async (req, res) => {
  const { execSync } = require('child_process');
  const path = require('path');
  const fs = require('fs');
  const rootDir = path.join(__dirname, '..', '..', '..');

  let gitStatus = { hasGit: false, branch: '', lastCommit: '', ahead: false };
  try {
    if (fs.existsSync(path.join(rootDir, '.git'))) {
      gitStatus.hasGit = true;
      gitStatus.branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir }).toString().trim();
      gitStatus.lastCommit = execSync('git log -1 --format="%h %s %ai"', { cwd: rootDir }).toString().trim();
      try {
        execSync('git fetch origin --dry-run', { cwd: rootDir, timeout: 5000 });
        const diff = execSync('git rev-list HEAD..origin/main --count', { cwd: rootDir }).toString().trim();
        gitStatus.commitsAvailable = parseInt(diff) || 0;
      } catch { gitStatus.commitsAvailable = 0; }
    }
  } catch(e) { gitStatus.error = e.message; }

  res.json({
    version: process.env.npm_package_version || 'v67',
    nodeVersion: process.version,
    platform: process.platform,
    uptime: Math.round(process.uptime()),
    env: process.env.NODE_ENV || 'development',
    git: gitStatus,
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
  });
});


module.exports = { router, requireAuth, requireAdmin };
