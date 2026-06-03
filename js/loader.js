// Main data loader: Excel is import-only; IndexedDB is the app source of truth.
async function loadFile(slotId = null) {
  showLoading();

  try {
    if (slotId && typeof setActiveScheduleSlotId === 'function') {
      await setActiveScheduleSlotId(slotId);
    }

    await refreshSlotUI();

    const activeSlotId = typeof getActiveScheduleSlotId === 'function' ? await getActiveScheduleSlotId() : null;
    const saved = typeof getScheduleDataFromIDB === 'function' ? await getScheduleDataFromIDB(activeSlotId) : null;
    if (!saved || !Array.isArray(saved.employees) || !Array.isArray(saved.dateCols)) {
      showLanding();
      updateResumeVisibility();
      return;
    }

    await renderDashboardFromDataset(saved);
  } catch (err) {
    showLanding();
    showLoadError(err);
  }
}

async function importExcelFile() {
  await openImportSlotModal();
}

async function performImportExcelFile(target) {
  showLoading();

  try {
    const picked = await pickExcelFileBuffer();
    if (!picked) {
      showLanding();
      return;
    }

    const dataset = parseWorkbookToDataset(picked.buffer, picked.name);
    const slot = await prepareSlotForImport(dataset, picked.name, target);
    window._activeScheduleSlotId = slot.id;
    if (typeof saveScheduleDataToIDB === 'function') await saveScheduleDataToIDB(dataset);
    if (typeof setActiveScheduleSlotId === 'function') await setActiveScheduleSlotId(slot.id);
    await refreshSlotUI();
    await renderDashboardFromDataset(dataset);
    showToast(`Imported ${picked.name} into ${slot.label}`);
  } catch (err) {
    showLanding();
    showLoadError(err);
  }
}

function deriveSlotLabel(dataset, fallbackName = '') {
  const months = [...new Set((dataset?.dateCols || []).map(dc => monthKey(dc.date)).filter(Boolean))];
  if (months.length === 1) return months[0];
  if (months.length > 1) return `${months[0]} to ${months[months.length - 1]}`;
  return String(fallbackName || dataset?.sourceName || 'Imported schedule')
    .replace(/\.[^.]+$/, '')
    .trim() || 'Imported schedule';
}

async function prepareSlotForImport(dataset, importName, target = {}) {
  const now = new Date().toISOString();
  const slots = typeof getScheduleSlots === 'function' ? await getScheduleSlots() : [];
  const targetMode = target?.mode === 'new' ? 'new' : 'existing';
  const targetSlotId = targetMode === 'existing' ? target.slotId : null;
  const activeSlot = slots.find(slot => slot.id === targetSlotId) || null;
  const sourceName = importName || dataset.sourceName || '';
  const requestedLabel = String(target?.label || '').trim();
  const slotLabel = requestedLabel || deriveSlotLabel(dataset, sourceName);

  if (targetMode === 'existing' && activeSlot) {
    const updatedSlot = typeof updateScheduleSlot === 'function'
      ? await updateScheduleSlot(activeSlot.id, {
          sourceName,
          updatedAt: now,
          lastImportName: sourceName
        })
      : null;
    return updatedSlot || activeSlot;
  }

  if (targetMode === 'existing') {
    throw new Error('Choose a valid import target slot before importing.');
  }

  if (typeof createScheduleSlot === 'function') {
    return await createScheduleSlot({
      label: slotLabel,
      sourceName,
      createdAt: now,
      updatedAt: now,
      lastImportName: sourceName
    });
  }

  return {
    id: targetSlotId || `slot-${Date.now()}`,
    label: slotLabel,
    sourceName,
    createdAt: now,
    updatedAt: now,
    lastImportName: sourceName
  };
}

function showLoading() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('error-banner').classList.add('hidden');
}

function showLoadError(err) {
  document.getElementById('error-banner').textContent = 'Warning: ' + (err?.message || err);
  document.getElementById('error-banner').classList.remove('hidden');
  console.error(err);
}

