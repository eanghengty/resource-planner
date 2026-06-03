// â”€â”€â”€ Month Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window._selectedMonths = new Set(); // empty = all selected
window._allUsedFlags = [];
window._selectedFlags = new Set();
window._allTags = [];
window._selectedTags = new Set();

function monthKey(dateLabel) {
  const parts = dateLabel.split(' ');
  return parts.length >= 3 ? `${parts[1]} ${parts[2]}` : dateLabel;
}

function populateMonthFilter(dateCols) {
  const months = [...new Set(dateCols.map(dc => monthKey(dc.date)))];
  window._allMonths = months;
  window._selectedMonths = new Set(months);

  const container = document.getElementById('month-options');
  if (!container) return;
  container.innerHTML = months.map(m => `
    <label class="month-opt flex items-center gap-3 px-4 py-2 cursor-pointer select-none">
      <input type="checkbox" value="${m}" checked onchange="onMonthChange()"
        class="flex-shrink-0" />
      <span class="text-sm text-gray-700 font-medium">${m}</span>
    </label>`).join('');
  updateMonthBadge();
}

function onMonthChange() {
  const checkboxes = document.querySelectorAll('#month-options input[type=checkbox]');
  window._selectedMonths = new Set([...checkboxes].filter(c => c.checked).map(c => c.value));
  if (window._selectedMonths.size === 0) selectAllMonths();
  else {
    updateMonthBadge();
    window._sitePage = 1;
    renderSites();
  }
}

function selectAllMonths() {
  document.querySelectorAll('#month-options input[type=checkbox]').forEach(c => c.checked = true);
  window._selectedMonths = new Set(window._allMonths || []);
  updateMonthBadge();
  window._sitePage = 1;
  renderSites();
}

function updateMonthBadge() {
  const total = (window._allMonths || []).length;
  const sel = window._selectedMonths.size;
  const badge = document.getElementById('month-active-count');
  if (!badge) return;
  if (sel < total) {
    badge.textContent = sel;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function toggleMonthMenu() {
  document.getElementById('month-menu').classList.toggle('hidden');
}

// â”€â”€â”€ Flag Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function refreshFlagFilterOptions() {
  const flags = typeof getAllUsedFlags === 'function' ? getAllUsedFlags() : [];
  const container = document.getElementById('flagfilter-options');
  if (!container) return;

  window._allUsedFlags = flags;

  if (!flags.length) {
    window._selectedFlags = new Set();
    container.innerHTML = '<div class="flagfilter-empty">No flags yet. Assign flags in Site Setup first.</div>';
    updateFlagFilterBadge();
    return;
  }

  const previous = window._selectedFlags || new Set(flags);
  const nextSelected = new Set(flags.filter(flag => previous.has(flag)));
  window._selectedFlags = nextSelected.size > 0 ? nextSelected : new Set(flags);

  container.innerHTML = flags.map(flag => `
    <label class="flagfilter-opt flex items-center gap-3 px-4 py-2 cursor-pointer select-none">
      <input type="checkbox" value="${escapeHtml(flag)}" ${window._selectedFlags.has(flag) ? 'checked' : ''} onchange="onFlagFilterChange()"
        class="flex-shrink-0" />
      <span class="text-sm text-gray-700 font-medium uppercase">${escapeHtml(flag)}</span>
    </label>`).join('');

  updateFlagFilterBadge();
}

function onFlagFilterChange() {
  const checkboxes = document.querySelectorAll('#flagfilter-options input[type=checkbox]');
  window._selectedFlags = new Set([...checkboxes].filter(c => c.checked).map(c => c.value));
  if (window._selectedFlags.size === 0) selectAllFlags();
  else {
    updateFlagFilterBadge();
    window._sitePage = 1;
    renderSites();
  }
}

function selectAllFlags() {
  document.querySelectorAll('#flagfilter-options input[type=checkbox]').forEach(c => c.checked = true);
  window._selectedFlags = new Set(window._allUsedFlags || []);
  updateFlagFilterBadge();
  window._sitePage = 1;
  renderSites();
}

function updateFlagFilterBadge() {
  const total = (window._allUsedFlags || []).length;
  const sel = window._selectedFlags.size;
  const badge = document.getElementById('flagfilter-active-count');
  const btn = document.getElementById('flagfilter-btn');
  if (!badge || !btn) return;

  if (total > 0 && sel < total) {
    badge.textContent = sel;
    badge.classList.remove('hidden');
    btn.classList.add('date-range-active');
  } else {
    badge.classList.add('hidden');
    btn.classList.remove('date-range-active');
  }
}

function toggleFlagFilterMenu() {
  document.getElementById('flagfilter-menu').classList.toggle('hidden');
}

// â”€â”€â”€ Tag Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function refreshTagFilterOptions() {
  const tags = typeof getAllSiteTags === 'function' ? getAllSiteTags() : [];
  const container = document.getElementById('tagfilter-options');
  if (!container) return;

  window._allTags = tags;

  if (!tags.length) {
    window._selectedTags = new Set();
    container.innerHTML = '<div class="tagfilter-empty">No tags yet. Add tags in Site Setup first.</div>';
    updateTagFilterBadge();
    return;
  }

  const previous = window._selectedTags || new Set(tags);
  const previousKeys = new Set([...previous].map(tag => String(tag || '').toLowerCase()));
  const nextSelected = new Set(tags.filter(tag => previousKeys.has(String(tag || '').toLowerCase())));
  window._selectedTags = nextSelected.size > 0 ? nextSelected : new Set(tags);

  container.innerHTML = tags.map(tag => `
    <label class="tagfilter-opt flex items-center gap-3 px-4 py-2 cursor-pointer select-none">
      <input type="checkbox" value="${escapeHtml(tag)}" ${window._selectedTags.has(tag) ? 'checked' : ''} onchange="onTagFilterChange()"
        class="flex-shrink-0" />
      <span class="text-sm text-gray-700 font-medium">${escapeHtml(tag)}</span>
    </label>`).join('');

  updateTagFilterBadge();
}

