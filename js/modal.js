// Site Detail Modal
function openSiteModal(displayKey) {
  const site      = (window._allSites || []).find(s => s.display === displayKey);
  const employees = window._allEmployees || [];
  const dateCols  = activeDataCols();
  if (!site) return;

  const allDateCols = window._dateCols || [];
  const dateToOrigIdx = {};
  allDateCols.forEach((dc, idx) => { dateToOrigIdx[dc.date] = idx; });

  const modalRows = [];
  employees.forEach(emp => {
    const cells = dateCols.map(dc => {
      const origIdx = dateToOrigIdx[dc.date];
      const raw  = (origIdx !== undefined ? emp.days[origIdx] : '') || '';
      const base = raw.replace(/\(.*?\)/g, '').replace(/\n.*/g, '').trim();
      const expanded = expandSlashSites(base);
      const match = expanded.some(e => e.display.toLowerCase() === site.display.toLowerCase());
      return match ? raw : '';
    });
    if (cells.some(c => c)) modalRows.push({ name: emp.name, cells });
  });

  const totalAssign = modalRows.reduce((sum, row) => sum + row.cells.filter(Boolean).length, 0);
  const activeDays = site.dateList.filter(d => dateCols.some(dc => dc.date === d)).length || site.actualDays || 1;
  const totalHours = totalAssign * HOURS_PER_PERSON_DAY;

  document.getElementById('modal-title').textContent   = site.display;
  document.getElementById('modal-site-id').textContent = site.siteId || '-';
  document.getElementById('modal-hours-badge').textContent = `${totalHours}h total`;
  const gapBadge = document.getElementById('modal-gap-badge');
  site.hasGap ? gapBadge.classList.remove('hidden') : gapBadge.classList.add('hidden');

  document.getElementById('modal-subtitle').textContent =
    `${modalRows.length} employee${modalRows.length !== 1 ? 's' : ''} assigned · ${activeDays} day${activeDays !== 1 ? 's' : ''} active · ${totalAssign} total slot${totalAssign !== 1 ? 's' : ''} · ${totalHours}h total`;
  document.getElementById('modal-footer-info').textContent =
    site.hasGap ? `Dates: ${site.dateList.join(' · ')}` : `Active: ${site.from}${site.to !== site.from ? ' -> ' + site.to : ''}`;

  window._modalData = { site, dateCols, modalRows };

  const tog = document.getElementById('hide-inactive-toggle');
  if (tog) tog.checked = false;
  document.getElementById('toggle-track')?.parentElement?.classList.remove('toggle-on');

  renderModalTable(false);

  const modal = document.getElementById('site-modal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderModalTable(hideInactive) {
  const { site, dateCols, modalRows } = window._modalData || {};
  if (!site) return;

  const visibleCols = hideInactive
    ? dateCols.filter(dc => site.dateList.includes(dc.date))
    : dateCols;

  let html = '<thead><tr>';
  html += '<th class="text-left text-xs font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10">Employee</th>';
  visibleCols.forEach(dc => {
    const isActive = site.dateList.includes(dc.date);
    html += `<th class="modal-date-col text-center text-xs font-semibold ${isActive ? 'text-green-700 bg-green-50' : 'text-gray-400 bg-gray-50'}">
      <div class="font-bold">${dc.day}</div>
      <div class="font-normal text-gray-400">${dc.date}</div>
    </th>`;
  });
  html += '</tr></thead><tbody>';

  modalRows.forEach((row, ri) => {
    const visibleCells = visibleCols.map(dc => {
      const colIdx = dateCols.findIndex(d => d.date === dc.date);
      return { cell: row.cells[colIdx] || '', dc };
    });

    html += `<tr class="${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/20 transition">`;
    html += `<td class="font-semibold text-gray-800 sticky left-0 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'} text-xs whitespace-nowrap border-r border-gray-100 pr-3 z-10">${row.name}</td>`;
    visibleCells.forEach(({ cell: c, dc }) => {
      const isActive = site.dateList.includes(dc.date);
      if (c) {
        const short = c.replace(/\(.*?\)/g, '').trim();
        html += `<td class="modal-present text-center text-xs px-2 py-2" title="${c.replace(/"/g, "'")}">${short}</td>`;
      } else {
        html += `<td class="${isActive ? 'bg-red-50 text-red-300' : 'modal-absent'} text-center text-xs px-2 py-2">${isActive ? '-' : ''}</td>`;
      }
    });
    html += '</tr>';
  });

  if (!modalRows.length) {
    html += `<tr><td colspan="${visibleCols.length + 1}" class="text-center text-gray-400 py-6 text-sm">No employees found for this site.</td></tr>`;
  }
  html += '</tbody>';
  document.getElementById('modal-table').innerHTML = html;
}

function toggleInactiveDays() {
  const tog   = document.getElementById('hide-inactive-toggle');
  const label = tog?.parentElement;
  if (tog.checked) {
    label?.classList.add('toggle-on');
  } else {
    label?.classList.remove('toggle-on');
  }
  renderModalTable(tog.checked);
}

function closeModal() {
  document.getElementById('site-modal').classList.remove('open');
  document.body.style.overflow = '';
}

// Close modals on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeEditJobModal(); }
});
