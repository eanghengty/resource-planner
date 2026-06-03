// ─── Colour categoriser ──────────────────────────────────────────────────────
function categorise(text) {
  if (!text || text.trim() === '') return 'empty';
  const t = text.toLowerCase();
  if (t.includes('standby'))                  return 'standby';
  if (t.includes('public holiday') || t.includes('holiday')) return 'holiday';
  if (t.includes('training') || t.includes('travel') || t.includes('trianing')) return 'training';
  return 'work';
}

function badgeClass(cat) {
  const map = { standby:'standby', holiday:'holiday', training:'training', travel:'training', work:'work', empty:'empty' };
  return map[cat] || 'work';
}

// ─── Extract site ID prefix (e.g. "R08", "J30", "E05", "M20") ───────────────
function getSiteId(text) {
  const m = text.match(/^([A-Z]\d{2,3})\b/i);
  return m ? m[1].toUpperCase() : null;
}

// ─── Expand "E17/E14/E22 Cable run" → ["E17 Cable run", "E14 Cable run", "E22 Cable run"] ─────
function expandSlashSites(base) {
  const idPattern = /^((?:[A-Z]\d{2,3}\s*\/\s*)+[A-Z]\d{2,3})\s*(.*)/i;
  const m = base.match(idPattern);
  if (m) {
    const ids  = m[1].split(/\s*\/\s*/).map(s => s.trim().toUpperCase());
    const desc = m[2].trim();
    return ids.map(id => ({ display: `${id}${desc ? ' ' + desc : ''}`, siteId: id }));
  }
  const siteId = getSiteId(base);
  return [{ display: base, siteId }];
}

// ─── Parse "07 Apr 2026" → "2026-04-07" for date comparisons ────────────────
function dateLabelToISO(label) {
  if (!label) return null;
  const raw = String(label).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                   Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
  const parts = raw.split(/\s+/);
  if (parts.length < 3) return null;

  const ddNum = Number(parts[0]);
  const mm = months[parts[1]];
  const yyyyNum = Number(parts[2]);
  if (!Number.isInteger(ddNum) || !mm || !Number.isInteger(yyyyNum)) return null;

  const dd = String(ddNum).padStart(2,'0');
  const yyyy = String(yyyyNum).padStart(4, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const HOURS_PER_PERSON_DAY = 8;

function getSiteSlotCount(site, activeDates) {
  if (!site) return 0;
  if (!activeDates) return site.totalSlots || 0;

  const slotsByDate = site.slotsByDate || {};
  let total = 0;
  activeDates.forEach(date => {
    total += slotsByDate[date] || 0;
  });
  return total;
}

function getSiteHourCount(site, activeDates) {
  return getSiteSlotCount(site, activeDates) * HOURS_PER_PERSON_DAY;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Toast notification ───────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  let t = document.getElementById('save-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'save-toast';
    t.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;padding:0.65rem 1.2rem;border-radius:12px;font-size:0.82rem;font-weight:600;font-family:Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.15);transition:opacity 0.3s ease,transform 0.3s ease;opacity:0;transform:translateY(8px);pointer-events:none;display:flex;align-items:center;gap:8px;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = isError ? '#FEF2F2' : '#F0FDF4';
  t.style.color       = isError ? '#B91C1C' : '#15803D';
  t.style.border      = isError ? '1px solid #FECACA' : '1px solid #BBF7D0';
  t.style.opacity     = '1';
  t.style.transform   = 'translateY(0)';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; }, 3000);
}

// ─── Summary stat cards ───────────────────────────────────────────────────────
const CARD_CONFIG = {
  'sticker-br': {
    iconBg: '#EFF6FF', iconColor: '#3B82F6',
    svg: `<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`
  },
  'sticker-tl': {
    iconBg: '#ECFDF5', iconColor: '#10B981',
    svg: `<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`
  },
  'sticker-bl': {
    iconBg: '#FFF7ED', iconColor: '#F97316',
    svg: `<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>`
  },
  'sticker-tr': {
    iconBg: '#FFFBEB', iconColor: '#F59E0B',
    svg: `<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
  },
};

function makeCard(stickerClass, label, value) {
  const cfg = CARD_CONFIG[stickerClass] || CARD_CONFIG['sticker-br'];
  return `
    <div class="stat-card">
      <div class="stat-card-icon" style="background:${cfg.iconBg};color:${cfg.iconColor};">
        ${cfg.svg}
      </div>
      <div>
        <div class="stat-card-value" id="card-val-${stickerClass}">${value}</div>
        <div class="stat-card-label">${label}</div>
      </div>
    </div>`;
}