async function pickExcelFileBuffer() {
  if (window.showOpenFilePicker) {
    let picked;
    try {
      [picked] = await window.showOpenFilePicker({
        types: [{ description: 'Excel file', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        multiple: false,
      });
    } catch {
      return null;
    }

    const file = await picked.getFile();
    return { buffer: await file.arrayBuffer(), name: file.name || picked.name || 'imported schedule.xlsx' };
  }

  const fallback = await pickFileWithInput();
  return fallback ? { ...fallback, name: fallback.name || 'imported schedule.xlsx' } : null;
}

function parseWorkbookToDataset(buf, sourceName) {
  // Do NOT use cellDates:true. It creates local-time Date objects that can shift
  // by the user's UTC offset. Read raw serial numbers and convert manually.
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  expandMergedCells(ws);

  let maxCol = 0, maxRow = 0;
  Object.keys(ws).forEach(key => {
    if (key.startsWith('!')) return;
    const pos = XLSX.utils.decode_cell(key);
    if (pos.c > maxCol) maxCol = pos.c;
    if (pos.r > maxRow) maxRow = pos.r;
  });

  const dateCols = [];
  for (let c = 2; c <= maxCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    let dateLabel = '';
    if (cell && cell.t === 'n') {
      dateLabel = excelSerialToLabel(cell.v);
    } else {
      dateLabel = cell ? String(cell.v || '') : '';
    }

    const dayCell = ws[XLSX.utils.encode_cell({ r: 1, c })];
    const dayLabel = dayCell ? String(dayCell.v || '') : '';
    if (!dateLabel && !dayLabel) continue;
    dateCols.push({ idx: c, date: dateLabel, day: dayLabel });
  }

  const employees = [];
  for (let r = 2; r <= maxRow; r++) {
    const nameCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const name = nameCell ? String(nameCell.v || '').trim() : '';
    if (!name) continue;

    const days = dateCols.map(dc => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: dc.idx })];
      return cell ? String(cell.v || '').replace(/\r\n|\r|\n/g, ' / ').trim() : '';
    });
    employees.push({ name, days });
  }

  return {
    sourceName,
    sheetName,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    employees,
    dateCols
  };
}

function expandMergedCells(ws) {
  if (!ws || !ws['!merges']) return;

  ws['!merges'].forEach(merge => {
    const originAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const originCell = ws[originAddr];
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r === merge.s.r && c === merge.s.c) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        if (originCell) ws[addr] = { ...originCell };
      }
    }
  });
}

function excelSerialToLabel(serial) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = months[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  return `${day} ${mon} ${yr}`;
}

async function renderDashboardFromDataset(dataset) {
  if (typeof initSiteMetaState === 'function') await initSiteMetaState();

  const activeSlotId = typeof getActiveScheduleSlotId === 'function' ? await getActiveScheduleSlotId() : null;
  const slots = typeof getScheduleSlots === 'function' ? await getScheduleSlots() : [];
  const activeSlot = slots.find(slot => slot.id === activeSlotId) || null;

  const employees = Array.isArray(dataset.employees) ? dataset.employees : [];
  const dateCols = Array.isArray(dataset.dateCols) ? dataset.dateCols : [];
  const sites = extractSites(employees, dateCols);
  const uniqueSites = new Set(sites.map(s => s.siteId).filter(Boolean)).size;

  document.getElementById('summary-cards').innerHTML =
    makeCard('sticker-tl', 'Unique Sites', uniqueSites);

  window._scheduleDataset = {
    ...dataset,
    activeSlotId,
    activeSlotLabel: activeSlot?.label || '',
    employees,
    dateCols,
    updatedAt: dataset.updatedAt || dataset.importedAt || new Date().toISOString()
  };
  window._allSites = sites;
  window._allEmployees = employees;
  window._dateCols = dateCols;
  window._siteFilter = window._siteFilter || 'all';
  window._sitePage = 1;
  window._fileHandle = null;
  window._workbook = null;
  window._sheetName = '';

  if (typeof persistCurrentSiteJobs === 'function') {
    await persistCurrentSiteJobs(dataset.sourceName || 'IndexedDB schedule');
  }

  populateMonthFilter(dateCols);
  renderSites();
  renderScheduleTable(employees, dateCols);
  updateResumeVisibility();
  showDashboard(dataset);
}

