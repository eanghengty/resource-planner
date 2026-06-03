const SITE_META_KEY = 'schedulehq-site-meta-v1';
const SITE_FLAGS = ['macro', 'ibc', 'tx', 'tunnel', 'core'];
let _siteMetaCache = null;
let _siteMetaCacheSlotId = null;

function normalizeSiteTags(tags) {
  const source = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const seen = new Set();

  return source
    .map(tag => String(tag || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .filter(tag => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function defaultSiteMetaState() {
  return {
    sites: {},
    rates: Object.fromEntries(SITE_FLAGS.map(flag => [flag, 0]))
  };
}

function normalizeSiteMetaState(raw) {
  const base = defaultSiteMetaState();
  const state = raw && typeof raw === 'object' ? raw : base;
  const rawSites = state.sites && typeof state.sites === 'object' ? state.sites : {};

  return {
    sites: Object.fromEntries(Object.entries(rawSites).map(([siteId, record]) => {
      const safeRecord = record && typeof record === 'object' ? record : {};
      const flag = SITE_FLAGS.includes(safeRecord.flag) ? safeRecord.flag : '';
      return [siteId, {
        isMain: !!safeRecord.isMain,
        flag,
        tags: normalizeSiteTags(safeRecord.tags)
      }];
    })),
    rates: { ...base.rates, ...(state.rates || {}) }
  };
}

async function initSiteMetaState() {
  const activeSlotId = window._activeScheduleSlotId || (typeof getActiveScheduleSlotId === 'function' ? await getActiveScheduleSlotId() : null);
  const fromIDB = typeof getSiteMetaFromIDB === 'function' ? await getSiteMetaFromIDB() : null;
  if (fromIDB) {
    _siteMetaCache = normalizeSiteMetaState(fromIDB);
    _siteMetaCacheSlotId = activeSlotId;
    return _siteMetaCache;
  }

  _siteMetaCache = defaultSiteMetaState();
  _siteMetaCacheSlotId = activeSlotId;
  return _siteMetaCache;
}

function loadSiteMetaState() {
  const activeSlotId = window._activeScheduleSlotId || null;
  if (_siteMetaCache && _siteMetaCacheSlotId === activeSlotId) return _siteMetaCache;
  if (_siteMetaCacheSlotId !== activeSlotId) {
    _siteMetaCache = defaultSiteMetaState();
    _siteMetaCacheSlotId = activeSlotId;
  }
  return _siteMetaCache;
}

function saveSiteMetaState(state) {
  _siteMetaCache = normalizeSiteMetaState(state);
  _siteMetaCacheSlotId = window._activeScheduleSlotId || null;
  if (typeof saveSiteMetaToIDB === 'function') saveSiteMetaToIDB(_siteMetaCache);
}

function getSiteMeta(siteId) {
  if (!siteId) return { isMain: false, flag: '', tags: [], rate: 0 };
  const state = loadSiteMetaState();
  const record = state.sites[siteId] || {};
  const flag = SITE_FLAGS.includes(record.flag) ? record.flag : '';
  return {
    isMain: !!record.isMain,
    flag,
    tags: normalizeSiteTags(record.tags),
    rate: Number(state.rates[flag] || 0)
  };
}

function saveSiteMeta(siteId, patch) {
  if (!siteId) return;
  const state = loadSiteMetaState();
  const current = state.sites[siteId] || {};
  const nextFlag = SITE_FLAGS.includes(patch.flag) ? patch.flag : '';
  state.sites[siteId] = {
    ...current,
    isMain: !!patch.isMain,
    flag: nextFlag,
    tags: normalizeSiteTags(patch.tags)
  };
  if (nextFlag) {
    state.rates[nextFlag] = Number(patch.rate || 0);
  }
  saveSiteMetaState(state);
}

function getFlagRate(flag) {
  if (!flag) return 0;
  const state = loadSiteMetaState();
  return Number(state.rates[flag] || 0);
}

function setFlagRate(flag, rate) {
  if (!SITE_FLAGS.includes(flag)) return;
  const state = loadSiteMetaState();
  state.rates[flag] = Number(rate || 0);
  saveSiteMetaState(state);
}

function getAllSiteTags() {
  const state = loadSiteMetaState();
  const tags = new Map();

  Object.values(state.sites || {}).forEach(record => {
    normalizeSiteTags(record && record.tags).forEach(tag => {
      const key = tag.toLowerCase();
      if (!tags.has(key)) tags.set(key, tag);
    });
  });

  return [...tags.values()].sort((a, b) => a.localeCompare(b));
}

function getAllUsedFlags() {
  const state = loadSiteMetaState();
  const flags = new Set();

  Object.values(state.sites || {}).forEach(record => {
    const flag = SITE_FLAGS.includes(record && record.flag) ? record.flag : '';
    if (flag) flags.add(flag);
  });

  return [...flags].sort((a, b) => a.localeCompare(b));
}

function siteMatchesSelectedFlags(site) {
  const selected = window._selectedFlags;
  if (!selected || selected.size === 0) return true;

  const allFlags = window._allUsedFlags || [];
  if (selected.size >= allFlags.length) return true;

  const meta = getSiteMeta(site.siteId);
  if (!meta.flag) return false;

  return selected.has(meta.flag);
}

function siteMatchesSelectedTags(site) {
  const selected = window._selectedTags;
  if (!selected || selected.size === 0) return true;

  const allTags = window._allTags || [];
  if (selected.size >= allTags.length) return true;

  const meta = getSiteMeta(site.siteId);
  if (!meta.tags.length) return false;

  const selectedKeys = new Set([...selected].map(tag => String(tag || '').toLowerCase()));
  return meta.tags.some(tag => selectedKeys.has(String(tag || '').toLowerCase()));
}

function getGroupedVisibleSiteHours() {
  const sites = window._allSites || [];
  const query = (document.getElementById('site-search')?.value || '').toLowerCase();
  const filter = window._siteFilter || 'all';
  const activeDates = new Set(activeDataCols().map(dc => dc.date));
  const grouped = new Map();

  sites.forEach(site => {
    const inMonth = site.dateList.some(d => activeDates.has(d));
    const matchSearch = site.display.toLowerCase().includes(query);
    const activeDays = site.dateList.filter(d => activeDates.has(d)).length;
    const matchFilter = filter === 'all' ? true : filter === 'multiday' ? activeDays > 1 : activeDays === 1;
    if (!inMonth || !matchSearch || !matchFilter || !siteMatchesSelectedFlags(site) || !siteMatchesSelectedTags(site) || !site.siteId) return;

    const hours = getSiteHourCount(site, activeDates);
    if (!grouped.has(site.siteId)) {
      grouped.set(site.siteId, { siteId: site.siteId, hours: 0, displayNames: [], count: 0 });
    }
    const entry = grouped.get(site.siteId);
    entry.hours += hours;
    entry.count += 1;
    entry.displayNames.push(site.display);
  });

  return [...grouped.values()];
}

function renderFlagSummary() {
  const host = document.getElementById('flag-summary-content');
  if (!host) return;

  const groupedSites = getGroupedVisibleSiteHours();
  const rows = SITE_FLAGS.map(flag => {
    const rate = getFlagRate(flag);
    const matching = groupedSites.filter(site => getSiteMeta(site.siteId).flag === flag);
    const siteCount = matching.length;
    const hours = matching.reduce((sum, site) => sum + site.hours, 0);
    const cost = hours * rate;
    return { flag, rate, siteCount, hours, cost };
  });

  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const flaggedSites = rows.reduce((sum, row) => sum + row.siteCount, 0);

  document.getElementById('summary-cards').innerHTML = [
    makeCard('sticker-tl', 'Unique Sites', new Set(groupedSites.map(site => site.siteId)).size),
    makeCard('sticker-br', 'Flagged Sites', flaggedSites),
    makeCard('sticker-tr', 'Flagged Hours', `${totalHours}h`),
    makeCard('sticker-bl', 'Estimated Cost', formatMoney(totalCost))
  ].join('');

  const tableRows = rows.map(row => `
    <tr class="border-t border-gray-100">
      <td class="px-4 py-3">
        <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase">${row.flag}</div>
      </td>
      <td class="px-4 py-3 text-sm font-semibold text-slate-700 text-center">${row.siteCount}</td>
      <td class="px-4 py-3 text-sm font-semibold text-slate-700 text-center">${row.hours}h</td>
      <td class="px-4 py-3 text-center">
        <input type="number" min="0" step="0.01" value="${row.rate}"
          onchange="updateFlagRate('${row.flag}', this.value)"
          class="w-24 text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-right text-slate-700 bg-white" />
      </td>
      <td class="px-4 py-3 text-sm font-bold text-emerald-700 text-right">${formatMoney(row.cost)}</td>
    </tr>`).join('');

  host.innerHTML = `
    <div class="rounded-xl border border-slate-100 overflow-hidden bg-white">
      <table class="w-full min-w-[640px]">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Flag</th>
            <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Sites</th>
            <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Hours</th>
            <th class="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">Rate</th>
            <th class="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-widest">Cost</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot class="bg-emerald-50/50 border-t border-emerald-100">
          <tr>
            <td class="px-4 py-3 text-sm font-bold text-slate-700">Total</td>
            <td class="px-4 py-3 text-sm font-bold text-slate-700 text-center">${flaggedSites}</td>
            <td class="px-4 py-3 text-sm font-bold text-slate-700 text-center">${totalHours}h</td>
            <td class="px-4 py-3 text-sm font-semibold text-slate-500 text-center">Mixed</td>
            <td class="px-4 py-3 text-sm font-bold text-emerald-700 text-right">${formatMoney(totalCost)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="text-xs text-slate-400 font-medium mt-3">Hours are counted once per site ID and include all visible sub jobs in the current filters.</div>`;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  const absAmount = Math.abs(amount);

  if (absAmount >= 1000000) {
    return `$${formatCompactNumber(amount / 1000000)}m`;
  }

  if (absAmount >= 1000) {
    return `$${formatCompactNumber(amount / 1000)}k`;
  }

  return `$${amount.toFixed(2)}`;
}

function formatCompactNumber(value) {
  const rounded = Number(value).toFixed(1);
  return rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded;
}

function renderSiteSetupTags() {
  const host = document.getElementById('site-setup-tags');
  if (!host) return;

  const tags = normalizeSiteTags(window._siteSetupTags);
  window._siteSetupTags = tags;

  if (!tags.length) {
    host.innerHTML = '<div class="site-tag-empty">No tags added yet.</div>';
    return;
  }

  host.innerHTML = tags.map((tag, index) => `
    <span class="site-tag-chip">
      ${escapeHtml(tag)}
      <button type="button" onclick="removeSiteSetupTag(${index})" aria-label="Remove ${escapeHtml(tag)}">&times;</button>
    </span>`).join('');
}

function renderSiteSetupExistingTags() {
  const host = document.getElementById('site-setup-existing-tags');
  if (!host) return;

  const existingTags = typeof getAllSiteTags === 'function' ? getAllSiteTags() : [];
  const selectedKeys = new Set(normalizeSiteTags(window._siteSetupTags).map(tag => tag.toLowerCase()));

  if (!existingTags.length) {
    host.innerHTML = '<div class="site-tag-empty">No saved tags in this slot yet.</div>';
    return;
  }

  host.innerHTML = existingTags.map(tag => {
    const active = selectedKeys.has(String(tag || '').toLowerCase());
    return `
      <button type="button" onclick="toggleSiteSetupExistingTag('${encodeURIComponent(tag)}')"
        style="display:inline-flex;align-items:center;gap:6px;margin:0 8px 8px 0;padding:7px 11px;border-radius:999px;border:1px solid ${active ? '#86EFAC' : '#D1FAE5'};background:${active ? '#ECFDF5' : '#F0FDFA'};color:${active ? '#047857' : '#0F766E'};font-size:0.76rem;font-weight:700;cursor:pointer;transition:background 0.12s,border-color 0.12s,color 0.12s;">
        ${active ? '&#10003;' : '+'} ${escapeHtml(tag)}
      </button>`;
  }).join('');
}

function addSiteSetupTag() {
  const input = document.getElementById('site-setup-tag-input');
  if (!input) return;

  const parts = String(input.value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);

  if (!parts.length) return;

  window._siteSetupTags = normalizeSiteTags([...(window._siteSetupTags || []), ...parts]);
  input.value = '';
  renderSiteSetupTags();
  renderSiteSetupExistingTags();
  input.focus();
}

function handleSiteSetupTagKey(event) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    addSiteSetupTag();
  }
}

function removeSiteSetupTag(index) {
  const tags = normalizeSiteTags(window._siteSetupTags);
  tags.splice(index, 1);
  window._siteSetupTags = tags;
  renderSiteSetupTags();
  renderSiteSetupExistingTags();
}

function toggleSiteSetupExistingTag(tag) {
  const safeTag = decodeURIComponent(String(tag || '')).trim();
  if (!safeTag) return;

  const tags = normalizeSiteTags(window._siteSetupTags);
  const key = safeTag.toLowerCase();
  const hasTag = tags.some(entry => String(entry || '').toLowerCase() === key);
  window._siteSetupTags = hasTag
    ? tags.filter(entry => String(entry || '').toLowerCase() !== key)
    : normalizeSiteTags([...tags, safeTag]);

  renderSiteSetupTags();
  renderSiteSetupExistingTags();
}

function openSiteSetupModal(siteId) {
  if (!siteId) return;
  const meta = getSiteMeta(siteId);
  const grouped = getGroupedVisibleSiteHours().find(site => site.siteId === siteId);
  const hours = grouped ? grouped.hours : 0;

  window._siteSetupSiteId = siteId;
  window._siteSetupTags = [...meta.tags];
  document.getElementById('site-setup-siteid').textContent = siteId;
  document.getElementById('site-setup-hours').textContent = `${hours}h visible`;
  document.getElementById('site-setup-main').checked = !!meta.isMain;
  document.getElementById('site-setup-rate').value = meta.flag ? getFlagRate(meta.flag) : '';
  document.getElementById('site-setup-tag-input').value = '';
  document.getElementById('site-setup-subtitle').textContent = grouped && grouped.count > 1
    ? `Saved in the active import slot for ${siteId} and shared across ${grouped.count} sub jobs.`
    : `Saved in the active import slot for this site ID.`;

  const flagHost = document.getElementById('site-setup-flag-options');
  flagHost.innerHTML = SITE_FLAGS.map(flag => {
    const active = meta.flag === flag;
    return `<button type="button" onclick="selectSiteSetupFlag('${flag}')"
      data-flag-opt="${flag}"
      class="site-setup-flag-btn"
      style="padding:8px 12px;border-radius:999px;border:1px solid ${active ? '#86EFAC' : '#E2E8F0'};background:${active ? '#ECFDF5' : '#fff'};color:${active ? '#047857' : '#475569'};font-size:0.78rem;font-weight:700;cursor:pointer;text-transform:uppercase;">
      ${flag}
    </button>`;
  }).join('') + `<button type="button" onclick="selectSiteSetupFlag('')" data-flag-opt=""
      style="padding:8px 12px;border-radius:999px;border:1px solid ${meta.flag ? '#E2E8F0' : '#CBD5E1'};background:${meta.flag ? '#fff' : '#F8FAFC'};color:#64748B;font-size:0.78rem;font-weight:700;cursor:pointer;">
      Clear
    </button>`;

  window._siteSetupFlag = meta.flag || '';
  renderSiteSetupTags();
  renderSiteSetupExistingTags();
  document.getElementById('site-setup-modal').style.display = 'flex';
}

function selectSiteSetupFlag(flag) {
  window._siteSetupFlag = SITE_FLAGS.includes(flag) ? flag : '';
  const selected = window._siteSetupFlag;
  document.querySelectorAll('[data-flag-opt]').forEach(el => {
    const active = el.getAttribute('data-flag-opt') === selected;
    el.style.borderColor = active ? '#86EFAC' : '#E2E8F0';
    el.style.background = active ? '#ECFDF5' : '#fff';
    el.style.color = active ? '#047857' : '#475569';
  });
  document.getElementById('site-setup-rate').value = selected ? getFlagRate(selected) : '';
}

function closeSiteSetupModal() {
  document.getElementById('site-setup-modal').style.display = 'none';
}

function saveSiteSetup() {
  const siteId = window._siteSetupSiteId;
  if (!siteId) return;

  saveSiteMeta(siteId, {
    isMain: document.getElementById('site-setup-main').checked,
    flag: window._siteSetupFlag || '',
    tags: window._siteSetupTags || [],
    rate: Number(document.getElementById('site-setup-rate').value || 0)
  });

  if (typeof refreshTagFilterOptions === 'function') refreshTagFilterOptions();
  closeSiteSetupModal();
  renderSites();
  renderFlagSummary();
  if (typeof persistCurrentSiteJobs === 'function') persistCurrentSiteJobs();
  showToast(`Saved setup for ${siteId}`);
}

function updateFlagRate(flag, value) {
  setFlagRate(flag, Number(value || 0));
  renderFlagSummary();
  renderSites();
  if (typeof persistCurrentSiteJobs === 'function') persistCurrentSiteJobs();
}