function onTagFilterChange() {
  const checkboxes = document.querySelectorAll('#tagfilter-options input[type=checkbox]');
  window._selectedTags = new Set([...checkboxes].filter(c => c.checked).map(c => c.value));
  if (window._selectedTags.size === 0) selectAllTags();
  else {
    updateTagFilterBadge();
    window._sitePage = 1;
    renderSites();
  }
}

function selectAllTags() {
  document.querySelectorAll('#tagfilter-options input[type=checkbox]').forEach(c => c.checked = true);
  window._selectedTags = new Set(window._allTags || []);
  updateTagFilterBadge();
  window._sitePage = 1;
  renderSites();
}

function updateTagFilterBadge() {
  const total = (window._allTags || []).length;
  const sel = window._selectedTags.size;
  const badge = document.getElementById('tagfilter-active-count');
  const btn = document.getElementById('tagfilter-btn');
  if (!badge || !btn) return;

  if (total > 0 && sel < total) {
    badge.textContent = sel;
    badge.classList.remove('hidden');
    btn.classList.add('date-range-active');
  } else {
    badge.classList.add('hidden');
    btn.classList.remove('date-range-active');
  }
}

function toggleTagFilterMenu() {
  document.getElementById('tagfilter-menu').classList.toggle('hidden');
}

// â”€â”€â”€ Date Range Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window._dateFrom = null;
window._dateTo = null;

function toggleDateRangeMenu() {
  document.getElementById('daterange-menu').classList.toggle('hidden');
}

function onDateRangeChange() {
  window._dateFrom = document.getElementById('date-from').value || null;
  window._dateTo = document.getElementById('date-to').value || null;
  updateDateRangeLabel();
  window._sitePage = 1;
  renderSites();
}

function clearDateRange() {
  document.getElementById('date-from').value = '';
  document.getElementById('date-to').value = '';
  window._dateFrom = null;
  window._dateTo = null;
  updateDateRangeLabel();
  window._sitePage = 1;
  renderSites();
}

function updateDateRangeLabel() {
  const lbl = document.getElementById('daterange-label');
  const btn = document.getElementById('daterange-btn');
  if (!lbl || !btn) return;
  const from = window._dateFrom;
  const to = window._dateTo;
  if (from || to) {
    const fStr = from ? from.slice(5).replace('-', '/') : 'â€¦';
    const tStr = to ? to.slice(5).replace('-', '/') : 'â€¦';
    lbl.textContent = `${fStr} â€“ ${tStr}`;
    btn.classList.add('date-range-active');
  } else {
    lbl.textContent = 'Date Range';
    btn.classList.remove('date-range-active');
  }
}

function siteInDateRange(site) {
  const from = window._dateFrom;
  const to = window._dateTo;
  if (!from && !to) return true;
  return (site.dateList || []).some(label => {
    const iso = dateLabelToISO(label);
    if (!iso) return false;
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    return true;
  });
}

function activeDataCols() {
  const sel = window._selectedMonths;
  const from = window._dateFrom;
  const to = window._dateTo;
  const all = window._dateCols || [];
  return all.filter(dc => {
    if (sel && sel.size > 0 && !sel.has(monthKey(dc.date))) return false;
    if (from || to) {
      const iso = dateLabelToISO(dc.date);
      if (from && iso < from) return false;
      if (to && iso > to) return false;
    }
    return true;
  });
}

// â”€â”€â”€ Close dropdowns when clicking outside â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.addEventListener('click', e => {
  const wrapMonth = document.getElementById('month-wrapper');
  if (wrapMonth && !wrapMonth.contains(e.target))
    document.getElementById('month-menu')?.classList.add('hidden');

  const wrapFlag = document.getElementById('flagfilter-wrapper');
  if (wrapFlag && !wrapFlag.contains(e.target))
    document.getElementById('flagfilter-menu')?.classList.add('hidden');

  const wrapTag = document.getElementById('tagfilter-wrapper');
  if (wrapTag && !wrapTag.contains(e.target))
    document.getElementById('tagfilter-menu')?.classList.add('hidden');

  const wrapDR = document.getElementById('daterange-wrapper');
  if (wrapDR && !wrapDR.contains(e.target))
    document.getElementById('daterange-menu')?.classList.add('hidden');

  const wrapGroup = document.getElementById('groupby-wrapper');
  if (wrapGroup && !wrapGroup.contains(e.target))
    document.getElementById('groupby-menu')?.classList.add('hidden');
});
