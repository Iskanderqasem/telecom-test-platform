const ExcelJS = require('exceljs');
const { query } = require('../../db/pool');

async function getResultsData(filters = {}) {
  const conditions = [];
  const params = [];
  const mode = filters.mode || 'latest'; // 'latest' or 'all'

  if (filters.environment) { params.push(filters.environment); conditions.push(`tc.environment = $${params.length}`); }
  if (filters.assigned_to) { params.push(filters.assigned_to); conditions.push(`tc.assigned_to = $${params.length}`); }
  if (filters.a_party_handset) { params.push(filters.a_party_handset); conditions.push(`tc.a_party_handset_label = $${params.length}`); }
  if (filters.b_party_handset) { params.push(filters.b_party_handset); conditions.push(`tc.b_party_handset_label = $${params.length}`); }
  if (filters.status) { params.push(filters.status); conditions.push(`e.status = $${params.length}`); }
  if (filters.date_from) { params.push(filters.date_from); conditions.push(`e.created_at >= $${params.length}::timestamptz`); }
  if (filters.date_to)   { params.push(filters.date_to);   conditions.push(`e.created_at <= $${params.length}::timestamptz`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let sql;
  if (mode === 'all') {
    // All executions joined to test cases
    sql = `
      SELECT tc.id, tc.tc_id, tc.traceability_label, tc.flow, tc.environment, tc.description,
        tc.a_party_msisdn, tc.a_party_network, tc.a_party_profile, tc.a_party_handset_label,
        tc.b_party_msisdn, tc.b_party_network, tc.b_party_profile, tc.b_party_handset_label,
        tc.exp_call_mo, tc.exp_call_mt, tc.exp_sms, tc.exp_sms_notification, tc.exp_delivery_report,
        tc.call_duration_seconds, tc.call_type, tc.sms_text, tc.assigned_to,
        tc.work_type, tc.work_ref_number, tc.work_ref_name, tc.work_owner,
        tc.test_reason_type, tc.test_reason_ref, tc.project_id,
        e.status, e.actual_call_mo, e.actual_call_mt, e.actual_sms,
        e.actual_sms_notification, e.actual_delivery_report,
        e.failure_reason, e.duration_ms, e.created_at AS executed_at, e.triggered_by
      FROM executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      ${where}
      ORDER BY e.created_at DESC
      LIMIT 1000`;
  } else {
    // Latest execution per test case
    const tcConditions = conditions.filter(c => c.startsWith('tc.'));
    const tcWhere = tcConditions.length ? `WHERE ${tcConditions.join(' AND ')}` : '';
    sql = `
      SELECT tc.id, tc.tc_id, tc.traceability_label, tc.flow, tc.environment, tc.description,
        tc.a_party_msisdn, tc.a_party_network, tc.a_party_profile, tc.a_party_handset_label,
        tc.b_party_msisdn, tc.b_party_network, tc.b_party_profile, tc.b_party_handset_label,
        tc.exp_call_mo, tc.exp_call_mt, tc.exp_sms, tc.exp_sms_notification, tc.exp_delivery_report,
        tc.call_duration_seconds, tc.call_type, tc.sms_text, tc.assigned_to, tc.status,
        tc.work_type, tc.work_ref_number, tc.work_ref_name, tc.work_owner,
        tc.test_reason_type, tc.test_reason_ref, tc.project_id,
        e.actual_call_mo, e.actual_call_mt, e.actual_sms,
        e.actual_sms_notification, e.actual_delivery_report,
        e.failure_reason, e.duration_ms, e.created_at AS executed_at, e.triggered_by
      FROM test_cases tc
      LEFT JOIN LATERAL (
        SELECT * FROM executions WHERE test_case_id = tc.id ORDER BY created_at DESC LIMIT 1
      ) e ON true
      ${tcWhere}
      ORDER BY tc.sort_order, tc.tc_id`;
  }

  const res = await query(sql, params);
  return res.rows;
}

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-NZ', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch (e) { return String(d); }
}

function fmtDuration(ms) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function resultCell(exp, act) {
  if (!act || act === 'N/A') return '—';
  if (act === exp) return act;
  // Only flag as mismatch if expected was Y but got N (real failure)
  // If expected N but got Y, still show as pass (exceeded expectation)
  if (exp === 'Y' && act === 'N') return `N ✗`;  // real failure
  if (exp === 'N' && act === 'Y') return act;     // better than expected - pass
  return `${act}`;
}

async function exportToExcel(filters = {}) {
  const rows = await getResultsData(filters);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Telecom Test Automation Platform';
  wb.created = new Date();

  // ── Results sheet ──────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Test Results', { views: [{ state: 'frozen', ySplit: 3 }] });

  // Row 1: Report info
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = 'Telecom Test Automation — Test Results Report';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E5F' } };
  ws.getCell('A1').alignment = { vertical: 'middle' };

  ws.mergeCells('E1:H1');
  ws.getCell('E1').value = `Generated: ${fmtDate(new Date())}`;
  ws.getCell('E1').font = { size: 11, color: { argb: 'FFFFFFFF' } };
  ws.getCell('E1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E5F' } };
  ws.getCell('E1').alignment = { vertical: 'middle', horizontal: 'right' };

  // Filter info
  const filterDesc = Object.entries(filters)
    .filter(([k, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ') || 'No filters applied';
  ws.mergeCells('I1:P1');
  ws.getCell('I1').value = `Filters: ${filterDesc}`;
  ws.getCell('I1').font = { size: 10, color: { argb: 'FFFFFFFF' } };
  ws.getCell('I1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E6B7E' } };
  ws.getCell('I1').alignment = { vertical: 'middle' };

  ws.getRow(1).height = 30;

  // Row 2: Group headers
  const groups = [
    { label: 'Test Case', cols: 'A2:E2', color: 'FF1F4E5F' },
    { label: 'A-Party', cols: 'F2:H2', color: 'FF1565C0' },
    { label: 'B-Party', cols: 'I2:K2', color: 'FF6A1B9A' },
    { label: 'Expected / Actual Result', cols: 'L2:P2', color: 'FF2E7D32' },
    { label: 'Execution Details', cols: 'Q2:T2', color: 'FF8B0000' },
    { label: 'Status', cols: 'U2:U2', color: 'FF37474F' },
  ];

  for (const g of groups) {
    if (g.cols.includes(':') && g.cols.split(':')[0] !== g.cols.split(':')[1]) {
      ws.mergeCells(g.cols);
    }
    const cell = ws.getCell(g.cols.split(':')[0]);
    cell.value = g.label;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.color } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  ws.getRow(2).height = 25;

  // Row 3: Column headers
  const cols = [
    'TC ID', 'Traceability', 'Flow', 'Environment', 'Description',
    'MSISDN', 'Network', 'Profile',
    'MSISDN', 'Network', 'Profile',
    'Call MO', 'Call MT', 'SMS', 'SMS Notif.', 'Del. Report',
    'Executed At', 'Executed By', 'Duration', 'Failure Reason',
    'Status',
  ];
  const hRow = ws.getRow(3);
  cols.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF37474F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF1F4E5F' } },
    };
  });
  hRow.height = 35;

  // Data rows
  const statusColors = {
    'Passed':  { bg: 'FFD5E8D4', font: 'FF1B5E20', label: '✓ Passed' },
    'Failed':  { bg: 'FFFFD7D7', font: 'FFB71C1C', label: '✗ Failed' },
    'Blocked': { bg: 'FFFFF8E1', font: 'FFE65100', label: '⚠ Blocked' },
    'Running': { bg: 'FFE3F2FD', font: 'FF0D47A1', label: '▶ Running' },
    'Not Run': { bg: 'FFF5F5F5', font: 'FF757575', label: '— Not Run' },
  };

  rows.forEach((row, idx) => {
    const sc = statusColors[row.status] || statusColors['Not Run'];
    const dataRow = ws.addRow([
      row.tc_id,
      row.traceability_label || '',
      row.flow || '',
      row.environment || '',
      row.description || '',
      row.a_party_msisdn || '',
      row.a_party_network || '',
      row.a_party_profile || '',
      row.b_party_msisdn || '',
      row.b_party_network || '',
      row.b_party_profile || '',
      resultCell(row.exp_call_mo, row.actual_call_mo),
      resultCell(row.exp_call_mt, row.actual_call_mt),
      resultCell(row.exp_sms, row.actual_sms),
      resultCell(row.exp_sms_notification, row.actual_sms_notification),
      resultCell(row.exp_delivery_report, row.actual_delivery_report),
      fmtDate(row.executed_at),
      row.triggered_by && row.triggered_by !== 'web-ui' ? row.triggered_by : (row.assigned_to || ''),
      fmtDuration(row.duration_ms),
      row.failure_reason || '',
      sc.label,
    ]);

    const statusCell = dataRow.getCell(21);
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.bg } };
    statusCell.font = { bold: true, color: { argb: sc.font }, size: 10 };
    statusCell.alignment = { horizontal: 'center' };

    // Highlight result mismatches in red
    [12, 13, 14, 15, 16].forEach(col => {
      const cell = dataRow.getCell(col);
      if (cell.value && String(cell.value).includes('≠')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD7D7' } };
        cell.font = { color: { argb: 'FFB71C1C' }, bold: true };
      } else if (cell.value && !['—', ''].includes(String(cell.value))) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5E8D4' } };
        cell.font = { color: { argb: 'FF1B5E20' } };
      }
    });

    if (idx % 2 === 0) {
      dataRow.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col !== 21 && !cell.fill?.fgColor?.argb) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFB' } };
        }
      });
    }

    // Failure reason column wrap
    dataRow.getCell(20).alignment = { wrapText: true };
    dataRow.getCell(5).alignment = { wrapText: true };
    dataRow.height = 28;
  });

  const widths = [12, 18, 14, 12, 40, 16, 14, 12, 16, 14, 12, 10, 10, 10, 12, 12, 22, 15, 12, 40, 14];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const sum = wb.addWorksheet('Summary');
  sum.getColumn(1).width = 25;
  sum.getColumn(2).width = 12;
  sum.getColumn(3).width = 16;

  const sumTitle = sum.addRow(['TELECOM TEST RESULTS SUMMARY']);
  sumTitle.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1F4E5F' } };
  sum.addRow(['Report Generated:', fmtDate(new Date())]);
  sum.addRow(['Filters:', filterDesc]);
  sum.addRow([]);

  sum.addRow(['Status', 'Count', 'Pass Rate']);
  const total = rows.length;
  for (const s of ['Passed', 'Failed', 'Blocked', 'Not Run', 'Running']) {
    const count = rows.filter(r => r.status === s).length;
    const pct = total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0%';
    const r = sum.addRow([s, count, pct]);
    const sc = statusColors[s];
    if (sc) {
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sc.bg } };
      r.getCell(1).font = { bold: true, color: { argb: sc.font } };
    }
  }
  sum.addRow([]);
  const totRow = sum.addRow(['TOTAL', total, '']);
  totRow.getCell(1).font = { bold: true };
  totRow.getCell(2).font = { bold: true };

  return wb;
}

