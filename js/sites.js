// ─── Extract unique sites — one row per unique full name ─────────────────────
function extractSites(rows, dateCols) {
  const skip = new Set(['standby','public holiday','l2 training','travel wa + l2',
    'trianing (wah & tr) - vic','travel wa + l2 training','prep work','','nan']);

  const siteMap = {};

  rows.forEach(row => {
    row.days.forEach((d, i) => {
      if (!d) return;
      const base = d.replace(/\(.*?\)/g, '').replace(/\n.*/g, '').trim();
      const key  = base.toLowerCase();
      if (!base || skip.has(key) || key.includes('training') || key.includes('travel') || key.includes('trianing')) return;

      const dateLabel = dateCols[i]?.date || '';
      const expanded  = expandSlashSites(base);

      expanded.forEach(({ display, siteId }, idx) => {
        if (!siteId) return;
        const dk = display.toLowerCase();
        const siblings = expanded.filter((_, j) => j !== idx).map(e => e.display);
        if (!siteMap[dk]) {
          siteMap[dk] = {
            display,
            siteId,
            dateSet: new Set(),
            idxSet: new Set(),
            rawBase: base,
            slashSiblings: siblings,
            totalSlots: 0,
            slotsByDate: {}
          };
        }
        if (dateLabel) siteMap[dk].dateSet.add(dateLabel);
        siteMap[dk].idxSet.add(i);
        siteMap[dk].totalSlots += 1;
        if (dateLabel) siteMap[dk].slotsByDate[dateLabel] = (siteMap[dk].slotsByDate[dateLabel] || 0) + 1;
      });
    });
  });

  return Object.values(siteMap)
    .map(s => {
      const sorted  = [...s.dateSet].sort((a, b) => new Date(a) - new Date(b));
      const from    = sorted[0];
      const to      = sorted[sorted.length - 1];
      const actualDays = sorted.length;

      const idxsSorted = [...s.idxSet].sort((a, b) => a - b);
      const minIdx = idxsSorted[0], maxIdx = idxsSorted[idxsSorted.length - 1];
      const expectedCount = maxIdx - minIdx + 1;
      const hasGap = idxsSorted.length < expectedCount;

      const dateList = sorted;

      return {
        display: s.display,
        siteId: s.siteId,
        from,
        to,
        actualDays,
        hasGap,
        dateList,
        slashSiblings: s.slashSiblings,
        totalSlots: s.totalSlots,
        slotsByDate: s.slotsByDate
      };
    })
    .sort((a, b) => a.display.localeCompare(b.display));
}

// ─── Sites panel: render, filter, sort ───────────────────────────────────────
function getDayCount(site) {
  return site.actualDays || 1;
}

// ─── Pagination & Collapse state ─────────────────────────────────────────────
window._sitePage    = 1;
const GROUPS_PER_PAGE = 20;
window._collapsed   = {};