function renderScheduleTable(employees, dateCols) {
  const table = document.getElementById('schedule-table');

  const weekSpans = [];
  let curKey = null, curStart = null, curSpan = 0;
  dateCols.forEach(dc => {
    const wk = getWeekKey(dc.date);
    if (wk !== curKey) {
      if (curKey !== null) weekSpans.push({ label: curStart, span: curSpan });
      curKey = wk;
      curStart = dc.date;
      curSpan = 1;
    } else {
      curSpan++;
    }
  });
  if (curKey !== null) weekSpans.push({ label: curStart, span: curSpan });

  let html = '<thead class="bg-gray-50 border-b border-gray-200">';
  html += '<tr class="bg-blue-50/60">';
  html += '<th class="sticky left-0 bg-blue-50 z-20 border-r border-gray-100 border-b border-blue-100 px-4 py-1.5 text-left text-xs font-bold text-blue-500 uppercase tracking-widest">Week</th>';
  weekSpans.forEach(ws => {
    html += `<th colspan="${ws.span}" class="text-center px-2 py-1.5 text-xs font-bold text-blue-600 border-b border-blue-100 border-l border-blue-100/60 uppercase tracking-wide">
      w/c ${fmtShort(ws.label)}
    </th>`;
  });
  html += '</tr>';

  html += '<tr>';
  html += '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 border-r border-gray-100">Employee</th>';
  dateCols.forEach((dc, i) => {
    const wk = getWeekKey(dc.date);
    const prevWk = i > 0 ? getWeekKey(dateCols[i - 1].date) : wk;
    const weekBorder = (wk !== prevWk) ? 'border-l-2 border-blue-200' : '';
    html += `<th class="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[160px] ${weekBorder}">
      <div class="font-bold text-gray-800">${dc.day}</div>
      <div class="text-gray-400 font-normal normal-case">${dc.date}</div>
    </th>`;
  });
  html += '</tr></thead><tbody class="divide-y divide-gray-50">';

  employees.forEach((emp, i) => {
    html += `<tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30 transition">`;
    html += `<td class="px-4 py-3 font-semibold text-gray-800 sticky left-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-100 z-10">${escapeHtml(emp.name)}</td>`;
    emp.days.forEach((d, j) => {
      const cat = categorise(d);
      const bc = badgeClass(cat);
      const display = d || '-';
      const wk = getWeekKey(dateCols[j].date);
      const prevWk = j > 0 ? getWeekKey(dateCols[j - 1].date) : wk;
      const weekBorder = (wk !== prevWk) ? 'border-l-2 border-blue-100' : '';
      html += `<td class="px-4 py-3 text-center ${weekBorder}">
        ${d ? `<span class="site-badge ${bc}">${escapeHtml(display)}</span>` : `<span class="text-gray-300 text-xs">-</span>`}
      </td>`;
    });
    html += '</tr>';
  });

  html += '</tbody>';
  table.innerHTML = html;
}

function getWeekKey(dateLabel) {
  const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const [d, m, y] = String(dateLabel || '').split(' ');
  const dt = new Date(Date.UTC(+y, months[m], +d));
  const dow = (dt.getUTCDay() + 6) % 7;
  const mon = new Date(dt);
  mon.setUTCDate(dt.getUTCDate() - dow);
  return mon.toISOString().slice(0, 10);
}

function fmtShort(dateLabel) {
  const [d, m] = String(dateLabel || '').split(' ');
  return `${d || ''} ${m || ''}`.trim();
}

function showDashboard(dataset) {
  const now = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('last-updated').textContent = `IndexedDB updated ${now}`;
  document.getElementById('loading').classList.add('hidden');
  const dash = document.getElementById('dashboard');
  dash.classList.remove('hidden');
  dash.style.display = '';

  if (typeof updateSidebarFileChip === 'function') {
    updateSidebarFileChip(window._scheduleDataset?.activeSlotLabel || dataset.sourceName || 'IndexedDB schedule');
  }

  if (typeof updateTopbarSource === 'function') {
    updateTopbarSource(window._scheduleDataset?.activeSlotLabel || 'No slot selected', dataset.sourceName || window._scheduleDataset?.activeSlotLabel || 'IndexedDB schedule');
  }
}

function pickFileWithInput() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx';
    inp.onchange = async () => {
      if (!inp.files[0]) {
        resolve(null);
        return;
      }
      resolve({ buffer: await inp.files[0].arrayBuffer(), name: inp.files[0].name });
    };
    inp.oncancel = () => resolve(null);
    inp.click();
    window.addEventListener('focus', function h() {
      window.removeEventListener('focus', h);
      setTimeout(() => { if (!inp.files[0]) resolve(null); }, 300);
    }, { once: true });
  });
}

function showLanding() {
  document.getElementById('landing').classList.remove('hidden');
  document.getElementById('loading').classList.add('hidden');
  const dash = document.getElementById('dashboard');
  dash.classList.add('hidden');
  dash.style.display = 'none';
  document.getElementById('error-banner').classList.add('hidden');
}

async function resumeFile() {
  await loadFile();
}

async function openImportSlotModal() {
  await refreshSlotUI();
  await populateImportTargetOptions();
  document.getElementById('import-slot-modal').style.display = 'flex';
  setTimeout(() => {
    const mode = getSelectedImportTargetMode();
    const focusEl = mode === 'new'
      ? document.getElementById('import-target-label')
      : document.getElementById('import-target-slot');
    focusEl?.focus();
  }, 50);
}

function closeImportSlotModal() {
  document.getElementById('import-slot-modal').style.display = 'none';
}

