// ─── Email recipient config (localStorage) ───────────────────────────────────
const EMAIL_CFG_KEY = 'schedulehq_email_config';

function loadEmailConfig() {
  try { return JSON.parse(localStorage.getItem(EMAIL_CFG_KEY)) || { to: [], cc: [] }; }
  catch { return { to: [], cc: [] }; }
}

function saveEmailConfig(cfg) {
  localStorage.setItem(EMAIL_CFG_KEY, JSON.stringify(cfg));
}

// ─── Modal open / close ───────────────────────────────────────────────────────
function openEmailConfigModal() {
  renderEmailConfigForm();
  const modal = document.getElementById('email-config-modal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('email-to-input')?.focus(), 80);
}

function closeEmailConfigModal() {
  document.getElementById('email-config-modal').style.display = 'none';
}

// ─── Render recipient lists ───────────────────────────────────────────────────
function renderEmailConfigForm() {
  const cfg = loadEmailConfig();
  ['to', 'cc'].forEach(type => {
    const list = document.getElementById(`email-${type}-list`);
    if (!list) return;
    list.innerHTML = cfg[type].length
      ? cfg[type].map((addr, i) => `
          <div class="ecfg-row">
            <span class="ecfg-addr">${escXml(addr)}</span>
            <button onclick="removeEmailRecipient('${type}',${i})" class="ecfg-remove" title="Remove">
              <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>`).join('')
      : `<p class="ecfg-empty">No recipients added yet</p>`;
  });
}

function addEmailRecipient(type) {
  const input = document.getElementById(`email-${type}-input`);
  const val   = (input?.value || '').trim();
  if (!val) return;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    input.classList.add('ecfg-input-error');
    setTimeout(() => input.classList.remove('ecfg-input-error'), 1400);
    return;
  }

  const cfg = loadEmailConfig();
  if (!cfg[type].includes(val)) { cfg[type].push(val); saveEmailConfig(cfg); }
  input.value = '';
  renderEmailConfigForm();
}

function removeEmailRecipient(type, idx) {
  const cfg = loadEmailConfig();
  cfg[type].splice(idx, 1);
  saveEmailConfig(cfg);
  renderEmailConfigForm();
}

function handleEmailInputKey(e, type) {
  if (e.key === 'Enter') { e.preventDefault(); addEmailRecipient(type); }
}

// ─── Draft email — downloads .eml with HTML table pre-filled ─────────────────
function draftEmailForDate(dateKey) {
  const cfg    = loadEmailConfig();
  const groups = window._currentGroups || [];
  const group  = groups.find(g => g.key === dateKey);
  if (!group) return;

  const sites   = group.items;
  const subject = `Site Schedule — ${dateKey}`;

  // ── Active date window for per-site day counts ────────────────────────────
  const activeDates = typeof activeDataCols === 'function'
    ? new Set(activeDataCols().map(dc => dc.date))
    : new Set();

  // ── Build Outlook-compatible HTML table (inline styles only) ─────────────
  const rowsHtml = sites.map((s, i) => {
    const bg    = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    const dlist = s.dateList ? s.dateList.filter(d => !activeDates.size || activeDates.has(d)) : [];
    const days  = dlist.length || s.actualDays || 1;
    const from  = dateKey;
    const to    = dlist[dlist.length - 1] || s.to || '&mdash;';
    return `
      <tr style="background:${bg};">
        <td style="padding:8px 12px;border:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#065F46;white-space:nowrap;">${escXml(s.siteId || '—')}</td>
        <td style="padding:8px 12px;border:1px solid #E2E8F0;font-size:13px;color:#0F172A;">${escXml(s.display)}</td>
        <td style="padding:8px 12px;border:1px solid #E2E8F0;font-size:13px;color:#475569;white-space:nowrap;text-align:center;">${escXml(from)}</td>
        <td style="padding:8px 12px;border:1px solid #E2E8F0;font-size:13px;color:#475569;white-space:nowrap;text-align:center;">${to !== from ? escXml(to) : '&mdash;'}</td>
        <td style="padding:8px 12px;border:1px solid #E2E8F0;font-size:13px;text-align:center;">
          <span style="background:${days > 1 ? '#DBEAFE' : '#F1F5F9'};color:${days > 1 ? '#1D4ED8' : '#64748B'};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;">${days}d</span>
        </td>
      </tr>`;
  }).join('');

  const bodyHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#0F172A;margin:0;padding:0;">
<div style="max-width:680px;">
  <p style="margin:0 0 6px 0;">Hi team,</p>
  <p style="margin:0 0 18px 0;color:#475569;">Please find below the site schedule for <strong>${escXml(dateKey)}</strong>.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:480px;">
    <thead>
      <tr style="background:#0F172A;">
        <th style="padding:10px 12px;border:1px solid #1E293B;font-size:11px;font-weight:700;color:#94A3B8;text-align:left;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Site ID</th>
        <th style="padding:10px 12px;border:1px solid #1E293B;font-size:11px;font-weight:700;color:#94A3B8;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Job / Site Name</th>
        <th style="padding:10px 12px;border:1px solid #1E293B;font-size:11px;font-weight:700;color:#94A3B8;text-align:center;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Start</th>
        <th style="padding:10px 12px;border:1px solid #1E293B;font-size:11px;font-weight:700;color:#94A3B8;text-align:center;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">End</th>
        <th style="padding:10px 12px;border:1px solid #1E293B;font-size:11px;font-weight:700;color:#94A3B8;text-align:center;text-transform:uppercase;letter-spacing:0.05em;">Days</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr style="background:#F8FAFC;">
        <td colspan="4" style="padding:8px 12px;border:1px solid #E2E8F0;font-size:12px;font-weight:700;color:#64748B;">Total</td>
        <td style="padding:8px 12px;border:1px solid #E2E8F0;font-size:12px;font-weight:700;color:#0F172A;text-align:center;">${sites.length}&nbsp;site${sites.length !== 1 ? 's' : ''}</td>
      </tr>
    </tfoot>
  </table>
  <p style="margin:18px 0 0;color:#94A3B8;font-size:12px;">Generated from ScheduleHQ &middot; ${escXml(dateKey)}</p>
</div>
</body></html>`;

  // ── Assemble .eml (X-Unsent:1 makes Outlook open it as a new compose) ─────
  const toStr  = cfg.to.join(', ');
  const ccStr  = cfg.cc.join(', ');
  const emlLines = [
    'MIME-Version: 1.0',
    'X-Unsent: 1',
    'Content-Type: text/html; charset=UTF-8',
  ];
  if (toStr) emlLines.push(`To: ${toStr}`);
  if (ccStr) emlLines.push(`CC: ${ccStr}`);
  emlLines.push(`Subject: ${subject}`);
  emlLines.push('');
  emlLines.push(bodyHtml);

  const blob = new Blob([emlLines.join('\r\n')], { type: 'message/rfc822' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Site_Schedule_${dateKey.replace(/\s+/g, '_')}.eml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (typeof showToast === 'function') {
    showToast('EML downloaded — double-click it to open as a draft in Outlook');
  }
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function escXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