function renderSites() {
  if (typeof refreshFlagFilterOptions === 'function') refreshFlagFilterOptions();
  if (typeof refreshTagFilterOptions === 'function') refreshTagFilterOptions();

  const sites      = window._allSites || [];
  const query      = (document.getElementById('site-search')?.value || '').toLowerCase();
  const filter     = window._siteFilter || 'all';
  const sortKey    = document.getElementById('site-sort')?.value || 'name';
  const activeDates = new Set(activeDataCols().map(dc => dc.date));

  let filtered = sites.filter(s => {
    const inMonth     = s.dateList.some(d => activeDates.has(d));
    const matchSearch = s.display.toLowerCase().includes(query);
    const activeDays  = s.dateList.filter(d => activeDates.has(d)).length;
    const matchFilter = filter === 'all' ? true : filter === 'multiday' ? activeDays > 1 : activeDays === 1;
    const matchFlags  = siteMatchesSelectedFlags(s);
    const matchTags   = siteMatchesSelectedTags(s);
    return inMonth && matchSearch && matchFilter && matchFlags && matchTags;
  });

  if (sortKey === 'name')          filtered.sort((a, b) => a.display.localeCompare(b.display));
  else if (sortKey === 'date')     filtered.sort((a, b) => new Date(a.from) - new Date(b.from));
  else if (sortKey === 'duration') filtered.sort((a, b) => getDayCount(b) - getDayCount(a));

  const container = document.getElementById('sites-list');
  const empty     = document.getElementById('sites-empty');
  const countEl   = document.getElementById('sites-count');
  const uniqueIdCount = new Set(filtered.map(s => s.siteId).filter(Boolean)).size;
  if (countEl) countEl.textContent = uniqueIdCount;
  const cardEl = document.getElementById('card-val-sticker-tl');
  if (cardEl) cardEl.textContent = uniqueIdCount;
  if (typeof renderFlagSummary === 'function') renderFlagSummary();

  if (!filtered.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // ── Build groups & paginate ──────────────────────────────────────────────
  const allGroups  = buildGroups(filtered);
  window._currentGroups = allGroups;
  const mode       = window._groupBy || 'siteid';
  const totalPages = Math.max(1, Math.ceil(allGroups.length / GROUPS_PER_PAGE));
  const page       = Math.min(window._sitePage || 1, totalPages);
  window._sitePage = page;

  const pageStart  = (page - 1) * GROUPS_PER_PAGE;
  const pageGroups = allGroups.slice(pageStart, pageStart + GROUPS_PER_PAGE);

  // ── Render pagination bar ────────────────────────────────────────────────
  const pbar   = document.getElementById('pagination-bar');
  const pbtns  = document.getElementById('pagination-btns');
  const pinfo  = document.getElementById('pagination-info');
  if (totalPages > 1) {
    pbar.classList.remove('hidden');
    const grpEnd = Math.min(pageStart + GROUPS_PER_PAGE, allGroups.length);
    pinfo.textContent = `Groups ${pageStart + 1}–${grpEnd} of ${allGroups.length}`;

    let btnHtml = `<button class="page-btn" onclick="goPage(${page-1})" ${page===1?'disabled':''}>← Prev</button>`;
    for (let p2 = 1; p2 <= totalPages; p2++) {
      if (totalPages <= 7 || Math.abs(p2 - page) <= 2 || p2 === 1 || p2 === totalPages) {
        btnHtml += `<button class="page-btn ${p2===page?'active-page':''}" onclick="goPage(${p2})">${p2}</button>`;
      } else if (Math.abs(p2 - page) === 3) {
        btnHtml += `<span class="text-gray-400 px-1 text-sm">…</span>`;
      }
    }
    btnHtml += `<button class="page-btn" onclick="goPage(${page+1})" ${page===totalPages?'disabled':''}>Next →</button>`;
    pbtns.innerHTML = btnHtml;
  } else {
    pbar.classList.add('hidden');
  }

  // ── Render groups on this page ───────────────────────────────────────────
  let globalOffset = 0;
  for (let gi = 0; gi < pageStart; gi++) globalOffset += allGroups[gi].items.length;

  container.innerHTML = pageGroups.map((group, gi) => {
    const absGi      = pageStart + gi;
    const groupBg    = absGi % 2 === 0 ? 'bg-white' : 'bg-slate-50';
    const hasMany    = group.items.length > 1;
    const showHeader = mode !== 'siteid' || hasMany;
    const isCollapsed = !!window._collapsed[group.key];
    const safeKey    = group.key.replace(/'/g, "\\'");
    const uniqueSiteIdCount = new Set(group.items.map(s => s.siteId).filter(Boolean)).size;
    const activeDts = new Set(activeDataCols().map(dc => dc.date));
    const groupTotalHours = group.items.reduce((sum, site) => sum + getSiteHourCount(site, activeDts), 0);
    const groupSiteId = mode === 'siteid' ? group.items[0]?.siteId : '';
    const groupMeta = getSiteMeta(groupSiteId);
    const groupHoursBadge = mode === 'siteid'
      ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">${groupTotalHours}h total</span>`
      : '';
    const groupMainBadge = mode === 'siteid' && groupMeta.isMain
      ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">Main</span>`
      : '';
    const groupFlagBadge = mode === 'siteid' && groupMeta.flag
      ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 uppercase">${groupMeta.flag}</span>`
      : '';
    const groupSetupBtn = mode === 'siteid' && groupSiteId
      ? `<button onclick="event.stopPropagation();openSiteSetupModal('${groupSiteId}')"
          title="Set main site, flag, and cost"
          class="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition flex-shrink-0">
          Setup
        </button>`
      : '';

    const headerIcon = mode === 'startdate'
      ? `<svg class="w-3.5 h-3.5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`
      : mode === 'status'
      ? `<svg class="w-3.5 h-3.5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
      : `<svg class="w-3.5 h-3.5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>`;

    const groupHeader = showHeader ? `
      <div id="grphdr-${CSS.escape(group.key)}"
           class="group-header-bar flex items-center gap-2 px-4 py-2.5 ${isCollapsed ? 'collapsed-header' : ''}"
           onclick="toggleGroup('${safeKey}')">
        <svg class="chevron w-4 h-4 text-sky-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
        ${headerIcon}
        <span class="text-sm font-bold text-sky-800">${group.label}</span>
        <div class="ml-auto flex items-center gap-1.5">
          ${groupMainBadge}
          ${groupFlagBadge}
          ${groupHoursBadge}
          <span class="text-xs text-sky-600 font-medium bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
            ${group.items.length} site${group.items.length > 1 ? 's' : ''}
          </span>
          ${groupSetupBtn}
          ${mode === 'startdate' ? `<span class="text-xs font-medium bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-200">${uniqueSiteIdCount} unique ID${uniqueSiteIdCount !== 1 ? 's' : ''}</span>` : ''}
          ${mode === 'startdate' ? `
          <button onclick="event.stopPropagation();draftEmailForDate('${safeKey}')"
            title="Download .eml — opens as a draft in Outlook with HTML table pre-filled"
            class="email-draft-btn flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 hover:border-sky-300 transition flex-shrink-0">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            Draft Email
          </button>` : ''}
        </div>
      </div>` : '';

    const bodyStyle  = isCollapsed ? 'style="max-height:0px" ' : 'style="max-height:none" ';
    const bodyClass  = `group-body ${isCollapsed ? 'collapsed' : ''}`;

    const rows = group.items.map(s => {
      const itemNum    = ++globalOffset;
      const days       = s.dateList.filter(d => activeDts.has(d)).length || 1;
      const totalHours = getSiteHourCount(s, activeDts);
      const isMulti    = days > 1;
      const showRowHours = !(mode === 'siteid' && hasMany);
      const meta = getSiteMeta(s.siteId);

      const activeDatesSorted = s.dateList.filter(d => activeDts.has(d)).sort((a,b) => new Date(a)-new Date(b));
      const dispFrom = mode === 'startdate' ? group.key : (activeDatesSorted[0] || s.from);
      const dispTo   = activeDatesSorted[activeDatesSorted.length-1] || s.to;

      const durationBadge = isMulti
        ? `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">${days}d</span>`
        : `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">1d</span>`;
      const hoursBadge = showRowHours
        ? `<span class="site-hours-badge" title="${totalHours} total hours" style="display:inline-flex;align-items:center;flex-shrink:0;min-height:20px;padding:2px 8px;border-radius:9999px;background:#D1FAE5;color:#047857;font-size:0.72rem;font-weight:800;line-height:1;">${totalHours}h</span>`
        : '';
      const mainBadge = meta.isMain
        ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">Main</span>`
        : '';
      const flagBadge = meta.flag
        ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 uppercase">${meta.flag}</span>`
        : '';

      const activeIdxs = activeDataCols().map((dc,i)=>({date:dc.date,i})).filter(x=>s.dateList.includes(x.date)).map(x=>x.i);
      const activeGap  = activeIdxs.length > 1 && (activeIdxs[activeIdxs.length-1] - activeIdxs[0] + 1) > activeIdxs.length;
      const gapBadge   = activeGap
        ? `<span title="Non-consecutive dates: ${activeDatesSorted.join(', ')}" class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 cursor-help"><svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>Gap</span>`
        : '';

      const idTag = s.siteId
        ? (showHeader && mode === 'siteid'
            ? `<span class="w-1.5 h-4 rounded-full bg-green-300 flex-shrink-0"></span>`
            : `<span class="text-xs font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-800 flex-shrink-0">${s.siteId}</span>`)
        : '';

      const desc = s.siteId ? s.display.replace(s.siteId, '').trim() : s.display;

      const safeDisplay = s.display.replace(/'/g, "\\'");
      return `
        <div class="site-card ${groupBg} px-4 py-2.5 transition ${showHeader ? 'border-b border-gray-100 last:border-0' : 'rounded-xl border border-gray-100 mb-1'}" style="display:grid;grid-template-columns:42px minmax(240px,1fr) 72px 112px 112px 96px;column-gap:8px;align-items:center;">
          <div class="text-center text-xs font-bold text-gray-300 cursor-pointer" onclick="openSiteModal('${safeDisplay}')" title="Click to view detail">${itemNum}</div>
          <div class="site-name-cell flex items-center gap-2 cursor-pointer" onclick="openSiteModal('${safeDisplay}')" title="Click to view detail">
            ${idTag}
            <span class="font-semibold text-gray-800 text-sm truncate flex-1 min-w-0">${desc || s.display}</span>
            ${mainBadge}
            ${flagBadge}
            ${hoursBadge}
          </div>
          <div class="site-flag flex justify-center cursor-pointer" onclick="openSiteModal('${safeDisplay}')" title="Click to view detail">${gapBadge}</div>
          <div class="site-date text-center text-xs text-gray-500 cursor-pointer" onclick="openSiteModal('${safeDisplay}')" title="Click to view detail">${dispFrom || '—'}</div>
          <div class="site-date text-center text-xs text-gray-500 cursor-pointer" onclick="openSiteModal('${safeDisplay}')" title="Click to view detail">${dispTo !== dispFrom ? dispTo : '—'}</div>
          <div class="site-actions flex gap-1 flex-wrap items-center">
            ${durationBadge}
            ${s.siteId ? `<button onclick="openSiteSetupModal('${s.siteId}')" title="Set main site, flag, and cost"
              class="p-1 rounded hover:bg-emerald-50 text-emerald-500 hover:text-emerald-700 transition flex-shrink-0">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
              </svg>
            </button>` : ''}
            <button onclick="openEditJobModal('${safeDisplay}')" title="Edit job name"
              class="p-1 rounded hover:bg-yellow-50 text-yellow-500 hover:text-yellow-700 transition flex-shrink-0">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 012.828 2.828L11.828 13.828a4 4 0 01-1.414.94l-3.414.586.586-3.414A4 4 0 019 11z"/>
              </svg>
            </button>
            <svg class="w-3.5 h-3.5 text-blue-400 flex-shrink-0 cursor-pointer" onclick="openSiteModal('${safeDisplay}')" title="Click to view detail" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </div>
        </div>`;
    }).join('');

    const borderClass = showHeader ? 'border border-gray-200 rounded-xl mb-2 overflow-hidden shadow-sm' : 'mb-1';
    return `
      <div class="${borderClass}">
        ${groupHeader}
        <div id="grpbody-${CSS.escape(group.key)}" class="${bodyClass}" ${bodyStyle}>${rows}</div>
      </div>`;
  }).join('');
}

function filterSites() { window._sitePage = 1; renderSites(); }

function setSiteFilter(val) {
  window._siteFilter = val;
  window._sitePage   = 1;
  document.querySelectorAll('.site-filter-btn').forEach(b => b.classList.remove('active-filter'));
  document.getElementById('f-' + val)?.classList.add('active-filter');
  renderSites();
}

function toggleGroup(key) {
  window._collapsed[key] = !window._collapsed[key];
  const body   = document.getElementById('grpbody-' + CSS.escape(key));
  const header = document.getElementById('grphdr-'  + CSS.escape(key));
  if (!body || !header) return;
  if (window._collapsed[key]) {
    body.style.maxHeight = '0px';
    body.classList.add('collapsed');
    header.classList.add('collapsed-header');
  } else {
    body.style.maxHeight = body.scrollHeight + 'px';
    body.classList.remove('collapsed');
    header.classList.remove('collapsed-header');
    setTimeout(() => { if (!window._collapsed[key]) body.style.maxHeight = 'none'; }, 260);
  }
}

function goPage(p) {
  window._sitePage = p;
  renderSites();
  document.getElementById('sites-list')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// ─── Group By ────────────────────────────────────────────────────────────────
window._groupBy = 'siteid';

function toggleGroupMenu() {
  document.getElementById('groupby-menu').classList.toggle('hidden');
}

function setGroupBy(val) {
  window._groupBy   = val;
  window._sitePage  = 1;
  window._collapsed = {};
  const labels = { siteid: 'Site ID', startdate: 'Start Date', status: 'Status' };
  document.getElementById('groupby-label').textContent = labels[val] || val;
  document.querySelectorAll('.groupby-opt').forEach(b => b.classList.remove('active-group'));
  const map = { siteid: 0, startdate: 1, status: 2 };
  document.querySelectorAll('.groupby-opt')[map[val]]?.classList.add('active-group');
  document.getElementById('groupby-menu').classList.add('hidden');
  renderSites();
}

function getStatusLabel(site) {
  if (site.hasGap) return 'Non-consecutive';
  if (site.actualDays > 1) return 'Multi-day';
  return 'Single-day';
}

function buildGroups(filtered) {
  const mode = window._groupBy || 'siteid';
  const groupMap = new Map();
  const activeDates = mode === 'startdate'
    ? new Set(activeDataCols().map(dc => dc.date))
    : null;

  filtered.forEach(s => {
    if (mode === 'siteid') {
      const key   = s.siteId || '__' + s.display;
      const label = s.siteId || s.display;
      if (!groupMap.has(key)) groupMap.set(key, { label, key, items: [] });
      groupMap.get(key).items.push(s);
    } else if (mode === 'startdate') {
      const allDates = s.dateList && s.dateList.length ? s.dateList : [s.from || '—'];
      const dates = allDates.filter(d => activeDates.has(d));
      if (!dates.length) return;
      dates.forEach(date => {
        const key   = date || '—';
        const label = date || 'No date';
        if (!groupMap.has(key)) groupMap.set(key, { label, key, items: [] });
        groupMap.get(key).items.push(s);
      });
    } else {
      const label = getStatusLabel(s);
      const key   = label;
      if (!groupMap.has(key)) groupMap.set(key, { label, key, items: [] });
      groupMap.get(key).items.push(s);
    }
  });

  const sortKey = document.getElementById('site-sort')?.value || 'name';
  const groups  = [...groupMap.values()];
  if (mode === 'startdate') {
    groups.sort((a, b) => new Date(a.key) - new Date(b.key));
  } else if (mode === 'status') {
    const order = ['Multi-day', 'Single-day', 'Non-consecutive'];
    groups.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  } else {
    groups.sort((a, b) => a.label.localeCompare(b.label));
  }
  return groups;
}