async function populateImportTargetOptions() {
  const slots = typeof getScheduleSlots === 'function' ? await getScheduleSlots() : [];
  const activeSlotId = typeof getActiveScheduleSlotId === 'function' ? await getActiveScheduleSlotId() : null;
  const existingRadio = document.getElementById('import-target-existing');
  const newRadio = document.getElementById('import-target-new');
  const select = document.getElementById('import-target-slot');
  const labelInput = document.getElementById('import-target-label');
  const error = document.getElementById('import-target-error');

  if (select) {
    select.innerHTML = slots.length
      ? slots.map(slot => `<option value="${escapeHtml(slot.id)}" ${slot.id === activeSlotId ? 'selected' : ''}>${escapeHtml(slot.label)}</option>`).join('')
      : '<option value="">Create a new slot first</option>';
    select.disabled = slots.length === 0;
  }

  if (existingRadio && newRadio) {
    existingRadio.disabled = slots.length === 0;
    existingRadio.checked = slots.length > 0;
    newRadio.checked = slots.length === 0;
  }

  if (labelInput && !labelInput.value.trim()) {
    labelInput.value = '';
  }

  if (error) {
    error.style.display = 'none';
    error.textContent = '';
  }

  updateImportTargetMode();
}

function getSelectedImportTargetMode() {
  return document.getElementById('import-target-new')?.checked ? 'new' : 'existing';
}

function updateImportTargetMode() {
  const mode = getSelectedImportTargetMode();
  const select = document.getElementById('import-target-slot');
  const labelInput = document.getElementById('import-target-label');

  if (select) select.disabled = mode !== 'existing' || !select.options.length || !select.value;
  if (labelInput) labelInput.disabled = mode !== 'new';
}

function showImportTargetError(message) {
  const error = document.getElementById('import-target-error');
  if (!error) return;
  error.textContent = message;
  error.style.display = 'block';
}

async function submitImportSlotModal() {
  const mode = getSelectedImportTargetMode();
  const slotId = document.getElementById('import-target-slot')?.value || '';
  const label = (document.getElementById('import-target-label')?.value || '').trim().replace(/\s+/g, ' ');

  if (mode === 'existing' && !slotId) {
    showImportTargetError('Choose an existing slot or create a new slot label.');
    return;
  }

  if (mode === 'new' && !label) {
    showImportTargetError('Enter a new slot label such as May 2026.');
    document.getElementById('import-target-label')?.focus();
    return;
  }

  closeImportSlotModal();
  await performImportExcelFile({ mode, slotId, label });
}

async function onSlotPickerChange(slotId) {
  if (!slotId) return;
  if (typeof setActiveScheduleSlotId === 'function') await setActiveScheduleSlotId(slotId);
  await loadFile(slotId);
}

async function refreshSlotUI() {
  const slots = typeof getScheduleSlots === 'function' ? await getScheduleSlots() : [];
  const activeSlotId = typeof getActiveScheduleSlotId === 'function' ? await getActiveScheduleSlotId() : null;
  const select = document.getElementById('slot-picker');
  const status = document.getElementById('slot-status');

  if (select) {
    select.innerHTML = slots.length
      ? slots.map(slot => `<option value="${escapeHtml(slot.id)}" ${slot.id === activeSlotId ? 'selected' : ''}>${escapeHtml(slot.label)}</option>`).join('')
      : '<option value="">No saved slots yet</option>';
    select.disabled = slots.length === 0;
  }

  if (status) {
    const activeSlot = slots.find(slot => slot.id === activeSlotId) || null;
    status.textContent = activeSlot
      ? `${activeSlot.label} · ${activeSlot.lastImportName || activeSlot.sourceName || 'No file imported yet'}`
      : 'No active import slot selected';
  }

  updateResumeVisibility(slots, activeSlotId);
}

function updateResumeVisibility(slotsArg, activeSlotIdArg) {
  const resumeBtn = document.getElementById('resume-btn');
  if (!resumeBtn) return;

  const slots = Array.isArray(slotsArg) ? slotsArg : [];
  const activeSlotId = activeSlotIdArg !== undefined ? activeSlotIdArg : (window._activeScheduleSlotId || window._scheduleDataset?.activeSlotId || null);
  const hasSlots = slots.length > 0 || !!activeSlotId;
  resumeBtn.style.display = hasSlots ? 'inline-flex' : 'none';
}

(async () => {
  await refreshSlotUI();
  const activeSlotId = typeof getActiveScheduleSlotId === 'function' ? await getActiveScheduleSlotId() : null;
  const saved = typeof getScheduleDataFromIDB === 'function' ? await getScheduleDataFromIDB(activeSlotId) : null;
  if (saved && activeSlotId) {
    await loadFile();
  } else {
    showLanding();
  }
})();