async function exportToCsv(filters = {}) {
  const rows = await getResultsData(filters);
  const headers = [
    'TC ID', 'Traceability', 'Flow', 'Environment', 'Description',
    'A-Party MSISDN', 'A-Party Network', 'A-Party Profile',
    'B-Party MSISDN', 'B-Party Network', 'B-Party Profile',
    'Call MO (Exp)', 'Call MO (Act)', 'Call MT (Exp)', 'Call MT (Act)',
    'SMS (Exp)', 'SMS (Act)', 'SMS Notif (Exp)', 'SMS Notif (Act)',
    'Del Report (Exp)', 'Del Report (Act)',
    'Assigned To', 'Handset A', 'Handset B',
    'Executed At', 'Executed By', 'Duration', 'Failure Reason', 'Status',
  ];

  const escape = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];

  for (const r of rows) {
    lines.push([
      r.tc_id, r.traceability_label, r.flow, r.environment, escape(r.description),
      r.a_party_msisdn, r.a_party_network, r.a_party_profile,
      r.b_party_msisdn, r.b_party_network, r.b_party_profile,
      r.exp_call_mo, r.actual_call_mo || '',
      r.exp_call_mt, r.actual_call_mt || '',
      r.exp_sms, r.actual_sms || '',
      r.exp_sms_notification, r.actual_sms_notification || '',
      r.exp_delivery_report, r.actual_delivery_report || '',
      r.triggered_by && r.triggered_by !== 'web-ui' ? r.triggered_by : (r.assigned_to || ''), r.a_handset_label, r.b_handset_label,
      fmtDate(r.executed_at), r.triggered_by || '',
      fmtDuration(r.duration_ms), escape(r.failure_reason), r.status,
    ].join(','));
  }
  return lines.join('\r\n');
}

module.exports = { exportToExcel, exportToCsv, getResultsData };
