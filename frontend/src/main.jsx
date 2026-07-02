import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// ── API client ──────────────────────────────────────────────────────────────
const API = '/api';

function getToken() { return localStorage.getItem('auth_token'); }
function setToken(t) { if (t) localStorage.setItem('auth_token', t); else localStorage.removeItem('auth_token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('auth_user') || 'null'); } catch { return null; } }
function setUser(u) { if (u) localStorage.setItem('auth_user', JSON.stringify(u)); else localStorage.removeItem('auth_user'); }

async function api(path, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
      ...opts,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === 'AbortError' ? 'Request timed out — click Refresh to check results.' : e.message);
  }
  clearTimeout(timer);
  if (res.status === 401) {
    setToken(null); setUser(null);
    window.location.reload();
    return;
  }
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Styles ──────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f0f4f8; color: #1a202c; font-size: 14px; }

  .layout { display: flex; min-height: 100vh; }

  /* Sidebar */
  .sidebar { width: 220px; background: #1a3a4e; color: #e2e8f0; display: flex; flex-direction: column; position: relative;
             flex-direction: column; flex-shrink: 0; }
  .sidebar-logo { padding: 20px 16px 16px; border-bottom: 1px solid #2d5a6e; }
  .sidebar-logo h1 { font-size: 13px; font-weight: 700; color: #63b3ed; line-height: 1.4; }
  .sidebar-logo p { font-size: 11px; color: #90a4ae; margin-top: 4px; }
  .sidebar nav { padding: 12px 8px; flex: 1; }
  .nav-btn { display: block; width: 100%; text-align: left; padding: 10px 12px;
             border-radius: 8px; border: none; background: none; color: #b0bec5;
             cursor: pointer; font-size: 13px; margin-bottom: 2px; }
  .nav-btn:hover, .nav-btn.active { background: #2d5a6e; color: #fff; }
  .nav-btn.active { background: #2563eb; color: #fff; font-weight: 600; }

  /* Main */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .topbar { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 12px 24px;
            display: flex; align-items: center; justify-content: space-between; }
  .topbar h2 { font-size: 18px; font-weight: 700; color: #1a3a4e; }
  .topbar-actions { display: flex; gap: 8px; }
  .page { padding: 20px 24px; overflow-y: auto; flex: 1; }

  /* Cards */
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
          padding: 16px; margin-bottom: 16px; }
  .card h3 { font-size: 14px; font-weight: 700; color: #1a3a4e; margin-bottom: 12px; }

  /* Buttons */
  .btn { padding: 8px 16px; border-radius: 7px; border: none; cursor: pointer;
         font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
  .btn-primary { background: #2563eb; color: #fff; }
  .btn-primary:hover { background: #1d4ed8; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-success:hover { background: #15803d; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-danger:hover { background: #b91c1c; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-warning:hover { background: #b45309; }
  .btn-secondary { background: #e2e8f0; color: #374151; }
  .btn-secondary:hover { background: #cbd5e1; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Stat cards */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
  .stat { border-radius: 10px; padding: 16px; text-align: center; }
  .stat .num { font-size: 28px; font-weight: 800; }
  .stat .lbl { font-size: 11px; font-weight: 600; text-transform: uppercase;
               letter-spacing: 0.04em; margin-top: 4px; }
  .stat.passed { background: #dcfce7; } .stat.passed .num { color: #16a34a; }
  .stat.failed  { background: #fee2e2; } .stat.failed .num  { color: #dc2626; }
  .stat.blocked { background: #fef3c7; } .stat.blocked .num { color: #d97706; }
  .stat.notrun  { background: #f1f5f9; } .stat.notrun .num  { color: #64748b; }
  .stat.total   { background: #dbeafe; } .stat.total .num   { color: #2563eb; }

  /* Results table — matches spreadsheet layout */
  .results-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1a3a4e; color: #fff; padding: 8px 6px; text-align: center;
       white-space: nowrap; border: 1px solid #2d5a6e; font-size: 11px; }
  th.group-a { background: #2563eb; }
  th.group-b { background: #7c3aed; }
  th.group-exp { background: #065f46; }
  th.group-assign { background: #92400e; }
  td { padding: 7px 6px; border: 1px solid #e2e8f0; text-align: center; vertical-align: middle; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr:hover td { background: #eff6ff; }
  td.desc { text-align: left; max-width: 200px; }
  td.left { text-align: left; }

  /* Status badges */
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px;
           font-size: 11px; font-weight: 700; white-space: nowrap; }
  .badge-passed   { background: #dcfce7; color: #15803d; }
  .badge-failed   { background: #fee2e2; color: #b91c1c; }
  .badge-blocked  { background: #fef3c7; color: #92400e; }
  .badge-running  { background: #dbeafe; color: #1d4ed8; }
  .badge-notrun   { background: #f1f5f9; color: #475569; }
  .badge-y        { background: #dcfce7; color: #15803d; }
  .badge-n        { background: #f1f5f9; color: #64748b; }
  .badge-err      { background: #fee2e2; color: #b91c1c; }

  /* Forms */
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .form-full { grid-column: 1 / -1; }
  label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 4px; }
  input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
    border-radius: 7px; font-size: 13px; color: #1a202c; background: #fff; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
  textarea { min-height: 70px; resize: vertical; }
  .form-section { font-size: 12px; font-weight: 700; color: #2563eb; text-transform: uppercase;
                  letter-spacing: 0.06em; margin: 14px 0 8px; border-bottom: 2px solid #dbeafe;
                  padding-bottom: 4px; }
  .yn-row { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
  .yn-field { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
  .yn-field select { width: 70px; padding: 6px; }
  .error { background: #fee2e2; border: 1px solid #fca5a5; color: #b91c1c; padding: 10px 14px;
           border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
  .success { background: #dcfce7; border: 1px solid #86efac; color: #15803d; padding: 10px 14px;
             border-radius: 8px; margin-bottom: 12px; font-size: 13px; }
  .muted { color: #94a3b8; font-size: 12px; }
  .running-row td { background: #dbeafe !important; }
  .failed-row td { background: #fff5f5 !important; }
  .passed-row td { background: #f0fdf4 !important; }
  .action-cell { display: flex; gap: 4px; justify-content: center; }
  .failure-text { font-size: 11px; color: #b91c1c; font-style: italic; }
  .import-area { border: 2px dashed #cbd5e1; border-radius: 10px; padding: 24px;
                 text-align: center; color: #64748b; }
  .tabs { display: flex; gap: 4px; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px; }
  .tab { padding: 8px 16px; border-radius: 7px 7px 0 0; border: none; background: none;
         cursor: pointer; font-size: 13px; font-weight: 600; color: #64748b; }
  .tab.active { background: #2563eb; color: #fff; }
  .device-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
  .dot-green { background: #16a34a; }
  .dot-red { background: #dc2626; }
  .dot-gray { background: #94a3b8; }
`;

// ── Helpers ─────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const cls = {
    'Passed': 'badge badge-passed', 'Failed': 'badge badge-failed',
    'Blocked': 'badge badge-blocked', 'Running': 'badge badge-running',
    'Not Run': 'badge badge-notrun', 'Error': 'badge badge-err',
    'Y': 'badge badge-y', 'N': 'badge badge-n',
  }[status] || 'badge badge-notrun';
  return <span className={cls}>{status || '—'}</span>;
}

function ResultCell({ expected, actual }) {
  if (!actual || actual === 'N/A') return <span className="muted">{expected || '—'}</span>;
  const pass = actual === expected;
  return <span className={`badge ${pass ? 'badge-y' : 'badge-err'}`}>{actual}</span>;
}

// ── Pages ───────────────────────────────────────────────────────────────────

// Dashboard / Results
function DashboardPage() {
  const [summary, setSummary]     = useState({ Passed:0, Failed:0, Blocked:0, 'Not Run':0, total:0 });
  const [allCases, setAllCases]   = useState([]);
  const [projects, setProjects]   = useState([]);
  const [searched, setSearched]   = useState(false);
  const [running, setRunning]     = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [error, setError]         = useState(null);
  const [manualFor, setManualFor] = useState(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Filters — stored in state, applied at render time (no stale closure)
  const [fEnv,       setFEnv]       = useState('');
  const [fWork,      setFWork]      = useState('');
  const [fProject,   setFProject]   = useState('');
  const [fReason,    setFReason]    = useState('');
  const [fReasonRef, setFReasonRef] = useState('');
  const [fAssignee,  setFAssignee]  = useState('');

  // Derive filtered list at render time — always fresh, no stale closure
  const filtered = searched ? allCases.filter(r => {
    const wt = r.work_type === 'Project' ? 'Project' : 'Individual';
    if (fEnv     && r.environment !== fEnv) return false;
    if (fWork    && wt !== fWork) return false;
    if (fProject && r.work_ref_number !== fProject) return false;
    if (fReason  && r.test_reason_type !== fReason) return false;
    if (fReasonRef && r.test_reason_ref !== fReasonRef) return false;
    if (fAssignee && !(r.assigned_to||'').toLowerCase().includes(fAssignee.toLowerCase())) return false;
    return true;
  }) : [];

  const loadData = useCallback(async () => {
    try {
      const [sum, tcs, projs] = await Promise.all([
        api('/results/summary'),
        api('/test-cases'),
        api('/projects').catch(() => []),
      ]);
      setSummary(sum);
      setAllCases(tcs);
      // Build project list from test cases with work_type=Project
      const pm = {};
      tcs.forEach(r => {
        if (r.work_type === 'Project' && r.work_ref_number)
          pm[r.work_ref_number] = r.work_ref_name || r.work_ref_number;
      });
      (projs||[]).forEach(p => {
        const k = p.project_number || p.code;
        if (k && !pm[k]) pm[k] = p.name;
      });
      setProjects(Object.entries(pm).map(([code,name]) => ({code,name})));
    } catch(e) { setError(e.message); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const clearFilters = () => {
    setFEnv(''); setFWork(''); setFProject(''); setFReason(''); setFReasonRef(''); setFAssignee('');
    setSearched(false);
  };

  async function runAll() {
    const toRun = searched ? filtered : allCases;
    if (!toRun.length) return setError('No test cases to run.');
    if (!confirm(`Run ${toRun.length} test case(s)?`)) return;
    setRunning(true); setError(null);
    try {
      await api('/execute-all', { method:'POST', body: JSON.stringify({ ids: toRun.map(r=>r.id).filter(Boolean) }) });
      const poll = setInterval(async () => {
        const [sum, tcs] = await Promise.all([api('/results/summary'), api('/test-cases')]);
        setSummary(sum); setAllCases(tcs);
        if (!tcs.some(r => r.status === 'Running')) { clearInterval(poll); setRunning(false); }
      }, 3000);
    } catch(e) { setError(e.message); setRunning(false); }
  }

  async function runOne(id) {
    setRunningId(id); setError(null);
    try {
      await api(`/execute/${id}`, { method:'POST' });
      const [sum, tcs] = await Promise.all([api('/results/summary'), api('/test-cases')]);
      setSummary(sum); setAllCases(tcs);
    } catch(e) { setError(e.message); }
    finally { setRunningId(null); }
  }

  async function resetAll() {
    if (!confirm('Reset all to Not Run?')) return;
    await api('/test-cases/reset-all', { method:'POST' });
    setSearched(false); loadData();
  }

  const reasonRefs = fReason
    ? [...new Set(allCases.filter(r => r.test_reason_type === fReason && r.test_reason_ref).map(r => r.test_reason_ref))]
    : [];

  const hasFilters = fEnv||fWork||fProject||fReason||fReasonRef||fAssignee;

  const badge = (exp, act) => {
    if (!act || act === 'N/A') return <span style={{color:'#9ca3af',fontSize:12}}>—</span>;
    const ok = act === exp || (exp==='N' && act==='Y');
    return <span style={{background:ok?'#dcfce7':'#fee2e2',color:ok?'#16a34a':'#dc2626',
      padding:'2px 6px',borderRadius:4,fontWeight:700,fontSize:11}}>{act}</span>;
  };

  return (
    <div className="page">
      {error && <div className="error" onClick={()=>setError(null)} style={{cursor:'pointer'}}>{error} ✕</div>}

      {/* Filter Panel */}
      <div className="card" style={{marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,color:'#1F4E5F',marginBottom:12}}>🔍 Filter Test Cases <span style={{fontSize:10,color:'#94a3b8'}}>v46</span></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))',gap:10,marginBottom:12}}>

          <div><label style={{fontSize:11,fontWeight:600,color:'#64748b',display:'block',marginBottom:4}}>ENVIRONMENT</label>
            <select value={fEnv} onChange={e=>setFEnv(e.target.value)}
              style={{width:'100%',padding:'7px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:13}}>
              <option value="">All</option>
              <option value="Prod">Prod</option>
              <option value="Preprod">Preprod</option>
            </select></div>

          <div><label style={{fontSize:11,fontWeight:600,color:'#64748b',display:'block',marginBottom:4}}>WORK TYPE</label>
            <select value={fWork} onChange={e=>{setFWork(e.target.value);setFProject('');}}
              style={{width:'100%',padding:'7px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:13}}>
              <option value="">All</option>
              <option value="Project">📁 Project</option>
              <option value="Individual">👤 Individual</option>
            </select></div>

          <div style={{opacity:fWork==='Individual'?0.35:1,pointerEvents:fWork==='Individual'?'none':'auto'}}>
            <label style={{fontSize:11,fontWeight:600,color:'#1d4ed8',display:'block',marginBottom:4}}>PROJECT</label>
            <select value={fProject} onChange={e=>setFProject(e.target.value)}
              style={{width:'100%',padding:'7px 8px',borderRadius:6,fontSize:13,
                border:fProject?'2px solid #2563eb':'1px solid #d1d5db',
                fontWeight:fProject?700:400,color:fProject?'#1d4ed8':'inherit'}}>
              <option value="">All Projects</option>
              {projects.map(p=><option key={p.code} value={p.code}>{p.code} — {p.name}</option>)}
            </select></div>

          <div><label style={{fontSize:11,fontWeight:600,color:'#64748b',display:'block',marginBottom:4}}>REASON TYPE</label>
            <select value={fReason} onChange={e=>{setFReason(e.target.value);setFReasonRef('');}}
              style={{width:'100%',padding:'7px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:13}}>
              <option value="">All</option>
              {['CR','Regression','Confirmation','Pre-test','Post-test','Sanity','BAU','Other'].map(t=>
                <option key={t} value={t}>{t}</option>)}
            </select></div>

          {fReason && reasonRefs.length>0 && (
            <div><label style={{fontSize:11,fontWeight:600,color:'#d97706',display:'block',marginBottom:4}}>{fReason.toUpperCase()} REF</label>
              <select value={fReasonRef} onChange={e=>setFReasonRef(e.target.value)}
                style={{width:'100%',padding:'7px 8px',borderRadius:6,fontSize:13,
                  border:fReasonRef?'2px solid #d97706':'1px solid #d1d5db'}}>
                <option value="">All</option>
                {reasonRefs.map(r=><option key={r} value={r}>{r}</option>)}
              </select></div>
          )}

          <div><label style={{fontSize:11,fontWeight:600,color:'#64748b',display:'block',marginBottom:4}}>ASSIGNED TO</label>
            <input value={fAssignee} onChange={e=>setFAssignee(e.target.value)} placeholder="Engineer name..."
              style={{width:'100%',padding:'7px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:13,boxSizing:'border-box'}}/></div>
        </div>

        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={()=>setSearched(true)}
            style={{padding:'9px 20px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,
              cursor:'pointer',fontWeight:700,fontSize:14}}>
            🔍 Show Test Cases
          </button>
          {hasFilters && <button onClick={clearFilters}
            style={{padding:'9px 14px',background:'#f1f5f9',color:'#374151',
              border:'1px solid #d1d5db',borderRadius:8,cursor:'pointer',fontSize:13}}>
            ✕ Clear Filters
          </button>}
          {searched && <span style={{background:'#dbeafe',color:'#1d4ed8',padding:'6px 12px',
            borderRadius:20,fontSize:12,fontWeight:700}}>
            {filtered.length} test case{filtered.length!==1?'s':''} found
          </span>}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats">
        <div className="stat total"><div className="num">{summary.total}</div><div className="lbl">Total</div></div>
        <div className="stat passed"><div className="num">{summary.Passed}</div><div className="lbl">Passed</div></div>
        <div className="stat failed"><div className="num">{summary.Failed}</div><div className="lbl">Failed</div></div>
        <div className="stat blocked"><div className="num">{summary.Blocked}</div><div className="lbl">Blocked</div></div>
        <div className="stat notrun"><div className="num">{summary['Not Run']}</div><div className="lbl">Not Run</div></div>
      </div>

      {/* Results — only after clicking Show */}
      {!searched ? (
        <div className="card" style={{textAlign:'center',padding:48,color:'#94a3b8'}}>
          <div style={{fontSize:36,marginBottom:12}}>🔍</div>
          <div style={{fontSize:16,fontWeight:600,color:'#374151',marginBottom:6}}>
            Set filters above then click "Show Test Cases"
          </div>
          <div style={{fontSize:13}}>Or click without filters to see all {allCases.length} test cases</div>
        </div>
      ) : (
        <div className="card" style={{padding:0}}>
          <div style={{padding:'12px 16px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',
            display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <button className="btn btn-success" onClick={runAll} disabled={running}>
              {running?'⏳ Running...':`▶ Run All ${filtered.length} Test Cases`}
            </button>
            <button className="btn btn-secondary" onClick={resetAll}>↺ Reset All</button>
            <button className="btn btn-secondary" onClick={loadData}>⟳ Refresh</button>
            <button className="btn btn-secondary" onClick={() => setShowExportDialog(true)}>📥 Export</button>
            <span style={{marginLeft:'auto',fontSize:12,color:'#64748b'}}>{filtered.length} test cases</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="results-table">
              <thead>
                <tr>
                  <th>TC ID</th><th>Flow</th><th>Env</th><th>Description</th>
                  <th colSpan={3} style={{background:'#1565C0',color:'#fff',textAlign:'center'}}>A-Party</th>
                  <th colSpan={3} style={{background:'#6A1B9A',color:'#fff',textAlign:'center'}}>B-Party</th>
                  <th colSpan={5} style={{background:'#2E7D32',color:'#fff',textAlign:'center'}}>Expected / Actual</th>
                  <th>Assigned To</th><th>Status</th>
                  <th style={{background:'#7c3aed',color:'#fff'}}>Manual</th>
                  <th>Run</th>
                </tr>
                <tr style={{background:'#2C3E50',color:'#fff',fontSize:11}}>
                  <th></th><th></th><th></th><th></th>
                  <th>MSISDN</th><th>Network</th><th>Profile</th>
                  <th>MSISDN</th><th>Network</th><th>Profile</th>
                  <th>Call MO</th><th>Call MT</th><th>SMS</th><th>SMS Notif.</th><th>Del. Rep.</th>
                  <th></th><th></th><th></th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r,i)=>{
                  const isRunning = r.status==='Running'||runningId===r.id;
                  const sc = `status-${(r.status||'not-run').toLowerCase().replace(/\s+/g,'-')}`;
                  return (
                    <tr key={r.id||i} style={{background:isRunning?'#fffbeb':i%2===0?'#f9fafb':'#fff'}}>
                      <td style={{fontWeight:700,color:'#1F4E5F',whiteSpace:'nowrap'}}>{r.tc_id}</td>
                      <td style={{fontSize:11,whiteSpace:'nowrap'}}>{r.flow}</td>
                      <td style={{fontSize:11}}>{r.environment}</td>
                      <td style={{fontSize:11,maxWidth:180}}>{(r.description||'').substring(0,60)}{(r.description||'').length>60?'...':''}</td>
                      <td style={{fontSize:11}}>{r.a_party_msisdn}</td>
                      <td style={{fontSize:11}}>{r.a_party_network}</td>
                      <td style={{fontSize:11}}>{r.a_party_profile}</td>
                      <td style={{fontSize:11}}>{r.b_party_msisdn}</td>
                      <td style={{fontSize:11}}>{r.b_party_network}</td>
                      <td style={{fontSize:11}}>{r.b_party_profile}</td>
                      <td style={{textAlign:'center'}}>{badge(r.exp_call_mo,r.actual_call_mo)}</td>
                      <td style={{textAlign:'center'}}>{badge(r.exp_call_mt,r.actual_call_mt)}</td>
                      <td style={{textAlign:'center'}}>{badge(r.exp_sms,r.actual_sms)}</td>
                      <td style={{textAlign:'center'}}>{badge(r.exp_sms_notification,r.actual_sms_notification)}</td>
                      <td style={{textAlign:'center'}}>{badge(r.exp_delivery_report,r.actual_delivery_report)}</td>
                      <td style={{fontSize:11}}>{r.assigned_to}</td>
                      <td><span className={`status-badge ${sc}`}>{r.status||'Not Run'}</span></td>
                      <td style={{textAlign:'center'}}>
                        <button title="Record manual test result"
                          onClick={() => setManualFor(r)}
                          style={{background:'#7c3aed', color:'#fff', border:'none', borderRadius:6,
                            padding:'4px 8px', cursor:'pointer', fontSize:11, fontWeight:600}}>
                          📝 Manual
                        </button>
                      </td>
                      <td style={{textAlign:'center'}}>
                        <button className="btn btn-primary btn-sm" disabled={isRunning||running}
                          onClick={()=>runOne(r.id)}
                          style={{width:32,height:32,padding:0,borderRadius:'50%',fontSize:14}}>
                          {isRunning?'⏳':'▶'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {manualFor && (
        <ManualStatusModal
          testCase={manualFor}
          onClose={() => setManualFor(null)}
          onSaved={() => { setManualFor(null); loadData(); }}
        />
      )}

      {showExportDialog && (
        <ExportDialog
          cases={filtered.length > 0 ? filtered : allCases}
          onClose={() => setShowExportDialog(false)}
        />
      )}
    </div>
  );
}


// Test Cases management page
function TestCasesPage() {
  const [cases, setCases] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editCase, setEditCase] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [importing, setImporting] = useState(false);
  const [filterWork, setFilterWork] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [manualStatusFor, setManualStatusFor] = useState(null);

  const EMPTY = {
    tc_id: '', traceability_label: '', flow: '', environment: 'Prod', description: '',
    a_party_msisdn: '', a_party_network: '2D - VoLTE', a_party_profile: 'Prepaid', a_party_handset_label: 'A',
    b_party_msisdn: '', b_party_network: '2D - VoLTE', b_party_profile: 'Postpaid', b_party_handset_label: 'B',
    exp_call_mo: 'Y', exp_call_mt: 'Y', exp_sms: 'Y', exp_sms_notification: 'Y', exp_delivery_report: 'N',
    call_duration_seconds: 15, call_type: 'VoLTE', sms_text: 'Test 123', assigned_to: '',
    work_type: 'Individual', work_ref_number: '', work_ref_name: '', work_owner: '',
    test_reason_type: 'BAU', test_reason_ref: '', project_id: '',
  };
  const [form, setForm] = useState(EMPTY);

  const [projects, setProjects] = useState([]);

  const refresh = async () => {
    const data = await api('/test-cases').catch(e => { setError(e.message); return []; });
    setCases(data);
  };

  useEffect(() => {
    refresh();
    api('/projects').then(setProjects).catch(() => {});
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (editCase) {
        await api(`/test-cases/${editCase.id}`, { method: 'PATCH', body: JSON.stringify(form) });
        setSuccess('Test case updated.');
      } else {
        await api('/test-cases', { method: 'POST', body: JSON.stringify(form) });
        setSuccess('Test case created.');
      }
      setShowForm(false); setEditCase(null); setForm(EMPTY);
      refresh();
    } catch (err) { setError(err.message); }
  }

  async function handleDelete(id, tcId) {
    if (!confirm(`Delete test case ${tcId}?`)) return;
    await api(`/test-cases/${id}`, { method: 'DELETE' });
    refresh();
  }

  function handleEdit(tc) {
    setEditCase(tc); setForm({ ...EMPTY, ...tc });
    setShowForm(true); window.scrollTo(0, 0);
  }

  async function handleCopy(tc) {
    const newId = prompt(`Copy "${tc.tc_id}" — enter new TC ID:`, tc.tc_id + '-COPY');
    if (!newId || !newId.trim()) return;
    try {
      await api(`/test-cases/${tc.id}/copy`, {
        method: 'POST',
        body: JSON.stringify({ tc_id: newId.trim() })
      });
      refresh();
    } catch (e) { alert('Copy failed: ' + e.message); }
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/import/csv', { method: 'POST', body: fd });
      const data = await res.json();
      setSuccess(`Imported ${data.imported} test cases.`);
      refresh();
    } catch (err) { setError(err.message); }
    finally { setImporting(false); }
  }

  const YN_FIELDS = [
    ['exp_call_mo', 'Call MO'], ['exp_call_mt', 'Call MT'], ['exp_sms', 'SMS'],
    ['exp_sms_notification', 'SMS Notification'], ['exp_delivery_report', 'Delivery Report'],
  ];

  return (
    <>
    <div className="page">
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => { setEditCase(null); setForm(EMPTY); setShowForm(s => !s); }}>
          {showForm ? '✕ Cancel' : '+ Add Test Case'}
        </button>
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          📂 Import CSV {importing ? '...' : ''}
          <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
        </label>
        <a className="btn btn-secondary" href="/api/export/excel" target="_blank">📥 Export Excel</a>
        <a className="btn btn-secondary" href="/api/export/csv" target="_blank">📥 Export CSV</a>
      </div>

      {!showForm && (
        <div className="card muted" style={{ padding: 16, marginBottom: 16, fontSize: 12 }}>
          <strong>CSV Import Format:</strong> Your CSV must have columns:
          TC ID, Traceability Label, Flow, Environment, Test Case Description,
          A-Party MSISDN, A-Party Network, A-Party Profile, A-Party Handset,
          B-Party MSISDN, B-Party Network, B-Party Profile, B-Party Handset,
          Call MO, Call MT, SMS, SMS Notification, Delivery Report,
          Call Duration, Call Type, SMS Text, Assigned To
        </div>
      )}

      {showForm && (
        <div className="card">
          <h3>{editCase ? `Edit: ${editCase.tc_id}` : 'New Test Case'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-section">Test Case Info</div>
            <div className="form-grid">
              <div><label>TC ID *</label><input required value={form.tc_id} onChange={e => set('tc_id', e.target.value)} placeholder="e.g. SMSC-001" /></div>
              <div><label>Traceability Label</label><input value={form.traceability_label} onChange={e => set('traceability_label', e.target.value)} placeholder="e.g. A, B, C, AS" /></div>
              <div><label>Flow</label><input value={form.flow} onChange={e => set('flow', e.target.value)} placeholder="e.g. P2P, On-net > Off-net" /></div>
              <div><label>Environment</label>
                <select value={form.environment} onChange={e => set('environment', e.target.value)}>
                  <option value="Prod">Prod</option>
                  <option value="Preprod">Preprod</option>
                </select>
              </div>
              <div><label>Assigned To</label><input value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} placeholder="Engineer name" /></div>
              <div className="form-full"><label>Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Test case description" />
              </div>
            </div>

            <div className="form-section">A-Party</div>
            <div className="form-grid">
              <div><label>MSISDN</label><input value={form.a_party_msisdn} onChange={e => set('a_party_msisdn', e.target.value)} placeholder="+64211000001" /></div>
              <div><label>Network</label>
                <select value={form.a_party_network} onChange={e => set('a_party_network', e.target.value)}>
                  {['2D - VoLTE','2D - VoWiFi','3G','5G','CS'].map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div><label>Profile</label>
                <select value={form.a_party_profile} onChange={e => set('a_party_profile', e.target.value)}>
                  <option>Prepaid</option><option>Postpaid</option>
                </select>
              </div>
              <div><label>Handset Label</label>
                <select value={form.a_party_handset_label} onChange={e => set('a_party_handset_label', e.target.value)}>
                  {['A','B','C','D','E'].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="form-section">B-Party</div>
            <div className="form-grid">
              <div><label>MSISDN</label><input value={form.b_party_msisdn} onChange={e => set('b_party_msisdn', e.target.value)} placeholder="+64211000002" /></div>
              <div><label>Network</label>
                <select value={form.b_party_network} onChange={e => set('b_party_network', e.target.value)}>
                  {['2D - VoLTE','2D - VoWiFi','3G','5G','CS'].map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div><label>Profile</label>
                <select value={form.b_party_profile} onChange={e => set('b_party_profile', e.target.value)}>
                  <option>Prepaid</option><option>Postpaid</option>
                </select>
              </div>
              <div><label>Handset Label</label>
                <select value={form.b_party_handset_label} onChange={e => set('b_party_handset_label', e.target.value)}>
                  {['A','B','C','D','E'].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="form-section">Expected Results</div>
            <div className="yn-row" style={{ marginBottom: 12 }}>
              {YN_FIELDS.map(([key, label]) => (
                <div className="yn-field" key={key}>
                  <span>{label}</span>
                  <select value={form[key]} onChange={e => set(key, e.target.value)}>
                    <option value="Y">Y</option>
                    <option value="N">N</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="form-section">Execution Parameters</div>
            <div className="form-grid">
              <div><label>Call Duration (seconds)</label>
                <select value={form.call_duration_seconds} onChange={e => set('call_duration_seconds', Number(e.target.value))}>
                  <option value={10}>10 seconds</option>
                  <option value={15}>15 seconds</option>
                  <option value={20}>20 seconds</option>
                  <option value={30}>30 seconds</option>
                </select>
              </div>
              <div><label>Call Type</label>
                <select value={form.call_type} onChange={e => set('call_type', e.target.value)}>
                  {['VoLTE','VoWiFi','CS','5G'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label>SMS Text</label>
                <input value={form.sms_text} onChange={e => set('sms_text', e.target.value)} placeholder="Test 123" />
              </div>
            </div>

            {/* Work Categorisation */}
            <div style={{marginTop:20, padding:'14px 16px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:10}}>
              <div style={{fontWeight:700, fontSize:13, color:'#0369a1', marginBottom:12}}>📁 Work Categorisation</div>
              <div className="form-grid">
                <div><label>Work Type *</label>
                  <select value={form.work_type||'Individual'} onChange={e => set('work_type', e.target.value)}>
                    <option value="Individual">Individual Task</option>
                    <option value="Project">Project</option>
                  </select>
                </div>
                {(form.work_type === 'Project') && (
                  <div><label>Link to Project</label>
                    <select value={form.project_id||''} onChange={e => {
                      const pid = e.target.value;
                      const p = projects.find(x => x.id === pid);
                      setForm(f => ({
                        ...f,
                        project_id: pid,
                        work_ref_number: p ? (p.project_number||p.code||'') : f.work_ref_number,
                        work_ref_name: p ? (p.name||'') : f.work_ref_name,
                        work_owner: p ? (p.owner_name||'') : f.work_owner,
                      }));
                    }}>
                      <option value="">— Select project —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.project_number||p.code} — {p.name}</option>)}
                    </select>
                  </div>
                )}
                <div><label>{form.work_type==='Project' ? 'Project Number' : 'Reference Number'}</label>
                  <input value={form.work_ref_number||''} onChange={e => set('work_ref_number', e.target.value)}
                    placeholder={form.work_type==='Project' ? 'PRJ-001' : 'IND-001'}/>
                </div>
                <div><label>{form.work_type==='Project' ? 'Project Name' : 'Task Name'}</label>
                  <input value={form.work_ref_name||''} onChange={e => set('work_ref_name', e.target.value)}
                    placeholder={form.work_type==='Project' ? 'VoLTE Core Upgrade' : 'Quick regression check'}/>
                </div>
                <div><label>Owner</label>
                  <input value={form.work_owner||''} onChange={e => set('work_owner', e.target.value)} placeholder="Eskandar"/>
                </div>
                <div><label>Test Reason Type</label>
                  <select value={form.test_reason_type||'BAU'} onChange={e => set('test_reason_type', e.target.value)}>
                    {['CR','Regression','Confirmation','Pre-test','Post-test','Sanity','BAU','Other'].map(t =>
                      <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><label>Test Reason Reference</label>
                  <input value={form.test_reason_ref||''} onChange={e => set('test_reason_ref', e.target.value)}
                    placeholder="e.g. CR123-IMS-Upgrade or REG-2026-Q2"/>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary">{editCase ? 'Update Test Case' : 'Save Test Case'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditCase(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Test Cases ({cases.length})</h3>

        {/* Quick filter bar */}
        <div style={{display:'flex', gap:10, marginBottom:12, flexWrap:'wrap', alignItems:'center'}}>
          <input value={filterSearch} onChange={e=>setFilterSearch(e.target.value)}
            placeholder="🔍 Search TC ID or description..."
            style={{flex:1, minWidth:200, padding:'7px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13}} />
          <select value={filterWork} onChange={e=>{setFilterWork(e.target.value);setFilterProject('');}}
            style={{padding:'7px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13}}>
            <option value="">All Types</option>
            <option value="Project">📁 Project</option>
            <option value="Individual">👤 Individual</option>
          </select>
          {filterWork === 'Project' && (
            <select value={filterProject} onChange={e=>setFilterProject(e.target.value)}
              style={{padding:'7px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13}}>
              <option value="">All Projects</option>
              {[...new Set(cases.filter(c=>c.work_type==='Project'&&c.work_ref_number).map(c=>c.work_ref_number))].map(p=>(
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          {(filterWork||filterProject||filterSearch) && (
            <button className="btn btn-secondary btn-sm" style={{width:'auto'}}
              onClick={()=>{setFilterWork('');setFilterProject('');setFilterSearch('');}}>✕ Clear</button>
          )}
          <span style={{fontSize:12, color:'#64748b'}}>
            {cases.filter(tc => {
              const wt = tc.work_type==='Project'?'Project':'Individual';
              if (filterWork && wt!==filterWork) return false;
              if (filterProject && tc.work_ref_number!==filterProject) return false;
              if (filterSearch && !tc.tc_id?.toLowerCase().includes(filterSearch.toLowerCase()) &&
                !tc.description?.toLowerCase().includes(filterSearch.toLowerCase())) return false;
              return true;
            }).length} shown
          </span>
        </div>
        <div className="results-scroll">
          <table>
            <thead>
              <tr>
                <th>TC ID</th>
                <th>Env</th>
                <th>Flow</th>
                <th style={{ minWidth: 180 }}>Description</th>
                <th>A-MSISDN</th>
                <th>A-Network</th>
                <th>B-MSISDN</th>
                <th>B-Network</th>
                <th>Call MO</th>
                <th>Call MT</th>
                <th>SMS</th>
                <th>SMS Notif.</th>
                <th>Del. Rpt</th>
                <th>Duration</th>
                <th>Assigned</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.length === 0 && (
                <tr><td colSpan={17} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                  No test cases yet. Click "+ Add Test Case" or import a CSV file.
                </td></tr>
              )}
              {cases.filter(tc => {
                const wt = tc.work_type==='Project'?'Project':'Individual';
                if (filterWork && wt!==filterWork) return false;
                if (filterProject && tc.work_ref_number!==filterProject) return false;
                if (filterSearch && !tc.tc_id?.toLowerCase().includes(filterSearch.toLowerCase()) &&
                  !tc.description?.toLowerCase().includes(filterSearch.toLowerCase())) return false;
                return true;
              }).map(tc => (
                <tr key={tc.id}>
                  <td style={{ fontWeight: 700 }}>{tc.tc_id}</td>
                  <td>{tc.environment}</td>
                  <td>{tc.flow}</td>
                  <td className="left">{tc.description}</td>
                  <td>{tc.a_party_msisdn}</td>
                  <td>{tc.a_party_network}</td>
                  <td>{tc.b_party_msisdn}</td>
                  <td>{tc.b_party_network}</td>
                  <td><Badge status={tc.exp_call_mo} /></td>
                  <td><Badge status={tc.exp_call_mt} /></td>
                  <td><Badge status={tc.exp_sms} /></td>
                  <td><Badge status={tc.exp_sms_notification} /></td>
                  <td><Badge status={tc.exp_delivery_report} /></td>
                  <td>{tc.call_duration_seconds}s</td>
                  <td>{tc.assigned_to}</td>
                  <td><Badge status={tc.status} /></td>
                  <td>
                    <div className="action-cell">
                      <button className="btn btn-secondary btn-sm" title="Edit" onClick={() => handleEdit(tc)}>✎</button>
                      <button className="btn btn-secondary btn-sm" title="Copy / Clone"
                        style={{background:'#0f766e', color:'#fff'}}
                        onClick={() => handleCopy(tc)}>⧉</button>
                      <button className="btn btn-secondary btn-sm" title="Record Manual Test Result"
                        style={{background:'#7c3aed', color:'#fff'}}
                        onClick={() => setManualStatusFor(tc)}>📝</button>
                      <button className="btn btn-danger btn-sm" title="Delete" onClick={() => handleDelete(tc.id, tc.tc_id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {manualStatusFor && (
      <ManualStatusModal
        testCase={manualStatusFor}
        onClose={() => setManualStatusFor(null)}
        onSaved={() => { setManualStatusFor(null); refresh(); }}
      />
    )}
    </>
  );
}

function ManualStatusModal({ testCase, onClose, onSaved }) {
  const [status, setStatus] = useState('Passed');
  const [executedAt, setExecutedAt] = useState(() => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [notes, setNotes] = useState('');
  const [executedBy, setExecutedBy] = useState(() => {
    try { return JSON.parse(localStorage.getItem('auth_user')||'null')?.full_name || ''; } catch { return ''; }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const statusOptions = [
    { value: 'Passed', icon: '✅', color: '#16a34a' },
    { value: 'Failed', icon: '❌', color: '#dc2626' },
    { value: 'Blocked', icon: '⚠️', color: '#d97706' },
    { value: 'N/A', icon: '➖', color: '#6b7280' },
    { value: 'In-Progress', icon: '⏳', color: '#2563eb' },
    { value: 'Not Run', icon: '⭕', color: '#94a3b8' },
  ];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/test-cases/${testCase.id}/manual-execution`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          executed_at: executedAt,
          notes,
          triggered_by: executedBy || 'Manual',
        }),
      });
      onSaved();
    } catch(e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:1000}}
      onClick={onClose}>
      <div style={{background:'#fff', borderRadius:14, padding:24, width:480, maxWidth:'90vw',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}
        onClick={e => e.stopPropagation()}>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div>
            <div style={{fontWeight:700, fontSize:17, color:'#1a3a4e'}}>📝 Record Manual Test Result</div>
            <div style={{fontSize:13, color:'#64748b', marginTop:2}}>{testCase.tc_id} — {testCase.description?.substring(0,60)}</div>
          </div>
          <button onClick={onClose} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8'}}>✕</button>
        </div>

        {error && <div className="error" style={{marginBottom:12}}>{error}</div>}

        <div style={{marginBottom:16}}>
          <label style={{fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:8}}>STATUS</label>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
            {statusOptions.map(opt => (
              <button key={opt.value} onClick={() => setStatus(opt.value)}
                style={{
                  padding:'10px 8px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600,
                  border: status === opt.value ? `2px solid ${opt.color}` : '1px solid #e2e8f0',
                  background: status === opt.value ? opt.color+'15' : '#fff',
                  color: status === opt.value ? opt.color : '#374151',
                }}>
                {opt.icon} {opt.value}
              </button>
            ))}
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16}}>
          <div>
            <label style={{fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6}}>DATE & TIME</label>
            <input type="datetime-local" value={executedAt} onChange={e => setExecutedAt(e.target.value)}
              style={{width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #d1d5db', fontSize:13}} />
          </div>
          <div>
            <label style={{fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6}}>TESTED BY</label>
            <input value={executedBy} onChange={e => setExecutedBy(e.target.value)}
              placeholder="Your name"
              style={{width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #d1d5db', fontSize:13}} />
          </div>
        </div>

        <div style={{marginBottom:20}}>
          <label style={{fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6}}>
            NOTES {status==='Failed'||status==='Blocked' ? '(reason)' : '(optional)'}
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder={status==='Failed' ? 'Describe what went wrong...' : 'Any additional notes...'}
            style={{width:'100%', minHeight:70, padding:'8px 10px', borderRadius:7, border:'1px solid #d1d5db',
              fontSize:13, resize:'vertical', fontFamily:'inherit'}} />
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '⏳ Saving...' : '💾 Save Result'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Handsets page
function HandsetsPage() {
  const [handsets, setHandsets] = useState([]);
  const [connected, setConnected] = useState([]);
  const [agentStatus, setAgentStatus] = useState({});
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editingHandset, setEditingHandset] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionResults, setSessionResults] = useState(null);
  const [form, setForm] = useState({
    label: 'A', make: 'Samsung', model: '', android_version: '',
    adb_serial: '', msisdn: '', operator: '2degrees',
    network_type: 'VoLTE', profile: 'Prepaid', agent_url: '', notes: '',
  });

  function refresh() {
    api('/handsets').then(setHandsets).catch((e) => setError(e.message));
    api('/handsets/adb/connected').then((r) => setConnected(r.connected || [])).catch(() => {});
  }

  async function startSession() {
    setSessionLoading(true);
    setSessionResults(null);
    setError(null);
    try {
      const result = await api('/handsets/adb/start-session', { method: 'POST' });
      setSessionResults(result);
      if (result.ok) setSuccess('Session started successfully!');
      refresh();
    } catch (e) { setError(e.message); }
    finally { setSessionLoading(false); }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

  function startEdit(h) {
    setEditingHandset(h.label);
    setForm({
      label: h.label, make: h.make || '', model: h.model || '',
      android_version: h.android_version || '', adb_serial: h.adb_serial || '',
      msisdn: h.msisdn || '', operator: h.operator || '2degrees',
      network_type: h.network_type || 'VoLTE', profile: h.profile || 'Prepaid',
      agent_url: h.agent_url || '', notes: h.notes || '',
    });
    window.scrollTo(0, document.body.scrollHeight);
  }

  async function checkAgent(label, url) {
    if (!url) { setAgentStatus(s => ({...s, [label]: {ok:false, msg:'No agent URL set'}})); return; }
    setAgentStatus(s => ({...s, [label]: {ok:null, msg:'Checking...'}}));
    try {
      const r = await fetch(url + '/health', {signal: AbortSignal.timeout(5000)});
      const d = await r.json();
      setAgentStatus(s => ({...s, [label]: {ok:true, msg:`✓ ${d.model} Android ${d.android_version}`}}));
    } catch(e) {
      setAgentStatus(s => ({...s, [label]: {ok:false, msg:`✗ Cannot reach agent at ${url}`}}));
    }
  }

  // Scan 192.168.1.1-254 for phones running TelecomTestAgent on port 8765
  async function scanNetwork() {
    setScanning(true);
    setScanResults([]);
    setError(null);
    const found = [];
    const subnet = '192.168.1';
    const promises = [];

    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      const url = `http://${ip}:8765`;
      promises.push(
        fetch(url + '/health', {signal: AbortSignal.timeout(1500)})
          .then(r => r.json())
          .then(d => { found.push({ip, url, model: d.model, android: d.android_version, status: d.status}); })
          .catch(() => {})
      );
    }

    // Run 30 at a time to avoid overwhelming the network
    for (let i = 0; i < promises.length; i += 30) {
      await Promise.all(promises.slice(i, i + 30));
    }

    setScanResults(found);
    setScanning(false);
    if (found.length === 0) {
      setError('No TelecomTestAgent found on 192.168.1.x network. Make sure phones are on the same WiFi and the APK is open and running.');
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await api('/handsets', { method: 'POST', body: JSON.stringify({
        ...form, agent_url: form.agent_url || null
      })});
      setSuccess(`Handset ${form.label} saved.`);
      setEditingHandset(null);
      setForm({ label: 'A', make: 'Samsung', model: '', android_version: '',
        adb_serial: '', msisdn: '', operator: '2degrees',
        network_type: 'VoLTE', profile: 'Prepaid', agent_url: '', notes: '' });
      refresh();
    } catch(err) { setError(err.message); }
  }

  async function assignAgent(handsetLabel, url) {
    try {
      // Always use localhost port mapping regardless of phone's actual IP
      // ADB port forward makes localhost:PORT → phone's port 8765
      const portMap = { A: 8765, B: 8766, C: 8767, D: 8768, E: 8769, F: 8770 };
      const localPort = portMap[handsetLabel] || 8765;
      const localhostUrl = `http://localhost:${localPort}`;
      // Also update adb_serial from the scanned IP
      const ipMatch = url.match(/(\d+\.\d+\.\d+\.\d+)/);
      const updates = { agent_url: localhostUrl };
      // Keep existing adb_serial port suffix if available
      if (ipMatch) {
        const portSuffix = handsetLabel === 'A' ? '5555' : handsetLabel === 'B' ? '5556' :
          handsetLabel === 'C' ? '5557' : handsetLabel === 'D' ? '5558' : '5555';
        updates.adb_serial = `${ipMatch[1]}:${portSuffix}`;
      }
      await api(`/handsets/${handsetLabel}`, { method: 'PATCH', body: JSON.stringify(updates) });
      setSuccess(`Handset ${handsetLabel} assigned → Agent: ${localhostUrl}, Serial: ${updates.adb_serial || 'unchanged'}`);
      refresh();
    } catch(e) { setError(e.message); }
  }

  return (
    <div>
      <h2>Handsets & Device Management</h2>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Session Startup Card */}
      <div className="card" style={{marginBottom:16, background:'linear-gradient(135deg,#1a3a4e,#16212e)', border:'1px solid #2E6B7E'}}>
        <div style={{display:'flex', alignItems:'center', gap:16, flexWrap:'wrap'}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700, fontSize:16, color:'#3fb6c9', marginBottom:4}}>
              📡 Start Test Session
            </div>
            <div style={{color:'#93a4b8', fontSize:13, lineHeight:1.6}}>
              Connects all registered phones via WiFi ADB and sets up port forwards.
              <br/>
              <span style={{color:'#3aa66b'}}>✓ Auto keep-alive is built in</span> — the backend automatically reconnects dropped phones every 20 seconds. No PowerShell scripts needed.
              <br/>
              Click <strong style={{color:'#3fb6c9'}}>Start Session</strong> once at the beginning, then just run your tests.
            </div>
          </div>
          <button
            onClick={startSession}
            disabled={sessionLoading}
            style={{
              padding:'12px 28px', background: sessionLoading ? '#1e40af' : '#2563eb',
              color:'#fff', border:'none', borderRadius:10, fontWeight:700,
              fontSize:15, cursor: sessionLoading ? 'wait' : 'pointer',
              whiteSpace:'nowrap', minWidth:180,
            }}>
            {sessionLoading ? '⏳ Setting up...' : '🚀 Start Session'}
          </button>
        </div>

        {/* Session results */}
        {sessionResults && (
          <div style={{marginTop:16, borderTop:'1px solid #2a3a4d', paddingTop:14}}>
            <div style={{
              fontWeight:700, fontSize:14, marginBottom:10,
              color: sessionResults.ok ? '#3aa66b' : '#d97706'
            }}>
              {sessionResults.ok ? '✅' : '⚠️'} {sessionResults.message}
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:4}}>
              {sessionResults.results && sessionResults.results.map((r, i) => (
                <div key={i} style={{
                  display:'flex', alignItems:'flex-start', gap:10,
                  padding:'6px 10px', borderRadius:6,
                  background: r.ok ? 'rgba(58,166,107,0.08)' : 'rgba(220,38,38,0.08)',
                }}>
                  <span style={{fontSize:14, flexShrink:0}}>{r.ok ? '✓' : '✗'}</span>
                  <div>
                    <span style={{fontWeight:600, fontSize:12, color: r.ok ? '#3aa66b' : '#f87171'}}>
                      {r.step}
                    </span>
                    <div style={{fontSize:11, color:'#93a4b8', fontFamily:'monospace', marginTop:2}}>
                      {r.output}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Registered handsets */}
      <div className="card">
        <h3>Registered Handsets</h3>
        {handsets.length === 0 && <p className="muted">No handsets yet — register below.</p>}
        <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
          {handsets.map(h => {
            const isExternal = !h.adb_serial && !h.agent_url;
            const isAdbConnected = h.adb_serial && connected.includes(h.adb_serial);
            const dotClass = isExternal ? 'dot-green' : isAdbConnected ? 'dot-green' : 'dot-gray';
            const role = isExternal ? '📞 Receiver Only' : '📡 Sender & Receiver';
            const roleColor = isExternal ? '#16a34a' : '#2563eb';
            return (
            <div key={h.label} className="card" style={{minWidth:260, margin:0, flex:'1 1 260px'}}>
              <div style={{display:'flex', alignItems:'center', marginBottom:6}}>
                <span className={`device-dot ${dotClass}`}/>
                <strong style={{fontSize:16}}>Handset {h.label}</strong>
                <div style={{marginLeft:'auto', display:'flex', gap:4}}>
                  <button className="btn btn-secondary btn-sm" style={{width:'auto'}}
                    onClick={() => startEdit(h)}>✎ Edit</button>
                  <button className="btn btn-danger btn-sm" style={{width:'auto'}}
                    onClick={async () => {
                      if (!confirm(`Delete Handset ${h.label} (${h.msisdn})? This cannot be undone.`)) return;
                      await api(`/handsets/${h.label}`, {method:'DELETE'});
                      api('/handsets').then(setHandsets).catch(() => {});
                    }}>✕ Delete</button>
                </div>
              </div>
              <div style={{marginBottom:6}}>
                <span style={{fontSize:11, fontWeight:700, color:roleColor, background: isExternal ? '#dcfce7' : '#dbeafe',
                  padding:'2px 8px', borderRadius:10}}>{role}</span>
              </div>
              <div className="muted">{h.make} {h.model}</div>
              <div style={{fontSize:13}}>MSISDN: <strong>{h.msisdn || '—'}</strong></div>
              <div style={{fontSize:12}}>Network: {h.network_type} | {h.profile}</div>
              <div style={{fontSize:11, color:'#94a3b8', fontFamily:'monospace', marginTop:4}}>
                {isExternal ? '— no ADB (external receiver)' : h.adb_serial}
              </div>

              {/* Agent URL section */}
              {isExternal ? (
                <div style={{marginTop:10, padding:'8px', background:'#052e16', borderRadius:8, border:'1px solid #166534'}}>
                  <div style={{fontSize:11, color:'#4ade80', fontWeight:700, marginBottom:4}}>✓ EXTERNAL RECEIVER</div>
                  <div style={{fontSize:11, color:'#86efac', lineHeight:1.5}}>
                    Will receive calls & SMS via network.<br/>
                    No APK or ADB connection needed.
                  </div>
                </div>
              ) : (
                <div style={{marginTop:10, padding:'8px', background:'#0f1722', borderRadius:8}}>
                  <div style={{fontSize:11, color:'#2e6b7e', fontWeight:700, marginBottom:4}}>TELECOM AGENT APK</div>
                  {h.agent_url ? (
                    <>
                      <div style={{fontSize:11, fontFamily:'monospace', color:'#3fb6c9', wordBreak:'break-all'}}>{h.agent_url}</div>
                      {agentStatus[h.label] && (
                        <div style={{fontSize:11, color: agentStatus[h.label].ok ? '#3aa66b' : '#d96b6b', marginTop:2}}>
                          {agentStatus[h.label].msg}
                        </div>
                      )}
                      <button className="btn btn-secondary btn-sm" style={{marginTop:4, width:'auto', fontSize:11}}
                        onClick={() => checkAgent(h.label, h.agent_url)}>
                        {agentStatus[h.label]?.ok === null ? 'Checking...' : 'Test Connection'}
                      </button>
                    </>
                  ) : (
                    <div style={{fontSize:11, color:'#d97706'}}>
                      ⚠ No agent URL — scan network below or enter manually
                    </div>
                  )}
                </div>
              )}
            </div>
          ); })}
        </div>
      </div>

      {/* Network scanner */}
      <div className="card">
        <h3>🔍 Auto-Scan for TelecomTestAgent APK</h3>
        <p className="muted" style={{marginBottom:12}}>
          Scans your 192.168.1.x network for phones running TelecomTestAgent.
          Make sure the APK is open on both phones showing "Agent running on port 8765".
        </p>
        <button className="btn btn-primary" onClick={scanNetwork} disabled={scanning}>
          {scanning ? '⏳ Scanning 192.168.1.1–254...' : '🔍 Scan Network for Phones'}
        </button>

        {scanResults.length > 0 && (
          <div style={{marginTop:14}}>
            <div style={{color:'#3aa66b', fontWeight:700, marginBottom:8}}>
              Found {scanResults.length} phone(s) running TelecomTestAgent:
            </div>
            {scanResults.map((r, i) => (
              <div key={i} style={{display:'flex', alignItems:'center', gap:12,
                background:'#0f1722', padding:'10px 14px', borderRadius:8, marginBottom:6}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700, color:'#3fb6c9'}}>{r.ip}</div>
                  <div className="muted">{r.model} · Android {r.android}</div>
                  <div style={{fontSize:11, fontFamily:'monospace', color:'#64748b'}}>{r.url}</div>
                </div>
                <div style={{display:'flex', gap:6}}>
                  {handsets.map(h => (
                    <button key={h.label} className="btn btn-success btn-sm"
                      style={{width:'auto'}} onClick={() => assignAgent(h.label, r.url)}>
                      → Handset {h.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Register / Edit form */}
      <div className="card">
        <h3>{editingHandset ? `Editing Handset ${editingHandset}` : 'Register / Update Handset'}</h3>
        <form onSubmit={handleSave}>
          <div className="form-grid">
            <div><label>Handset Label *</label>
              <select value={form.label} onChange={e => setForm(f => ({...f, label: e.target.value}))}>
                {['A','B','C','D','E','F'].map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div><label>ADB Serial</label>
              <input value={form.adb_serial} onChange={e => setForm(f => ({...f, adb_serial: e.target.value}))}
                placeholder="From 'adb devices' (optional)"/>
            </div>
            <div><label>MSISDN (SIM number)</label>
              <input value={form.msisdn} onChange={e => setForm(f => ({...f, msisdn: e.target.value}))}
                placeholder="+64224794052"/>
            </div>
            <div><label>Make</label>
              <input value={form.make} onChange={e => setForm(f => ({...f, make: e.target.value}))} placeholder="Samsung"/>
            </div>
            <div><label>Model</label>
              <input value={form.model} onChange={e => setForm(f => ({...f, model: e.target.value}))} placeholder="Galaxy A54"/>
            </div>
            <div><label>Android Version</label>
              <input value={form.android_version} onChange={e => setForm(f => ({...f, android_version: e.target.value}))} placeholder="14"/>
            </div>
            <div><label>Operator</label>
              <input value={form.operator} onChange={e => setForm(f => ({...f, operator: e.target.value}))} placeholder="2degrees"/>
            </div>
            <div><label>Network Type</label>
              <select value={form.network_type} onChange={e => setForm(f => ({...f, network_type: e.target.value}))}>
                {['VoLTE','VoWiFi','CS','5G','3G'].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div><label>Profile</label>
              <select value={form.profile} onChange={e => setForm(f => ({...f, profile: e.target.value}))}>
                <option>Prepaid</option><option>Postpaid</option>
              </select>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label>Agent URL (TelecomTestAgent APK address)</label>
              <input value={form.agent_url}
                onChange={e => setForm(f => ({...f, agent_url: e.target.value}))}
                placeholder="http://localhost:8765 (A) or http://localhost:8766 (B) — use Scan button above"/>
              <div className="muted" style={{marginTop:4, fontSize:11}}>
                Find your phone IP: Settings → WiFi → tap your network → IP address.
                Or use the Scan button above to find it automatically.
              </div>
            </div>
          </div>
          <div style={{marginTop:14, display:'flex', gap:10}}>
            <button type="submit" className="btn btn-primary">Save Handset</button>
            {editingHandset && (
              <button type="button" className="btn btn-secondary"
                onClick={() => { setEditingHandset(null); }}>Cancel</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}


// ── Reports Page ─────────────────────────────────────────────────────────────
function ReportsPage() {
  const [filters, setFilters] = useState({
    environment: '', status: '', assigned_to: '',
    a_party_handset: '', b_party_handset: '',
    date_from: '', date_to: '',
  });
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null);
  const [showExportDialog, setShowExportDialog] = useState(false); // 'latest' or 'all'

  const setF = (k, v) => setFilters(p => ({ ...p, [k]: v }));

  // Convert local datetime to UTC string for the API
  // datetime-local input gives "2026-06-26T18:25" in the user's local time
  // new Date() correctly parses this as local time and converts to UTC
  function toUTC(localStr) {
    if (!localStr) return '';
    try {
      const d = new Date(localStr);
      if (isNaN(d.getTime())) return '';
      // Format as "YYYY-MM-DD HH:MM:SS" in UTC
      const pad = n => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    } catch(e) { return ''; }
  }

  function buildQuery() {
    const q = new URLSearchParams();
    if (filters.environment)    q.append('environment',     filters.environment);
    if (filters.status)         q.append('status',          filters.status);
    if (filters.assigned_to)    q.append('assigned_to',     filters.assigned_to);
    if (filters.a_party_handset) q.append('a_party_handset', filters.a_party_handset);
    if (filters.b_party_handset) q.append('b_party_handset', filters.b_party_handset);
    if (filters.date_from)      q.append('date_from',       toUTC(filters.date_from));
    if (filters.date_to)        q.append('date_to',         toUTC(filters.date_to));
    return q.toString();
  }

  async function runReport(reportMode) {
    setLoading(true); setError(null); setMode(reportMode);
    try {
      const q = buildQuery();
      const endpoint = reportMode === 'all' ? '/executions/all' : '/results';
      const rows = await api(endpoint + (q ? '?' + q : ''));
      setResults(rows);
      const s = { Passed: 0, Failed: 0, Blocked: 0, 'Not Run': 0, Running: 0, total: rows.length };
      rows.forEach(r => { if (s[r.status] !== undefined) s[r.status]++; });
      setSummary(s);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function clearFilters() {
    setFilters({ environment:'', status:'', assigned_to:'', a_party_handset:'', b_party_handset:'', date_from:'', date_to:'' });
    setResults([]); setSummary(null); setMode(null);
  }

  function exportExcel() {
    const q = buildQuery();
    window.open('/api/export/excel' + (q ? '?' + q : ''));
  }
  function exportCsv() {
    const q = buildQuery();
    window.open('/api/export/csv' + (q ? '?' + q : ''));
  }

  // Get local timezone offset display
  const tzOffset = -(new Date().getTimezoneOffset() / 60);
  const tzLabel = `UTC${tzOffset >= 0 ? '+' : ''}${tzOffset}`;

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8}}>
        <h2 style={{margin:0}}>Reports & Analytics</h2>
        <div style={{fontSize:12, color:'#64748b', background:'#f1f5f9', padding:'4px 10px', borderRadius:20}}>
          🕐 Your timezone: <strong>{tzLabel}</strong> — dates are converted automatically
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Filter Panel */}
      <div className="card">
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:16}}>
          <span style={{fontSize:16}}>🔍</span>
          <h3 style={{margin:0}}>Filters</h3>
          <span style={{color:'#94a3b8', fontSize:12, marginLeft:4}}>— leave blank to show all</span>
        </div>

        <div className="form-grid">
          <div>
            <label>Environment</label>
            <select value={filters.environment} onChange={e => setF('environment', e.target.value)}>
              <option value="">All Environments</option>
              <option value="Prod">Production</option>
              <option value="Preprod">Pre-production</option>
            </select>
          </div>
          <div>
            <label>Result Status</label>
            <select value={filters.status} onChange={e => setF('status', e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Passed">✅ Passed</option>
              <option value="Failed">❌ Failed</option>
              <option value="Blocked">⚠️ Blocked</option>
              <option value="Not Run">— Not Run</option>
            </select>
          </div>
          <div>
            <label>Assigned To</label>
            <input value={filters.assigned_to} onChange={e => setF('assigned_to', e.target.value)}
              placeholder="Engineer name e.g. Eskandar" />
          </div>
          <div>
            <label>A-Party Handset</label>
            <select value={filters.a_party_handset} onChange={e => setF('a_party_handset', e.target.value)}>
              <option value="">Any</option>
              {['A','B','C','D','E','F'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>B-Party Handset</label>
            <select value={filters.b_party_handset} onChange={e => setF('b_party_handset', e.target.value)}>
              <option value="">Any</option>
              {['A','B','C','D','E','F'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>Date From ({tzLabel})</label>
            <input type="datetime-local" value={filters.date_from}
              onChange={e => setF('date_from', e.target.value)} />
          </div>
          <div>
            <label>Date To ({tzLabel})</label>
            <input type="datetime-local" value={filters.date_to}
              onChange={e => setF('date_to', e.target.value)} />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{marginTop:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
          <div style={{display:'flex', gap:8, flex:1, flexWrap:'wrap'}}>
            <button className="btn btn-primary" onClick={() => runReport('all')} disabled={loading}
              style={{minWidth:200, fontSize:14}}>
              {loading ? '⏳ Loading...' : '🔍 Run Report'}
            </button>
            <button className="btn btn-secondary" onClick={() => runReport('latest')} disabled={loading}>
              {loading ? '⏳' : '📋 Latest per TC'}
            </button>
            <button className="btn btn-secondary" onClick={clearFilters}
              style={{background:'#f1f5f9', color:'#374151'}}>
              ✕ Clear
            </button>
          </div>

          {results.length > 0 && (
            <div style={{display:'flex', gap:8}}>
              <button onClick={() => setShowExportDialog(true)}
                style={{padding:'8px 16px', background:'#16a34a', color:'#fff',
                  border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13}}>
                📊 Export (Select Columns)
              </button>
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {Object.entries(filters).some(([,v]) => v) && (
          <div style={{marginTop:12, display:'flex', gap:6, flexWrap:'wrap'}}>
            <span style={{fontSize:11, color:'#64748b', alignSelf:'center'}}>Active filters:</span>
            {Object.entries(filters).filter(([,v]) => v).map(([k, v]) => (
              <span key={k} style={{
                background:'#dbeafe', color:'#1d4ed8', padding:'3px 10px',
                borderRadius:20, fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4
              }}>
                {k.replace(/_/g,' ')}: {k.includes('date') ? new Date(v).toLocaleString() : v}
                <button onClick={() => setF(k, '')}
                  style={{background:'none', border:'none', cursor:'pointer', color:'#1d4ed8', padding:0, fontSize:13, lineHeight:1}}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <>
          <div style={{
            background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10,
            padding:'10px 16px', marginBottom:12, fontSize:13, color:'#374151',
            display:'flex', alignItems:'center', gap:8
          }}>
            <span>📊</span>
            <strong>{mode === 'all' ? 'All Executions' : 'Latest Result per Test Case'}</strong>
            {filters.date_from && <span style={{color:'#64748b'}}>· From {new Date(filters.date_from).toLocaleString()}</span>}
            {filters.date_to && <span style={{color:'#64748b'}}>· To {new Date(filters.date_to).toLocaleString()}</span>}
            <span style={{marginLeft:'auto', color:'#64748b'}}>{summary.total} records</span>
          </div>

          <div style={{display:'flex', gap:10, marginBottom:16, flexWrap:'wrap'}}>
            {[
              {label:'Total', value:summary.total, color:'#2563eb', bg:'#eff6ff'},
              {label:'Passed', value:summary.Passed, color:'#16a34a', bg:'#f0fdf4'},
              {label:'Failed', value:summary.Failed, color:'#dc2626', bg:'#fef2f2'},
              {label:'Blocked', value:summary.Blocked, color:'#d97706', bg:'#fffbeb'},
              {label:'Not Run', value:summary['Not Run'], color:'#6b7280', bg:'#f9fafb'},
            ].map(s => (
              <div key={s.label} style={{
                background:s.bg, border:`1px solid ${s.color}30`,
                borderRadius:10, padding:'12px 20px', textAlign:'center',
                flex:'1 1 80px', minWidth:80,
              }}>
                <div style={{fontSize:26, fontWeight:800, color:s.color}}>{s.value}</div>
                <div style={{fontSize:11, color:'#64748b', fontWeight:600, marginTop:2}}>{s.label}</div>
                {s.label !== 'Total' && summary.total > 0 && (
                  <div style={{fontSize:10, color:s.color, marginTop:1}}>
                    {((s.value/summary.total)*100).toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
            {summary.total > 0 && (
              <div style={{
                background:'#f0fdf4', border:'1px solid #16a34a30',
                borderRadius:10, padding:'12px 20px', textAlign:'center',
                flex:'1 1 100px', minWidth:100,
              }}>
                <div style={{fontSize:26, fontWeight:800, color:'#16a34a'}}>
                  {((summary.Passed/summary.total)*100).toFixed(1)}%
                </div>
                <div style={{fontSize:11, color:'#64748b', fontWeight:600, marginTop:2}}>Pass Rate</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
              <thead>
                <tr style={{background:'#1F4E5F', color:'#fff'}}>
                  <th style={{padding:'10px 12px', textAlign:'left', whiteSpace:'nowrap'}}>TC ID</th>
                  <th style={{padding:'10px 12px', textAlign:'left', maxWidth:200}}>Description</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>A-Party</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>B-Party</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>Call MO</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>Call MT</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>SMS</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>SMS Notif.</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>Del. Rep.</th>
                  <th style={{padding:'10px 12px', textAlign:'left', whiteSpace:'nowrap'}}>Executed At</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>Duration</th>
                  <th style={{padding:'10px 12px', textAlign:'left'}}>Failure Reason</th>
                  <th style={{padding:'10px 8px', textAlign:'center'}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.filter(r => true).map((r, i) => {
                  const ss = {
                    Passed:    {bg:'#f0fdf4', badge:'#16a34a', text:'✓ Passed'},
                    Failed:    {bg:'#fef2f2', badge:'#dc2626', text:'✗ Failed'},
                    Blocked:   {bg:'#fffbeb', badge:'#d97706', text:'⚠ Blocked'},
                    'Not Run': {bg:'#f9fafb', badge:'#6b7280', text:'— Not Run'},
                    Running:   {bg:'#eff6ff', badge:'#2563eb', text:'▶ Running'},
                  }[r.status] || {bg:'#f9fafb', badge:'#6b7280', text:r.status};

                  const badge = (exp, act) => {
                    if (!act) return <span style={{color:'#9ca3af'}}>—</span>;
                    const ok = act === exp || (exp === 'N' && act === 'Y');
                    return <span style={{
                      background: ok ? '#dcfce7' : '#fee2e2',
                      color: ok ? '#16a34a' : '#dc2626',
                      padding:'2px 7px', borderRadius:4, fontWeight:700, fontSize:11,
                    }}>{act}</span>;
                  };

                  return (
                    <tr key={i} style={{
                      background: i%2===0 ? ss.bg : '#ffffff',
                      borderBottom:'1px solid #f1f5f9'
                    }}>
                      <td style={{padding:'8px 12px', fontWeight:700, color:'#1F4E5F', whiteSpace:'nowrap'}}>{r.tc_id}</td>
                      <td style={{padding:'8px 12px', maxWidth:200, fontSize:11, color:'#374151'}}>
                        {(r.description||'').substring(0,70)}{(r.description||'').length>70?'...':''}
                      </td>
                      <td style={{padding:'8px', textAlign:'center', fontSize:11}}>
                        <div style={{fontWeight:600}}>{r.a_party_msisdn}</div>
                        <div style={{color:'#94a3b8', fontSize:10}}>{r.a_party_handset_label}</div>
                      </td>
                      <td style={{padding:'8px', textAlign:'center', fontSize:11}}>
                        <div style={{fontWeight:600}}>{r.b_party_msisdn}</div>
                        <div style={{color:'#94a3b8', fontSize:10}}>{r.b_party_handset_label}</div>
                      </td>
                      <td style={{padding:'8px', textAlign:'center'}}>{badge(r.exp_call_mo, r.actual_call_mo)}</td>
                      <td style={{padding:'8px', textAlign:'center'}}>{badge(r.exp_call_mt, r.actual_call_mt)}</td>
                      <td style={{padding:'8px', textAlign:'center'}}>{badge(r.exp_sms, r.actual_sms)}</td>
                      <td style={{padding:'8px', textAlign:'center'}}>{badge(r.exp_sms_notification, r.actual_sms_notification)}</td>
                      <td style={{padding:'8px', textAlign:'center'}}>{badge(r.exp_delivery_report, r.actual_delivery_report)}</td>
                      <td style={{padding:'8px 12px', fontSize:11, whiteSpace:'nowrap', color:'#374151'}}>
                        {r.executed_at || r.execution_date
                          ? new Date(r.executed_at || r.execution_date).toLocaleString('en-NZ', {
                              day:'2-digit', month:'2-digit', year:'numeric',
                              hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
                            })
                          : '—'}
                      </td>
                      <td style={{padding:'8px', textAlign:'center', fontSize:11, whiteSpace:'nowrap', color:'#374151'}}>
                        {(r.exp_call_mo==='Y'||r.exp_call_mt==='Y') && r.duration_ms
                          ? Math.round(r.duration_ms/1000)+'s' : '—'}
                      </td>
                      <td style={{padding:'8px 12px', fontSize:11, color:'#dc2626', maxWidth:220}}>
                        {r.failure_reason ? r.failure_reason.substring(0,120)+(r.failure_reason.length>120?'...':'') : ''}
                      </td>
                      <td style={{padding:'8px', textAlign:'center'}}>
                        <span style={{
                          background:ss.badge, color:'#fff',
                          padding:'3px 8px', borderRadius:12, fontSize:11, fontWeight:700,
                          whiteSpace:'nowrap'
                        }}>{ss.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:'10px 16px', background:'#f8fafc', borderTop:'1px solid #e2e8f0',
            fontSize:12, color:'#64748b'}}>
            {results.length} records shown
          </div>
        </div>
      )}

      {results.length === 0 && !loading && mode && (
        <div className="card" style={{textAlign:'center', padding:40}}>
          <div style={{fontSize:40, marginBottom:12}}>🔍</div>
          <div style={{color:'#374151', fontSize:16, fontWeight:600}}>No results found</div>
          <div style={{color:'#94a3b8', fontSize:13, marginTop:6}}>
            Try widening your date range or clearing filters
          </div>
        </div>
      )}

      {!mode && (
        <div className="card" style={{textAlign:'center', padding:48}}>
          <div style={{fontSize:48, marginBottom:16}}>📋</div>
          <div style={{color:'#374151', fontSize:17, fontWeight:700, marginBottom:8}}>
            Choose a report type above
          </div>
          <div style={{color:'#64748b', fontSize:13, maxWidth:500, margin:'0 auto', lineHeight:1.6}}>
            <strong>Latest Result per Test Case</strong> — shows the most recent execution for each test case. Best for seeing current pass/fail status.<br/><br/>
            <strong>Full Execution History</strong> — shows every individual test run. Best for seeing all runs in a date range.
          </div>
        </div>
      )}

      {showExportDialog && (
        <ExportDialog
          cases={results}
          onClose={() => setShowExportDialog(false)}
        />
      )}
    </div>
  );
}

// ── Admin Page ─────────────────────────────────────────────────────────────────
function AdminPage() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [userForm, setUserForm] = useState({ username:'', email:'', password:'', full_name:'', role:'tester' });
  const [projectForm, setProjectForm] = useState({ name:'', code:'', type:'BAU', description:'', status:'Active' });
  const [editingUser, setEditingUser] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantRole, setGrantRole] = useState('tester');

  useEffect(() => {
    api('/users').then(setUsers).catch(e => setError(e.message));
    api('/projects').then(setProjects).catch(e => setError(e.message));
  }, []);

  async function loadMembers(projectId) {
    const m = await api(`/projects/${projectId}/members`);
    setProjectMembers(m);
  }

  async function saveUser(e) {
    e.preventDefault(); setError(null); setSuccess(null);
    try {
      if (editingUser) {
        await api(`/users/${editingUser.id}`, { method:'PATCH', body: JSON.stringify(userForm) });
        setSuccess('User updated.');
      } else {
        await api('/users', { method:'POST', body: JSON.stringify(userForm) });
        setSuccess('User created. They can now log in.');
      }
      setUserForm({ username:'', email:'', password:'', full_name:'', role:'tester' });
      setEditingUser(null);
      const u = await api('/users'); setUsers(u);
    } catch(e) { setError(e.message); }
  }

  async function toggleUser(user) {
    try {
      await api(`/users/${user.id}`, { method:'PATCH', body: JSON.stringify({ is_active: !user.is_active }) });
      const u = await api('/users'); setUsers(u);
    } catch(e) { setError(e.message); }
  }

  async function saveProject(e) {
    e.preventDefault(); setError(null); setSuccess(null);
    try {
      await api('/projects', { method:'POST', body: JSON.stringify(projectForm) });
      setSuccess('Project created.');
      setProjectForm({ name:'', code:'', type:'BAU', description:'', status:'Active' });
      const p = await api('/projects'); setProjects(p);
    } catch(e) { setError(e.message); }
  }

  async function grantAccess(projectId) {
    if (!grantUserId) return;
    try {
      await api(`/projects/${projectId}/access`, { method:'POST', body: JSON.stringify({ user_id: grantUserId, role: grantRole }) });
      setSuccess('Access granted.');
      loadMembers(projectId);
    } catch(e) { setError(e.message); }
  }

  async function revokeAccess(projectId, userId) {
    try {
      await api(`/projects/${projectId}/access/${userId}`, { method:'DELETE' });
      loadMembers(projectId);
    } catch(e) { setError(e.message); }
  }

  const tabStyle = (t) => ({
    padding:'8px 20px', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:13,
    background: tab===t ? '#2563eb' : '#16212e', color: tab===t ? '#fff' : '#93a4b8',
    marginRight:8,
  });

  return (
    <div>
      <h2>Admin Panel</h2>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div style={{marginBottom:20}}>
        <button style={tabStyle('users')} onClick={() => setTab('users')}>👥 Users</button>
        <button style={tabStyle('projects')} onClick={() => setTab('projects')}>📁 Projects</button>
        <button style={tabStyle('management')} onClick={() => setTab('management')}>⚙️ Management</button>
        <button style={tabStyle('system')} onClick={() => setTab('system')}>🖥️ System</button>
      </div>

      {/* USERS TAB */}
      {tab === 'users' && (
        <div>
          {/* User list */}
          <div className="card">
            <h3 style={{marginBottom:12}}>All Users ({users.length})</h3>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                <thead>
                  <tr style={{background:'#1F4E5F', color:'#fff'}}>
                    <th style={{padding:'8px 12px', textAlign:'left'}}>Name</th>
                    <th style={{padding:'8px 12px', textAlign:'left'}}>Username</th>
                    <th style={{padding:'8px 12px', textAlign:'left'}}>Email</th>
                    <th style={{padding:'8px 12px', textAlign:'center'}}>Role</th>
                    <th style={{padding:'8px 12px', textAlign:'center'}}>Status</th>
                    <th style={{padding:'8px 12px', textAlign:'center'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} style={{background: i%2===0 ? '#f8fafb' : '#fff', borderBottom:'1px solid #e5e7eb'}}>
                      <td style={{padding:'8px 12px', fontWeight:600}}>{u.full_name}</td>
                      <td style={{padding:'8px 12px', fontFamily:'monospace'}}>{u.username}</td>
                      <td style={{padding:'8px 12px', color:'#64748b'}}>{u.email}</td>
                      <td style={{padding:'8px', textAlign:'center'}}>
                        <span style={{
                          background: u.role==='admin' ? '#dbeafe' : '#f0fdf4',
                          color: u.role==='admin' ? '#1d4ed8' : '#15803d',
                          padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700
                        }}>{u.role}</span>
                      </td>
                      <td style={{padding:'8px', textAlign:'center'}}>
                        <span style={{
                          background: u.is_active ? '#dcfce7' : '#fee2e2',
                          color: u.is_active ? '#16a34a' : '#dc2626',
                          padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700
                        }}>{u.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td style={{padding:'8px', textAlign:'center'}}>
                        <button className="btn btn-secondary btn-sm" style={{width:'auto', marginRight:4}}
                          onClick={() => { setEditingUser(u); setUserForm({ username:u.username, email:u.email, password:'', full_name:u.full_name, role:u.role }); }}>
                          ✎ Edit
                        </button>
                        <button className="btn btn-sm" style={{width:'auto', background: u.is_active?'#dc2626':'#16a34a', color:'#fff'}}
                          onClick={() => toggleUser(u)}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create/Edit user form */}
          <div className="card">
            <h3 style={{marginBottom:12}}>{editingUser ? `Editing: ${editingUser.username}` : 'Create New User'}</h3>
            <form onSubmit={saveUser}>
              <div className="form-grid">
                <div><label>Full Name</label>
                  <input value={userForm.full_name} onChange={e => setUserForm(f=>({...f,full_name:e.target.value}))} placeholder="Eskandar Qasem" required={!editingUser}/></div>
                <div><label>Username *</label>
                  <input value={userForm.username} onChange={e => setUserForm(f=>({...f,username:e.target.value}))} placeholder="eskandar" disabled={!!editingUser} required={!editingUser}/></div>
                <div><label>Email *</label>
                  <input type="email" value={userForm.email} onChange={e => setUserForm(f=>({...f,email:e.target.value}))} placeholder="eskandar@company.com" disabled={!!editingUser} required={!editingUser}/></div>
                <div><label>{editingUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                  <input type="password" value={userForm.password} onChange={e => setUserForm(f=>({...f,password:e.target.value}))} placeholder="••••••••" required={!editingUser}/></div>
                <div><label>Role</label>
                  <select value={userForm.role} onChange={e => setUserForm(f=>({...f,role:e.target.value}))}>
                    <option value="viewer">Viewer (read only)</option>
                    <option value="tester">Tester (run tests)</option>
                    <option value="admin">Admin (full access)</option>
                  </select></div>
              </div>
              <div style={{marginTop:12, display:'flex', gap:8}}>
                <button type="submit" className="btn btn-primary">{editingUser ? 'Update User' : 'Create User'}</button>
                {editingUser && <button type="button" className="btn btn-secondary" onClick={() => { setEditingUser(null); setUserForm({username:'',email:'',password:'',full_name:'',role:'tester'}); }}>Cancel</button>}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROJECTS TAB */}
      {tab === 'projects' && (
        <div>
          <div className="card">
            <h3 style={{marginBottom:12}}>Projects ({projects.length})</h3>
            {projects.map(p => (
              <div key={p.id} style={{
                border:'1px solid #e2e8f0', borderRadius:10, padding:16, marginBottom:12,
                background: selectedProject?.id===p.id ? '#eff6ff' : '#fff'
              }}>
                <div style={{display:'flex', alignItems:'center', gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700, fontSize:15}}>{p.name}
                      <span style={{marginLeft:8, background:'#dbeafe', color:'#1d4ed8', padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700}}>{p.code}</span>
                      <span style={{marginLeft:6, background:'#f0fdf4', color:'#16a34a', padding:'2px 8px', borderRadius:12, fontSize:11}}>{p.type}</span>
                    </div>
                    <div style={{color:'#64748b', fontSize:12, marginTop:4}}>{p.description}</div>
                    <div style={{color:'#94a3b8', fontSize:11, marginTop:2}}>
                      {p.test_case_count || 0} test cases · {p.member_count || 0} members
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{width:'auto'}}
                    onClick={() => {
                      setSelectedProject(selectedProject?.id===p.id ? null : p);
                      loadMembers(p.id);
                    }}>
                    {selectedProject?.id===p.id ? 'Close' : 'Manage Access'}
                  </button>
                </div>

                {selectedProject?.id===p.id && (
                  <div style={{marginTop:16, padding:16, background:'#f8fafc', borderRadius:8}}>
                    <h4 style={{marginBottom:8}}>Project Members</h4>
                    {projectMembers.length === 0 && <div style={{color:'#94a3b8', fontSize:13}}>No members yet</div>}
                    {projectMembers.map(m => (
                      <div key={m.id} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'1px solid #e2e8f0'}}>
                        <div style={{flex:1}}>
                          <span style={{fontWeight:600}}>{m.full_name}</span>
                          <span style={{color:'#64748b', fontSize:12, marginLeft:8}}>@{m.username}</span>
                          <span style={{marginLeft:8, background:'#f0fdf4', color:'#16a34a', padding:'1px 6px', borderRadius:10, fontSize:11}}>{m.project_role}</span>
                        </div>
                        <button className="btn btn-sm" style={{width:'auto', background:'#dc2626', color:'#fff', fontSize:11}}
                          onClick={() => revokeAccess(p.id, m.id)}>Remove</button>
                      </div>
                    ))}

                    <div style={{marginTop:12, display:'flex', gap:8, alignItems:'center'}}>
                      <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)} style={{flex:1}}>
                        <option value="">Select user to add...</option>
                        {users.filter(u => !projectMembers.find(m => m.id === u.id)).map(u => (
                          <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>
                        ))}
                      </select>
                      <select value={grantRole} onChange={e => setGrantRole(e.target.value)}>
                        <option value="viewer">Viewer</option>
                        <option value="tester">Tester</option>
                        <option value="lead">Lead</option>
                      </select>
                      <button className="btn btn-primary" style={{width:'auto'}} onClick={() => grantAccess(p.id)}>
                        Grant Access
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Create project form */}
          <div className="card">
            <h3 style={{marginBottom:12}}>Create New Project</h3>
            <form onSubmit={saveProject}>
              <div className="form-grid">
                <div><label>Project Name *</label>
                  <input value={projectForm.name} onChange={e => setProjectForm(f=>({...f,name:e.target.value}))} placeholder="VoLTE Regression 2026" required/></div>
                <div><label>Code * (short ID)</label>
                  <input value={projectForm.code} onChange={e => setProjectForm(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="VLT-REG-26" maxLength={20} required/></div>
                <div><label>Type</label>
                  <select value={projectForm.type} onChange={e => setProjectForm(f=>({...f,type:e.target.value}))}>
                    {['BAU','CR','Project','Regression','Sanity','Other'].map(t => <option key={t}>{t}</option>)}
                  </select></div>
                <div><label>Status</label>
                  <select value={projectForm.status} onChange={e => setProjectForm(f=>({...f,status:e.target.value}))}>
                    {['Active','Completed','On Hold','Cancelled'].map(s => <option key={s}>{s}</option>)}
                  </select></div>
                <div style={{gridColumn:'1/-1'}}><label>Description</label>
                  <input value={projectForm.description} onChange={e => setProjectForm(f=>({...f,description:e.target.value}))} placeholder="What this project covers"/></div>
              </div>
              <button type="submit" className="btn btn-primary" style={{marginTop:12}}>Create Project</button>
            </form>
          </div>
        </div>
      )}

      {/* MANAGEMENT TAB */}
      {tab === 'management' && (
        <ManagementTab />
      )}

      {tab === 'system' && (
        <SystemMonitorTab />
      )}

    </div>
  );
}

function ManagementTab() {
  const [lists, setLists] = React.useState({});
  const [activeCategory, setActiveCategory] = React.useState('network_type');
  const [newValue, setNewValue] = React.useState('');
  const [newLabel, setNewLabel] = React.useState('');
  const [msg, setMsg] = React.useState('');

  const categories = [
    { key: 'network_type', label: '📶 Network Types' },
    { key: 'profile', label: '👤 Profiles' },
    { key: 'handset_label', label: '📱 Handset Labels' },
    { key: 'call_type', label: '📞 Call Types' },
    { key: 'test_reason', label: '🔍 Test Reasons' },
    { key: 'environment', label: '🌐 Environments' },
  ];

  async function loadLists() {
    const data = await api('/management/lists').catch(() => ({}));
    setLists(data);
  }

  React.useEffect(() => { loadLists(); }, []);

  async function addItem() {
    if (!newValue.trim()) return;
    await api('/management/lists', { method: 'POST', body: JSON.stringify({
      category: activeCategory, value: newValue.trim(), label: newLabel.trim() || newValue.trim()
    })});
    setNewValue(''); setNewLabel('');
    setMsg('Added successfully');
    loadLists();
    setTimeout(() => setMsg(''), 2000);
  }

  async function deleteItem(id) {
    if (!confirm('Delete this item?')) return;
    await api(`/management/lists/${id}`, { method: 'DELETE' });
    setMsg('Deleted');
    loadLists();
    setTimeout(() => setMsg(''), 2000);
  }

  async function toggleActive(item) {
    await api(`/management/lists/${item.id}`, { method: 'PATCH',
      body: JSON.stringify({ is_active: !item.is_active }) });
    loadLists();
  }

  const currentItems = lists[activeCategory] || [];

  return (
    <div>
      <div className="card">
        <h3 style={{marginBottom:16}}>⚙️ Dropdown List Management</h3>
        <p style={{color:'#64748b', fontSize:13, marginBottom:16}}>
          Manage the options available in dropdowns across the system. Changes apply immediately to all users.
        </p>

        {/* Category tabs */}
        <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:20}}>
          {categories.map(cat => (
            <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
              style={{padding:'7px 14px', borderRadius:8, border:'none', cursor:'pointer',
                fontSize:12, fontWeight:600,
                background: activeCategory === cat.key ? '#2563eb' : '#f1f5f9',
                color: activeCategory === cat.key ? '#fff' : '#374151'}}>
              {cat.label}
            </button>
          ))}
        </div>

        {msg && <div className="success" style={{marginBottom:12}}>{msg}</div>}

        {/* Current items */}
        <div style={{marginBottom:16}}>
          <h4 style={{marginBottom:8, color:'#1a3a4e'}}>
            Current items ({currentItems.length})
          </h4>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
            <thead>
              <tr style={{background:'#1F4E5F', color:'#fff'}}>
                <th style={{padding:'8px 12px', textAlign:'left'}}>Value</th>
                <th style={{padding:'8px 12px', textAlign:'left'}}>Label</th>
                <th style={{padding:'8px 12px', textAlign:'center'}}>Order</th>
                <th style={{padding:'8px 12px', textAlign:'center'}}>Active</th>
                <th style={{padding:'8px 12px', textAlign:'center'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map((item, i) => (
                <tr key={item.id} style={{background: i%2===0?'#f8fafb':'#fff', borderBottom:'1px solid #e5e7eb'}}>
                  <td style={{padding:'8px 12px', fontWeight:600}}>{item.value}</td>
                  <td style={{padding:'8px 12px'}}>{item.label}</td>
                  <td style={{padding:'8px', textAlign:'center'}}>{item.sort_order}</td>
                  <td style={{padding:'8px', textAlign:'center'}}>
                    <span style={{background: item.is_active ? '#dcfce7':'#fee2e2',
                      color: item.is_active ? '#16a34a':'#dc2626',
                      padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:700,
                      cursor:'pointer'}} onClick={() => toggleActive(item)}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{padding:'8px', textAlign:'center'}}>
                    <button className="btn btn-danger btn-sm" style={{width:'auto'}}
                      onClick={() => deleteItem(item.id)}>✕ Delete</button>
                  </td>
                </tr>
              ))}
              {currentItems.length === 0 && (
                <tr><td colSpan={5} style={{padding:20, textAlign:'center', color:'#94a3b8'}}>
                  No items yet — add one below
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add new item */}
        <div style={{background:'#f8fafc', borderRadius:8, padding:16, border:'1px solid #e2e8f0'}}>
          <h4 style={{marginBottom:12, color:'#1a3a4e'}}>Add New Item</h4>
          <div style={{display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap'}}>
            <div>
              <label style={{fontSize:11, fontWeight:600, color:'#64748b', display:'block', marginBottom:4}}>VALUE *</label>
              <input value={newValue} onChange={e => setNewValue(e.target.value)}
                placeholder="e.g. VoLTE" style={{width:160, padding:'8px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13}} />
            </div>
            <div>
              <label style={{fontSize:11, fontWeight:600, color:'#64748b', display:'block', marginBottom:4}}>DISPLAY LABEL</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Same as value if blank" style={{width:200, padding:'8px 10px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13}} />
            </div>
            <button className="btn btn-primary" onClick={addItem}>+ Add Item</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// AI CHATBOT PAGE — Create test cases via natural language
// ══════════════════════════════════════════════════════════════════════════════
function AIChatbotPage() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `👋 Hi! I'm your AI Test Case Assistant.

I can help you:
• **Create test cases** — describe them in plain English and I'll generate them
• **Generate reports** — ask me to summarize today's results
• **Bulk create** — paste a list of test descriptions and I'll create them all

**Example prompts:**
- *"Create 5 VoLTE call test cases for project NOKIA-IMS01 between +64224794052 and +64266500271"*
- *"Add 3 SMS test cases for CR-2026-001, sender on Prepaid VoLTE, receiver on Postpaid"*
- *"Create a regression test case for on-net to off-net call"*
- *"Summarize today's test results"*

What would you like to do?`,
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [projects, setProjects] = useState([]);
  const messagesEndRef = React.useRef(null);

  useEffect(() => {
    api('/projects').then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setPreview([]);
    setSaved(false);

    setMessages(m => [...m, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      // Get current context for AI
      const [existingCases, projectList, summary] = await Promise.all([
        api('/test-cases').catch(() => []),
        api('/projects').catch(() => []),
        api('/results/summary').catch(() => ({})),
      ]);

      const projectContext = projectList.map(p =>
        `${p.project_number||p.code} — ${p.name} (ID: ${p.id})`
      ).join('\n');

      const existingIds = existingCases.map(tc => tc.tc_id).join(', ');
      const todaySummary = `Total: ${summary.total||0}, Passed: ${summary.Passed||0}, Failed: ${summary.Failed||0}, Blocked: ${summary.Blocked||0}, Not Run: ${summary['Not Run']||0}`;

      const systemPrompt = `You are an AI assistant for a Telecom Test Automation Platform used by 2degrees (New Zealand telecom).

Your job is to help create test cases and generate reports.

AVAILABLE PROJECTS:
${projectContext || 'No projects yet'}

EXISTING TEST CASE IDs (avoid duplicates):
${existingIds || 'None yet'}

TODAY'S TEST SUMMARY:
${todaySummary}

RULES FOR TEST CASE CREATION:
- Always respond with a JSON block when creating test cases
- Format: \`\`\`json { "action": "create_test_cases", "test_cases": [...] }\`\`\`
- Each test case must have these fields:
  - tc_id: unique ID like "Call-001" or "SMS-001" 
  - flow: e.g. "On-net to On-net", "P2P", "VoLTE to VoLTE"
  - environment: "Prod" or "Preprod"
  - description: clear test description
  - a_party_msisdn: calling number
  - a_party_network: "2D - VoLTE", "2D - VoWiFi", "3G", "5G", or "CS"
  - a_party_profile: "Prepaid" or "Postpaid"
  - a_party_handset_label: "A", "B", "C", or "D"
  - b_party_msisdn: receiving number
  - b_party_network: same options
  - b_party_profile: "Prepaid" or "Postpaid"
  - b_party_handset_label: "A", "B", "C", or "D"
  - exp_call_mo: "Y" or "N"
  - exp_call_mt: "Y" or "N"
  - exp_sms: "Y" or "N"
  - exp_sms_notification: "Y" or "N"
  - exp_delivery_report: "Y" or "N"
  - call_duration_seconds: 15 (default)
  - call_type: "VoLTE", "VoWiFi", "CS", or "5G"
  - sms_text: "Test 123" (default)
  - work_type: "Project" or "Individual"
  - work_ref_number: project number if applicable
  - work_ref_name: project name if applicable
  - test_reason_type: "CR", "Regression", "BAU", "Sanity", "Confirmation", "Pre-test", "Post-test", or "Other"
  - test_reason_ref: CR number or reference if applicable
  - assigned_to: leave blank unless specified

For REPORT requests, respond with plain text summary.
For QUESTIONS, answer helpfully about the platform.
Always explain what you're creating BEFORE the JSON block.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [
            ...messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0).map(m => ({
              role: m.role,
              content: m.content,
            })),
            { role: 'user', content: userMsg }
          ],
        }),
      });

      const data = await response.json();
      const text = data.content?.map(b => b.text || '').join('') || 'Sorry, I could not process that request.';

      // Extract JSON if present
      const jsonMatch = text.match(/```json\n?([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.action === 'create_test_cases' && parsed.test_cases) {
            setPreview(parsed.test_cases);
          }
        } catch(e) { /* ignore parse errors */ }
      }

      setMessages(m => [...m, { role: 'assistant', content: text }]);
    } catch(e) {
      setMessages(m => [...m, {
        role: 'assistant',
        content: `❌ Error: ${e.message}. Please try again.`
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function saveTestCases() {
    if (!preview.length) return;
    setSaving(true);
    let created = 0;
    let errors = [];

    for (const tc of preview) {
      try {
        await api('/test-cases', { method: 'POST', body: JSON.stringify(tc) });
        created++;
      } catch(e) {
        errors.push(`${tc.tc_id}: ${e.message}`);
      }
    }

    setSaving(false);
    setSaved(true);
    setPreview([]);

    const resultMsg = errors.length > 0
      ? `✅ Created ${created} test cases. ⚠️ ${errors.length} failed:\n${errors.join('\n')}`
      : `✅ Successfully created ${created} test case${created > 1 ? 's' : ''}! Go to Test Cases page to view them.`;

    setMessages(m => [...m, { role: 'assistant', content: resultMsg }]);
  }

  function formatMessage(content) {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/```json[\s\S]*?```/g, '') // Remove JSON blocks from display
      .replace(/\n/g, '<br/>')
      .replace(/• /g, '• ');
  }

  return (
    <div style={{display:'flex', flexDirection:'column', height:'calc(100vh - 120px)', maxWidth:1000, margin:'0 auto'}}>

      {/* Header */}
      <div style={{background:'linear-gradient(135deg,#1a3a4e,#2563eb)', borderRadius:12, padding:'16px 20px', marginBottom:16, color:'#fff'}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{fontSize:32}}>🤖</div>
          <div>
            <div style={{fontWeight:700, fontSize:18}}>AI Test Case Assistant</div>
            <div style={{fontSize:12, opacity:0.8}}>Powered by Claude — describe your tests in plain English</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{flex:1, overflowY:'auto', padding:'0 4px', marginBottom:12}}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display:'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom:12,
          }}>
            <div style={{
              maxWidth:'85%',
              background: msg.role === 'user' ? '#2563eb' : '#fff',
              color: msg.role === 'user' ? '#fff' : '#1a202c',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              padding:'12px 16px',
              boxShadow:'0 2px 8px rgba(0,0,0,0.08)',
              border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
              fontSize:14, lineHeight:1.6,
            }}
              dangerouslySetInnerHTML={{__html: formatMessage(msg.content)}}
            />
          </div>
        ))}

        {loading && (
          <div style={{display:'flex', justifyContent:'flex-start', marginBottom:12}}>
            <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:'18px 18px 18px 4px',
              padding:'12px 16px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
              <div style={{display:'flex', gap:4, alignItems:'center'}}>
                <div style={{width:8, height:8, borderRadius:'50%', background:'#2563eb', animation:'pulse 1s infinite'}} />
                <div style={{width:8, height:8, borderRadius:'50%', background:'#2563eb', animation:'pulse 1s infinite 0.2s'}} />
                <div style={{width:8, height:8, borderRadius:'50%', background:'#2563eb', animation:'pulse 1s infinite 0.4s'}} />
                <span style={{marginLeft:8, fontSize:13, color:'#64748b'}}>AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Preview panel */}
      {preview.length > 0 && (
        <div style={{background:'#f0fdf4', border:'2px solid #16a34a', borderRadius:10, padding:16, marginBottom:12}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div style={{fontWeight:700, color:'#15803d', fontSize:15}}>
              ✅ {preview.length} test case{preview.length > 1 ? 's' : ''} ready to save
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-secondary btn-sm" style={{width:'auto'}}
                onClick={() => setPreview([])}>✕ Discard</button>
              <button className="btn btn-success" style={{width:'auto'}}
                onClick={saveTestCases} disabled={saving}>
                {saving ? '⏳ Saving...' : `💾 Save ${preview.length} Test Case${preview.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
              <thead>
                <tr style={{background:'#166534', color:'#fff'}}>
                  <th style={{padding:'6px 10px', textAlign:'left'}}>TC ID</th>
                  <th style={{padding:'6px 10px', textAlign:'left'}}>Flow</th>
                  <th style={{padding:'6px 10px', textAlign:'left'}}>Description</th>
                  <th style={{padding:'6px 10px', textAlign:'center'}}>A-Party</th>
                  <th style={{padding:'6px 10px', textAlign:'center'}}>B-Party</th>
                  <th style={{padding:'6px 10px', textAlign:'center'}}>Expected</th>
                  <th style={{padding:'6px 10px', textAlign:'left'}}>Project</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((tc, i) => (
                  <tr key={i} style={{background: i%2===0?'#dcfce7':'#f0fdf4', borderBottom:'1px solid #bbf7d0'}}>
                    <td style={{padding:'6px 10px', fontWeight:700, color:'#15803d'}}>{tc.tc_id}</td>
                    <td style={{padding:'6px 10px'}}>{tc.flow}</td>
                    <td style={{padding:'6px 10px', maxWidth:200}}>{(tc.description||'').substring(0,60)}{tc.description?.length>60?'...':''}</td>
                    <td style={{padding:'6px 10px', textAlign:'center', fontSize:11}}>
                      {tc.a_party_msisdn}<br/><span style={{color:'#64748b'}}>{tc.a_party_network}</span>
                    </td>
                    <td style={{padding:'6px 10px', textAlign:'center', fontSize:11}}>
                      {tc.b_party_msisdn}<br/><span style={{color:'#64748b'}}>{tc.b_party_network}</span>
                    </td>
                    <td style={{padding:'6px 10px', textAlign:'center', fontSize:11}}>
                      Call:{tc.exp_call_mo} SMS:{tc.exp_sms}
                    </td>
                    <td style={{padding:'6px 10px', fontSize:11}}>{tc.work_ref_number||tc.work_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Input area */}
      <div style={{background:'#fff', border:'2px solid #e2e8f0', borderRadius:12, padding:12,
        boxShadow:'0 4px 12px rgba(0,0,0,0.05)'}}>
        <div style={{display:'flex', gap:10, alignItems:'flex-end'}}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
            placeholder="Describe the test cases you want to create... (Press Enter to send, Shift+Enter for new line)"
            style={{flex:1, border:'none', outline:'none', resize:'none', fontSize:14,
              minHeight:60, maxHeight:120, lineHeight:1.5, fontFamily:'inherit'}}
            rows={2}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            style={{padding:'10px 20px', background: loading||!input.trim() ? '#94a3b8' : '#2563eb',
              color:'#fff', border:'none', borderRadius:8, cursor: loading||!input.trim() ? 'default':'pointer',
              fontWeight:700, fontSize:14, whiteSpace:'nowrap', alignSelf:'flex-end'}}>
            {loading ? '⏳' : '➤ Send'}
          </button>
        </div>

        {/* Quick prompts */}
        <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
          {[
            'Create 3 VoLTE call test cases',
            'Create SMS test cases for a CR',
            'Generate a Regression test suite',
            "Summarize today's results",
            'Create on-net to off-net tests',
          ].map(prompt => (
            <button key={prompt} onClick={() => setInput(prompt)}
              style={{padding:'4px 10px', background:'#f1f5f9', border:'1px solid #e2e8f0',
                borderRadius:20, fontSize:11, cursor:'pointer', color:'#374151',
                fontWeight:500, ':hover':{background:'#e2e8f0'}}}>
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TCR REPORTS PAGE — Test Case Run summary with progress cards
// ══════════════════════════════════════════════════════════════════════════════
function TCRReportsPage() {
  const [runs, setRuns] = useState([]);
  const [overall, setOverall] = useState({ activeRuns:0, totalPassed:0, totalFailed:0, totalBlocked:0 });
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState(null);
  const [runDetails, setRunDetails] = useState([]);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    const data = await api('/tcr/runs').catch(() => ({ runs: [], overall: {} }));
    setRuns(data.runs || []);
    setOverall(data.overall || {});
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function viewDetails(run) {
    if (expandedRun === run.key) { setExpandedRun(null); return; }
    setExpandedRun(run.key);
    const details = await api(`/tcr/runs/${encodeURIComponent(run.key)}/details`).catch(() => []);
    setRunDetails(details);
  }

  function statusBadge(status) {
    const map = {
      'Completed': { bg:'#dcfce7', color:'#16a34a' },
      'In Progress': { bg:'#dbeafe', color:'#2563eb' },
      'Not Started': { bg:'#f1f5f9', color:'#64748b' },
    };
    const s = map[status] || map['Not Started'];
    return <span style={{background:s.bg, color:s.color, padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700}}>{status}</span>;
  }

  async function exportToExcel() {
    setExporting(true);
    try {
      // Build a workbook client-side using SheetJS (already available)
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ['TCR Report — Test Case Run Summary'],
        ['Generated', new Date().toLocaleString()],
        [],
        ['Metric', 'Value'],
        ['Active Runs', overall.activeRuns],
        ['Total Passed', overall.totalPassed],
        ['Total Failed', overall.totalFailed],
        ['Total Blocked', overall.totalBlocked],
        [],
        ['Run Name', 'Type', 'Status', 'Total', 'Passed', 'Failed', 'Blocked', 'Not Run', 'Progress %', 'Owner'],
        ...runs.map(r => [r.name, r.type, r.status, r.total, r.passed, r.failed, r.blocked, r.notRun, r.progressPct+'%', r.owner]),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [{wch:35},{wch:12},{wch:14},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:11},{wch:20}];
      XLSX.utils.book_append_sheet(wb, summarySheet, 'TCR Summary');

      // Detail sheet for each run
      for (const run of runs) {
        const details = await api(`/tcr/runs/${encodeURIComponent(run.key)}/details`).catch(() => []);
        if (!details.length) continue;
        const detailData = [
          [run.name],
          [],
          ['TC ID', 'Description', 'Status', 'Environment', 'A-Party', 'B-Party', 'Last Executed', 'Tested By', 'Failure Reason'],
          ...details.map(d => [
            d.tc_id, d.description, d.last_status||'Not Run', d.environment,
            d.a_party_msisdn, d.b_party_msisdn,
            d.last_executed ? new Date(d.last_executed).toLocaleString() : '',
            d.last_triggered_by || '', d.last_failure_reason || '',
          ]),
        ];
        const sheet = XLSX.utils.aoa_to_sheet(detailData);
        sheet['!cols'] = [{wch:14},{wch:35},{wch:12},{wch:10},{wch:16},{wch:16},{wch:18},{wch:14},{wch:30}];
        const sheetName = (run.project_number || run.name).substring(0,31).replace(/[\\/?*[\]]/g,'-');
        XLSX.utils.book_append_sheet(wb, sheet, sheetName);
      }

      XLSX.writeFile(wb, `TCR_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch(e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20}}>
        <div>
          <h2 style={{margin:0}}>TCR Reports</h2>
          <p style={{color:'#64748b', marginTop:4}}>Manage and monitor test runs across all projects</p>
        </div>
        <button className="btn btn-primary" onClick={exportToExcel} disabled={exporting || loading}>
          {exporting ? '⏳ Exporting...' : '📊 Export to Excel'}
        </button>
      </div>

      {/* Overview stat cards */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:16, marginBottom:24}}>
        <div className="card" style={{display:'flex', alignItems:'center', gap:16}}>
          <div style={{width:48, height:48, borderRadius:10, background:'#1e3a8a', display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:20, color:'#fff'}}>▶</div>
          <div>
            <div style={{fontSize:13, color:'#64748b'}}>Active Runs</div>
            <div style={{fontSize:28, fontWeight:800, color:'#1a202c'}}>{overall.activeRuns||0}</div>
          </div>
        </div>
        <div className="card" style={{display:'flex', alignItems:'center', gap:16}}>
          <div style={{width:48, height:48, borderRadius:10, background:'#16a34a', display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:20, color:'#fff'}}>✓</div>
          <div>
            <div style={{fontSize:13, color:'#64748b'}}>Total Passed</div>
            <div style={{fontSize:28, fontWeight:800, color:'#16a34a'}}>{overall.totalPassed||0}</div>
          </div>
        </div>
        <div className="card" style={{display:'flex', alignItems:'center', gap:16}}>
          <div style={{width:48, height:48, borderRadius:10, background:'#dc2626', display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:20, color:'#fff'}}>✕</div>
          <div>
            <div style={{fontSize:13, color:'#64748b'}}>Total Failed</div>
            <div style={{fontSize:28, fontWeight:800, color:'#dc2626'}}>{overall.totalFailed||0}</div>
          </div>
        </div>
        <div className="card" style={{display:'flex', alignItems:'center', gap:16}}>
          <div style={{width:48, height:48, borderRadius:10, background:'#d97706', display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:20, color:'#fff'}}>⊘</div>
          <div>
            <div style={{fontSize:13, color:'#64748b'}}>Blocked</div>
            <div style={{fontSize:28, fontWeight:800, color:'#d97706'}}>{overall.totalBlocked||0}</div>
          </div>
        </div>
      </div>

      {loading && <div style={{textAlign:'center', padding:40, color:'#94a3b8'}}>Loading runs...</div>}

      {!loading && runs.length === 0 && (
        <div className="card" style={{textAlign:'center', padding:48, color:'#94a3b8'}}>
          <div style={{fontSize:40, marginBottom:12}}>📭</div>
          <div>No test runs yet. Create test cases linked to a project to see them here.</div>
        </div>
      )}

      {/* Run cards */}
      {runs.map(run => (
        <div key={run.key} className="card" style={{marginBottom:16, padding:20}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10}}>
            <div style={{flex:1, minWidth:280}}>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
                <span style={{fontSize:12, color:'#94a3b8', fontFamily:'monospace'}}>{run.project_number || run.key}</span>
                {statusBadge(run.status)}
                {run.test_reason_type && (
                  <span style={{background:'#f1f5f9', color:'#475569', padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:600}}>
                    {run.test_reason_type}
                  </span>
                )}
              </div>
              <div style={{fontSize:19, fontWeight:700, color:'#1a202c', marginBottom:4}}>{run.name}</div>
              <div style={{fontSize:13, color:'#64748b'}}>
                {run.owner ? run.owner + ' · ' : ''}
                {run.lastActivity ? 'Last activity ' + new Date(run.lastActivity).toLocaleString() : 'No activity yet'}
              </div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-secondary" onClick={() => viewDetails(run)}>
                {expandedRun === run.key ? '▲ Hide' : '📊 Results'}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{marginTop:16}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:13, color:'#64748b', marginBottom:6}}>
              <span>Execution Progress</span>
              <span>{run.executed}/{run.total} ({run.progressPct}%)</span>
            </div>
            <div style={{height:10, background:'#f1f5f9', borderRadius:6, overflow:'hidden', display:'flex'}}>
              {run.total > 0 && (
                <>
                  <div style={{width:(run.passed/run.total*100)+'%', background:'#16a34a'}} />
                  <div style={{width:(run.failed/run.total*100)+'%', background:'#dc2626'}} />
                  <div style={{width:(run.blocked/run.total*100)+'%', background:'#d97706'}} />
                </>
              )}
            </div>
          </div>

          {/* Stat boxes */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10, marginTop:16}}>
            {[
              { label:'Total', value:run.total, color:'#1a202c' },
              { label:'Passed', value:run.passed, color:'#16a34a' },
              { label:'Failed', value:run.failed, color:'#dc2626' },
              { label:'Blocked', value:run.blocked, color:'#d97706' },
              { label:'Not Run', value:run.notRun, color:'#94a3b8' },
            ].map(s => (
              <div key={s.label} style={{background:'#f8fafc', borderRadius:8, padding:'10px 8px', textAlign:'center'}}>
                <div style={{fontSize:11, color:'#64748b', fontWeight:600}}>{s.label}</div>
                <div style={{fontSize:22, fontWeight:800, color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Expanded details table */}
          {expandedRun === run.key && (
            <div style={{marginTop:16, borderTop:'1px solid #e2e8f0', paddingTop:16}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
                  <thead>
                    <tr style={{background:'#1F4E5F', color:'#fff'}}>
                      <th style={{padding:'6px 10px', textAlign:'left'}}>TC ID</th>
                      <th style={{padding:'6px 10px', textAlign:'left'}}>Description</th>
                      <th style={{padding:'6px 10px', textAlign:'center'}}>Status</th>
                      <th style={{padding:'6px 10px', textAlign:'left'}}>Last Executed</th>
                      <th style={{padding:'6px 10px', textAlign:'left'}}>Tested By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runDetails.map((d, i) => (
                      <tr key={d.id} style={{background: i%2===0?'#f8fafc':'#fff', borderBottom:'1px solid #f1f5f9'}}>
                        <td style={{padding:'6px 10px', fontWeight:700}}>{d.tc_id}</td>
                        <td style={{padding:'6px 10px', maxWidth:250}}>{(d.description||'').substring(0,70)}</td>
                        <td style={{padding:'6px 10px', textAlign:'center'}}>
                          <Badge status={d.last_status || 'Not Run'} />
                        </td>
                        <td style={{padding:'6px 10px', fontSize:11}}>
                          {d.last_executed ? new Date(d.last_executed).toLocaleString() : '—'}
                        </td>
                        <td style={{padding:'6px 10px', fontSize:11}}>{d.last_triggered_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// EXPORT DIALOG — Column selector for Excel/CSV export
// ══════════════════════════════════════════════════════════════════════════════
const ALL_EXPORT_COLUMNS = [
  { key: 'tc_id',               label: 'TC ID',               default: true  },
  { key: 'traceability_label',  label: 'Traceability',        default: true  },
  { key: 'flow',                label: 'Flow',                default: true  },
  { key: 'environment',         label: 'Environment',         default: true  },
  { key: 'description',         label: 'Description',         default: true  },
  { key: 'a_party_msisdn',      label: 'A-Party MSISDN',      default: true  },
  { key: 'a_party_network',     label: 'A-Party Network',     default: true  },
  { key: 'a_party_profile',     label: 'A-Party Profile',     default: false },
  { key: 'a_party_handset_label',label:'A-Party Handset',     default: false },
  { key: 'b_party_msisdn',      label: 'B-Party MSISDN',      default: true  },
  { key: 'b_party_network',     label: 'B-Party Network',     default: true  },
  { key: 'b_party_profile',     label: 'B-Party Profile',     default: false },
  { key: 'b_party_handset_label',label:'B-Party Handset',     default: false },
  { key: 'exp_call_mo',         label: 'Exp. Call MO',        default: true  },
  { key: 'exp_call_mt',         label: 'Exp. Call MT',        default: true  },
  { key: 'exp_sms',             label: 'Exp. SMS',            default: true  },
  { key: 'exp_sms_notification',label: 'Exp. SMS Notif.',     default: false },
  { key: 'exp_delivery_report', label: 'Exp. Del. Report',    default: false },
  { key: 'actual_call_mo',      label: 'Actual Call MO',      default: true  },
  { key: 'actual_call_mt',      label: 'Actual Call MT',      default: true  },
  { key: 'actual_sms',          label: 'Actual SMS',          default: true  },
  { key: 'actual_sms_notification',label:'Actual SMS Notif.', default: false },
  { key: 'actual_delivery_report',label:'Actual Del. Report', default: false },
  { key: 'status',              label: 'Status',              default: true  },
  { key: 'failure_reason',      label: 'Failure Reason',      default: true  },
  { key: 'executed_at',         label: 'Executed At',         default: true  },
  { key: 'triggered_by',        label: 'Tested By',           default: true  },
  { key: 'assigned_to',         label: 'Assigned To',         default: true  },
  { key: 'work_type',           label: 'Work Type',           default: false },
  { key: 'work_ref_number',     label: 'Project Number',      default: true  },
  { key: 'work_ref_name',       label: 'Project Name',        default: false },
  { key: 'test_reason_type',    label: 'Test Reason',         default: false },
  { key: 'test_reason_ref',     label: 'Test Reason Ref',     default: false },
  { key: 'call_duration_seconds',label:'Call Duration (s)',   default: false },
  { key: 'call_type',           label: 'Call Type',           default: false },
  { key: 'sms_text',            label: 'SMS Text',            default: false },
];

function ExportDialog({ cases, onClose }) {
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(ALL_EXPORT_COLUMNS.map(c => [c.key, c.default]))
  );
  const [format, setFormat] = useState('excel');
  const [exporting, setExporting] = useState(false);

  function toggle(key) {
    setSelected(s => ({ ...s, [key]: !s[key] }));
  }

  function selectAll() { setSelected(Object.fromEntries(ALL_EXPORT_COLUMNS.map(c => [c.key, true]))); }
  function selectNone() { setSelected(Object.fromEntries(ALL_EXPORT_COLUMNS.map(c => [c.key, false]))); }
  function selectDefault() { setSelected(Object.fromEntries(ALL_EXPORT_COLUMNS.map(c => [c.key, c.default]))); }

  async function doExport() {
    setExporting(true);
    const cols = ALL_EXPORT_COLUMNS.filter(c => selected[c.key]);
    if (!cols.length) { alert('Select at least one column'); setExporting(false); return; }

    try {
      // Fetch full results data from API
      const results = await api('/results').catch(() => cases);
      const data = results.length ? results : cases;

      if (format === 'csv') {
        const header = cols.map(c => c.label).join(',');
        const rows = data.map(r => cols.map(c => {
          const v = r[c.key] ?? '';
          return String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : v;
        }).join(','));
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `TCR_Export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
      } else {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        // Header row
        const header = cols.map(c => c.label);
        const rows = data.map(r => cols.map(c => r[c.key] ?? ''));

        // Apply conditional formatting via cell styles
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

        // Set column widths
        ws['!cols'] = cols.map(c => ({
          wch: Math.max(c.label.length, 12)
        }));

        // Bold header row
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
          if (cell) {
            cell.s = { font: { bold: true }, fill: { fgColor: { rgb: '1F4E5F' } },
              font: { bold: true, color: { rgb: 'FFFFFF' } } };
          }
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Test Results');

        // Summary sheet
        const statusCounts = {};
        data.forEach(r => { const s = r.status||'Not Run'; statusCounts[s] = (statusCounts[s]||0)+1; });
        const summaryData = [
          ['Test Results Summary'],
          ['Exported', new Date().toLocaleString()],
          ['Total Records', data.length],
          [],
          ['Status', 'Count', 'Percentage'],
          ...Object.entries(statusCounts).map(([s,n]) => [s, n, ((n/data.length)*100).toFixed(1)+'%']),
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
        ws2['!cols'] = [{wch:20},{wch:10},{wch:12}];
        XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

        XLSX.writeFile(wb, `TCR_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      }
      onClose();
    } catch(e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:1000}} onClick={onClose}>
      <div style={{background:'#fff', borderRadius:14, padding:24, width:620, maxWidth:'95vw',
        maxHeight:'85vh', overflow:'hidden', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}} onClick={e=>e.stopPropagation()}>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div>
            <div style={{fontWeight:700, fontSize:17, color:'#1a3a4e'}}>📊 Export Report</div>
            <div style={{fontSize:13, color:'#64748b', marginTop:2}}>Select columns to include in your export</div>
          </div>
          <button onClick={onClose} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8'}}>✕</button>
        </div>

        {/* Format selector */}
        <div style={{display:'flex', gap:10, marginBottom:16, padding:'12px', background:'#f8fafc', borderRadius:8}}>
          <span style={{fontSize:13, fontWeight:600, color:'#374151', alignSelf:'center'}}>Format:</span>
          {[{v:'excel',l:'📊 Excel (.xlsx)'},{v:'csv',l:'📄 CSV (.csv)'}].map(f=>(
            <button key={f.v} onClick={()=>setFormat(f.v)}
              style={{padding:'7px 16px', borderRadius:7, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                background: format===f.v ? '#2563eb' : '#e2e8f0',
                color: format===f.v ? '#fff' : '#374151'}}>
              {f.l}
            </button>
          ))}
          <span style={{marginLeft:'auto', fontSize:12, color:'#2563eb', fontWeight:600}}>
            {selectedCount} columns selected
          </span>
        </div>

        {/* Quick select buttons */}
        <div style={{display:'flex', gap:8, marginBottom:12}}>
          <button onClick={selectAll} style={{padding:'4px 12px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', cursor:'pointer', fontSize:12}}>Select All</button>
          <button onClick={selectNone} style={{padding:'4px 12px', border:'1px solid #d1d5db', borderRadius:6, background:'#fff', cursor:'pointer', fontSize:12}}>None</button>
          <button onClick={selectDefault} style={{padding:'4px 12px', border:'1px solid #2563eb', borderRadius:6, background:'#eff6ff', color:'#2563eb', cursor:'pointer', fontSize:12, fontWeight:600}}>Default</button>
        </div>

        {/* Column checkboxes */}
        <div style={{overflowY:'auto', flex:1, border:'1px solid #e2e8f0', borderRadius:8, padding:12}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6}}>
            {ALL_EXPORT_COLUMNS.map(col => (
              <label key={col.key} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 8px',
                borderRadius:6, cursor:'pointer', fontSize:13,
                background: selected[col.key] ? '#eff6ff' : '#fff',
                border: selected[col.key] ? '1px solid #2563eb' : '1px solid #e2e8f0',
                color: selected[col.key] ? '#1d4ed8' : '#374151',
                fontWeight: selected[col.key] ? 600 : 400}}>
                <input type="checkbox" checked={!!selected[col.key]} onChange={()=>toggle(col.key)}
                  style={{width:14, height:14, cursor:'pointer'}} />
                {col.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:16}}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={doExport} disabled={exporting || !selectedCount}>
            {exporting ? '⏳ Exporting...' : `📥 Export ${selectedCount} columns`}
          </button>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM TAB — Update, restart, status
// ══════════════════════════════════════════════════════════════════════════════
function SystemTab() {
  const [status, setStatus] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [autoRestart, setAutoRestart] = useState(false);

  async function loadStatus() {
    const data = await api('/system/status').catch(() => null);
    setStatus(data);
  }

  useEffect(() => { loadStatus(); }, []);

  async function runUpdate() {
    if (!confirm('Pull latest code from GitHub and update the system?')) return;
    setUpdating(true);
    setUpdateResult(null);
    try {
      const result = await api('/system/update', {
        method: 'POST',
        body: JSON.stringify({ autoRestart }),
      });
      setUpdateResult(result);
      if (result.ok) loadStatus();
    } catch(e) {
      setUpdateResult({ ok: false, steps: [], error: e.message });
    } finally {
      setUpdating(false);
    }
  }

  const formatUptime = (s) => {
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div>
      {/* Status card */}
      <div className="card" style={{marginBottom:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <h3 style={{margin:0}}>🖥️ System Status</h3>
          <button className="btn btn-secondary btn-sm" style={{width:'auto'}} onClick={loadStatus}>⟳ Refresh</button>
        </div>

        {status ? (
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12}}>
            {[
              { label:'Version', value: status.version, icon:'🏷️' },
              { label:'Environment', value: status.env, icon:'🌐' },
              { label:'Node.js', value: status.nodeVersion, icon:'⚙️' },
              { label:'Uptime', value: formatUptime(status.uptime), icon:'⏱️' },
              { label:'Memory', value: status.memory, icon:'💾' },
              { label:'Platform', value: status.platform, icon:'💻' },
            ].map(s => (
              <div key={s.label} style={{background:'#f8fafc', borderRadius:8, padding:'12px 16px'}}>
                <div style={{fontSize:11, color:'#64748b', fontWeight:600}}>{s.icon} {s.label}</div>
                <div style={{fontSize:15, fontWeight:700, color:'#1a202c', marginTop:4}}>{s.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{color:'#94a3b8'}}>Loading status...</div>
        )}

        {/* Git status */}
        {status?.git?.hasGit && (
          <div style={{marginTop:16, padding:'12px 16px', background:'#f0fdf4', borderRadius:8, border:'1px solid #bbf7d0'}}>
            <div style={{fontSize:12, fontWeight:600, color:'#15803d', marginBottom:8}}>📦 GitHub Connection</div>
            <div style={{fontSize:13, color:'#374151'}}>Branch: <strong>{status.git.branch}</strong></div>
            <div style={{fontSize:12, color:'#64748b', marginTop:4, fontFamily:'monospace'}}>{status.git.lastCommit}</div>
            {status.git.commitsAvailable > 0 && (
              <div style={{marginTop:8, background:'#fef3c7', color:'#92400e', padding:'6px 10px',
                borderRadius:6, fontSize:12, fontWeight:600}}>
                ⚠️ {status.git.commitsAvailable} new update{status.git.commitsAvailable>1?'s':''} available on GitHub
              </div>
            )}
            {status.git.commitsAvailable === 0 && (
              <div style={{marginTop:8, color:'#16a34a', fontSize:12, fontWeight:600}}>✅ Up to date</div>
            )}
          </div>
        )}

        {status?.git && !status.git.hasGit && (
          <div style={{marginTop:16, padding:'12px 16px', background:'#fff7ed', borderRadius:8, border:'1px solid #fed7aa'}}>
            <div style={{fontSize:12, color:'#92400e'}}>
              ⚠️ Running in standalone mode (no git). Updates must be applied manually by downloading the latest version.
            </div>
          </div>
        )}
      </div>

      {/* Update card */}
      <div className="card" style={{marginBottom:16}}>
        <h3 style={{marginBottom:8}}>🔄 Update System</h3>
        <p style={{color:'#64748b', fontSize:13, marginBottom:16}}>
          Pull the latest code from GitHub, install any new dependencies, and run database migrations.
          The server will restart automatically after updating.
        </p>

        <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:16,
          padding:12, background:'#f8fafc', borderRadius:8}}>
          <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13}}>
            <input type="checkbox" checked={autoRestart} onChange={e=>setAutoRestart(e.target.checked)}
              style={{width:16, height:16}} />
            <span>Auto-restart server after update</span>
          </label>
          <span style={{fontSize:11, color:'#94a3b8'}}>(Recommended on Render — restarts automatically)</span>
        </div>

        <button onClick={runUpdate} disabled={updating}
          style={{padding:'12px 28px', background: updating ? '#94a3b8' : '#2563eb',
            color:'#fff', border:'none', borderRadius:10, cursor: updating?'wait':'pointer',
            fontWeight:700, fontSize:15, display:'flex', alignItems:'center', gap:10}}>
          {updating ? (
            <><span style={{fontSize:18}}>⏳</span> Updating...</>
          ) : (
            <><span style={{fontSize:18}}>🔄</span> Pull Latest Update from GitHub</>
          )}
        </button>

        {/* Update results */}
        {updateResult && (
          <div style={{marginTop:16}}>
            <div style={{
              padding:'10px 16px', borderRadius:8, marginBottom:12, fontWeight:700, fontSize:14,
              background: updateResult.ok ? '#dcfce7' : '#fff7ed',
              color: updateResult.ok ? '#15803d' : '#92400e',
              border: `1px solid ${updateResult.ok ? '#86efac' : '#fed7aa'}`,
            }}>
              {updateResult.message || (updateResult.ok ? '✅ Update complete!' : '⚠️ Update had issues')}
              {updateResult.needsRestart && autoRestart && (
                <div style={{fontSize:12, marginTop:4, fontWeight:400}}>Server restarting in 2 seconds...</div>
              )}
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {(updateResult.steps||[]).map((step, i) => (
                <div key={i} style={{display:'flex', alignItems:'flex-start', gap:10,
                  padding:'8px 12px', borderRadius:6,
                  background: step.ok ? '#f0fdf4' : '#fff5f5'}}>
                  <span style={{fontSize:14, flexShrink:0}}>{step.ok ? '✅' : '⚠️'}</span>
                  <div>
                    <div style={{fontWeight:600, fontSize:13,
                      color: step.ok ? '#15803d' : '#dc2626'}}>{step.step}</div>
                    {step.output && (
                      <div style={{fontSize:11, color:'#64748b', fontFamily:'monospace',
                        marginTop:2, whiteSpace:'pre-wrap'}}>{step.output}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {updateResult.error && (
              <div className="error" style={{marginTop:8}}>{updateResult.error}</div>
            )}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="card">
        <h3 style={{marginBottom:12}}>🔗 Quick Links</h3>
        <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
          <a href="https://github.com/Iskanderqasem/telecom-test-platform" target="_blank"
            style={{padding:'8px 16px', background:'#1a1a2e', color:'#fff', borderRadius:8,
              textDecoration:'none', fontSize:13, fontWeight:600}}>
            📦 GitHub Repository
          </a>
          <a href="https://dashboard.render.com" target="_blank"
            style={{padding:'8px 16px', background:'#46e3b7', color:'#1a1a2e', borderRadius:8,
              textDecoration:'none', fontSize:13, fontWeight:600}}>
            🌐 Render Dashboard
          </a>
          <a href="https://telecom-test-platform.onrender.com" target="_blank"
            style={{padding:'8px 16px', background:'#2563eb', color:'#fff', borderRadius:8,
              textDecoration:'none', fontSize:13, fontWeight:600}}>
            🚀 Live Site
          </a>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM MONITOR TAB — Read-only dashboard, no buttons
// ══════════════════════════════════════════════════════════════════════════════
function SystemMonitorTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await api('/system/status').catch(() => null);
    setStatus(data);
    setLoading(false);
  }

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const formatUptime = s => {
    const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
    return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div>
      {/* System Status */}
      <div className="card" style={{marginBottom:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <h3 style={{margin:0}}>🖥️ System Status</h3>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:'#16a34a',display:'inline-block'}}/>
            <span style={{fontSize:12,color:'#16a34a',fontWeight:600}}>Auto-refreshes every 30s</span>
          </div>
        </div>

        {loading && !status ? (
          <div style={{color:'#94a3b8', padding:20}}>Loading...</div>
        ) : status ? (
          <>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:16}}>
              {[
                { label:'Version', value: status.version, icon:'🏷️', color:'#2563eb' },
                { label:'Environment', value: status.env, icon:'🌐', color: status.env==='production'?'#16a34a':'#d97706' },
                { label:'Node.js', value: status.nodeVersion, icon:'⚙️', color:'#7c3aed' },
                { label:'Uptime', value: formatUptime(status.uptime), icon:'⏱️', color:'#0891b2' },
                { label:'Memory', value: status.memory, icon:'💾', color:'#059669' },
                { label:'Platform', value: status.platform, icon:'💻', color:'#64748b' },
              ].map(s => (
                <div key={s.label} style={{background:'#f8fafc', borderRadius:10, padding:'14px 16px',
                  borderLeft:`4px solid ${s.color}`}}>
                  <div style={{fontSize:11, color:'#64748b', fontWeight:600, marginBottom:4}}>{s.icon} {s.label}</div>
                  <div style={{fontSize:16, fontWeight:700, color:'#1a202c'}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* GitHub Status */}
            {status.git && (
              <div style={{background: status.git.hasGit ? '#f0fdf4' : '#fff7ed',
                border: `1px solid ${status.git.hasGit ? '#86efac' : '#fed7aa'}`,
                borderRadius:10, padding:'14px 16px'}}>
                <div style={{fontWeight:700, fontSize:13, marginBottom:8,
                  color: status.git.hasGit ? '#15803d' : '#92400e'}}>
                  📦 GitHub Connection
                </div>
                {status.git.hasGit ? (
                  <>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                      <div>
                        <div style={{fontSize:11, color:'#64748b'}}>Branch</div>
                        <div style={{fontWeight:700, color:'#1a202c'}}>{status.git.branch}</div>
                      </div>
                      <div>
                        <div style={{fontSize:11, color:'#64748b'}}>Updates available</div>
                        <div style={{fontWeight:700, color: status.git.commitsAvailable > 0 ? '#d97706' : '#16a34a'}}>
                          {status.git.commitsAvailable > 0 ? `⚠️ ${status.git.commitsAvailable} new` : '✅ Up to date'}
                        </div>
                      </div>
                    </div>
                    <div style={{marginTop:8, fontFamily:'monospace', fontSize:11, color:'#64748b',
                      background:'#f1f5f9', padding:'6px 10px', borderRadius:6}}>
                      {status.git.lastCommit}
                    </div>
                  </>
                ) : (
                  <div style={{fontSize:13, color:'#92400e'}}>Running in standalone mode — no git repo found</div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="error">Could not load system status</div>
        )}
      </div>

      {/* Platform Info */}
      <div className="card" style={{marginBottom:16}}>
        <h3 style={{marginBottom:16}}>🔗 Platform Links</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12}}>
          {[
            { label:'GitHub Repository', url:'https://github.com/Iskanderqasem/telecom-test-platform', icon:'📦', bg:'#1a1a2e', color:'#fff' },
            { label:'Render Dashboard', url:'https://dashboard.render.com', icon:'🌐', bg:'#46e3b7', color:'#1a1a2e' },
            { label:'Live Site (Render)', url:'https://telecom-test-platform.onrender.com', icon:'🚀', bg:'#2563eb', color:'#fff' },
            { label:'Render Deploy Log', url:'https://dashboard.render.com/web/srv-d8ssl83eo5us73d2o0ng-a/deploys', icon:'📋', bg:'#7c3aed', color:'#fff' },
          ].map(l => (
            <a key={l.label} href={l.url} target="_blank"
              style={{display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
                background:l.bg, color:l.color, borderRadius:10, textDecoration:'none',
                fontWeight:600, fontSize:13, transition:'opacity 0.2s'}}>
              <span style={{fontSize:18}}>{l.icon}</span>
              {l.label}
            </a>
          ))}
        </div>
      </div>

      {/* How updates work */}
      <div className="card">
        <h3 style={{marginBottom:12}}>🔄 How Updates Work</h3>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {[
            { step:'1', text:'You report an issue or request a feature in Claude', icon:'💬' },
            { step:'2', text:'Claude fixes it and pushes directly to GitHub', icon:'🤖' },
            { step:'3', text:'Render detects the GitHub push and auto-deploys within 2 minutes', icon:'⚡' },
            { step:'4', text:'Live site updates automatically — nothing needed from you', icon:'✅' },
          ].map(s => (
            <div key={s.step} style={{display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
              background:'#f8fafc', borderRadius:8}}>
              <div style={{width:28, height:28, borderRadius:'50%', background:'#2563eb', color:'#fff',
                display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, flexShrink:0}}>
                {s.step}
              </div>
              <span style={{fontSize:18}}>{s.icon}</span>
              <span style={{fontSize:13, color:'#374151'}}>{s.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ── Login Page ────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      setToken(data.token);
      setUser(data.user);
      onLogin(data.user);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg, #0f1722 0%, #1a2d40 100%)',
      fontFamily:'-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    }}>
      <div style={{
        background:'#16212e', borderRadius:16, padding:'40px 36px', width:380,
        boxShadow:'0 25px 60px rgba(0,0,0,0.6)', border:'1px solid #2a3a4d',
      }}>
        <div style={{textAlign:'center', marginBottom:32}}>
          <div style={{fontSize:52, marginBottom:12}}>📡</div>
          <h1 style={{color:'#3fb6c9', fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.5px'}}>
            Telecom Test Platform
          </h1>
          <p style={{color:'#64748b', fontSize:13, marginTop:6, marginBottom:0}}>
            Sign in to continue
          </p>
        </div>

        {error && (
          <div style={{
            background:'rgba(220,38,38,0.1)', border:'1px solid rgba(220,38,38,0.3)',
            color:'#f87171', padding:'10px 14px', borderRadius:8, marginBottom:20, fontSize:13,
          }}>{error}</div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{marginBottom:16}}>
            <label style={{display:'block', color:'#93a4b8', fontSize:11,
              marginBottom:6, fontWeight:700, letterSpacing:'0.08em'}}>
              USERNAME OR EMAIL
            </label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus required
              style={{
                width:'100%', padding:'11px 14px', background:'#0f1722',
                border:'1px solid #2a3a4d', borderRadius:8, color:'#e7edf3',
                fontSize:14, outline:'none', boxSizing:'border-box',
              }} />
          </div>
          <div style={{marginBottom:28}}>
            <label style={{display:'block', color:'#93a4b8', fontSize:11,
              marginBottom:6, fontWeight:700, letterSpacing:'0.08em'}}>
              PASSWORD
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width:'100%', padding:'11px 14px', background:'#0f1722',
                border:'1px solid #2a3a4d', borderRadius:8, color:'#e7edf3',
                fontSize:14, outline:'none', boxSizing:'border-box',
              }} />
          </div>
          <button type="submit" disabled={loading} style={{
            width:'100%', padding:'13px', background: loading ? '#1e40af' : '#2563eb',
            color:'#fff', border:'none', borderRadius:8, fontSize:15, fontWeight:700,
            cursor: loading ? 'wait' : 'pointer', letterSpacing:'0.02em',
          }}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>

        <div style={{
          textAlign:'center', marginTop:24, padding:'12px',
          background:'rgba(255,255,255,0.04)', borderRadius:8,
          color:'#64748b', fontSize:12,
        }}>
          Default admin: <strong style={{color:'#93a4b8'}}>admin</strong> / <strong style={{color:'#93a4b8'}}>Admin@2degrees</strong>
        </div>
      </div>
    </div>
  );
}


// ── ADB Status Indicator (sidebar) ───────────────────────────────────────────
function AdbStatusIndicator() {
  const [status, setStatus] = useState({ connected: [], total: 0 });

  useEffect(() => {
    function check() {
      api('/handsets/adb/connected')
        .then(r => setStatus({ connected: r.connected || [], total: r.total || 0 }))
        .catch(() => {});
    }
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  const count = status.connected.length;
  const ok = count > 0;

  return (
    <div style={{
      margin:'6px 8px 2px', padding:'8px 12px',
      background: ok ? 'rgba(58,166,107,0.12)' : 'rgba(220,38,38,0.1)',
      borderRadius:8, border: ok ? '1px solid rgba(58,166,107,0.3)' : '1px solid rgba(220,38,38,0.2)',
    }}>
      <div style={{display:'flex', alignItems:'center', gap:6}}>
        <div style={{
          width:8, height:8, borderRadius:'50%',
          background: ok ? '#3aa66b' : '#dc2626',
          boxShadow: ok ? '0 0 6px #3aa66b' : 'none',
          flexShrink:0,
        }}/>
        <div>
          <div style={{color: ok ? '#3aa66b' : '#f87171', fontSize:11, fontWeight:700}}>
            {ok ? count + ' phone' + (count > 1 ? 's' : '') + ' connected' : 'No phones connected'}
          </div>
          <div style={{color:'#64748b', fontSize:10, marginTop:1}}>
            {ok ? 'Auto keep-alive active' : 'Go to Handsets → Start Session'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App shell ────────────────────────────────────────────────────────────────
const PAGES = [
  { id: 'dashboard', label: '📊 Dashboard & Results', title: 'Dashboard & Results' },
  { id: 'testcases', label: '🧪 Test Cases', title: 'Test Cases' },
  { id: 'chatbot', label: '🤖 AI Assistant', title: 'AI Test Case Assistant' },
  { id: 'tcr', label: '📈 TCR Reports', title: 'Test Case Run Reports' },
  { id: 'handsets', label: '📱 Handsets', title: 'Handsets & Device Management' },
  { id: 'reports', label: '📋 Reports', title: 'Reports & Analytics' },
  { id: 'admin', label: '⚙️ Admin Panel', title: 'Admin Panel', adminOnly: true },
];

function App() {
  const [page, setPage] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState(() => {
    const u = getUser();
    const t = getToken();
    if (!u || !t) return null;
    return u;
  });

  function handleSignOut() {
    setToken(null);
    setUser(null);
    setCurrentUser(null);
  }

  // Show login page if not authenticated
  if (!currentUser) {
    return <LoginPage onLogin={u => setCurrentUser(u)} />;
  }

  const current = PAGES.find(p => p.id === page);

  return (
    <>
      <style>{css}</style>
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <h1>Telecom Test Automation Platform</h1>
            <p>Stage 1 — Device Testing</p>
          </div>

          {/* ADB Status indicator */}
          <AdbStatusIndicator />

          {/* User info card */}
          <div style={{padding:'10px 12px', margin:'8px', background:'rgba(255,255,255,0.07)', borderRadius:8}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <div style={{width:32, height:32, borderRadius:'50%', background:'#2E6B7E',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:700, fontSize:14, color:'#fff', flexShrink:0}}>
                {(currentUser.full_name || currentUser.username || 'U')[0].toUpperCase()}
              </div>
              <div style={{overflow:'hidden'}}>
                <div style={{color:'#e7edf3', fontWeight:600, fontSize:13,
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                  {currentUser.full_name || currentUser.username}
                </div>
                <div style={{color:'#64748b', fontSize:11, textTransform:'uppercase', letterSpacing:'0.05em'}}>
                  {currentUser.role}
                </div>
              </div>
            </div>
          </div>

          <nav style={{flex:1}}>
            {PAGES.filter(p => !p.adminOnly || currentUser.role === 'admin').map(p => (
              <button key={p.id} className={`nav-btn${page === p.id ? ' active' : ''}`}
                onClick={() => setPage(p.id)}>
                {p.label}
              </button>
            ))}
          </nav>

          {/* Sign out */}
          <div style={{padding:'12px'}}>
            <button onClick={handleSignOut}
              style={{width:'100%', padding:'9px 12px',
                background:'rgba(220,38,38,0.12)', color:'#f87171',
                border:'1px solid rgba(220,38,38,0.25)', borderRadius:8,
                cursor:'pointer', fontSize:12, fontWeight:600,
                display:'flex', alignItems:'center', gap:8}}>
              🚪 Sign Out
            </button>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <h2>{current?.title}</h2>
          </div>
          {page === 'dashboard' && <DashboardPage />}
          {page === 'testcases' && <TestCasesPage />}
          {page === 'chatbot' && <AIChatbotPage />}
          {page === 'tcr' && <TCRReportsPage />}
          {page === 'handsets' && <HandsetsPage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'admin' && currentUser.role === 'admin' && <AdminPage />}
        </div>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
