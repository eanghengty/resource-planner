// ─── Main file loader ─────────────────────────────────────────────────────────
async function loadFile() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('error-banner').classList.add('hidden');

  try {
    let buf;

    // ── File System Access API: pick file and keep write handle ──────────────
    if (window.showOpenFilePicker) {
      let handle = window._fileHandle;
      if (!handle) {
        let picked;
        try {
          [picked] = await window.showOpenFilePicker({
            types: [{ description: 'Excel file', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
            multiple: false,
          });
        } catch (e) {
          showLanding();
          return;
        }
        const perm = await picked.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          showToast('⚠ Write permission denied — edits cannot be saved to this file.', true);
        }
        handle = picked;
        window._fileHandle = handle;
        saveHandleToIDB(handle);
      }
      const file = await handle.getFile();
      buf = await file.arrayBuffer();
    } else {
      buf = await pickFileWithInput();
      if (!buf) { showLanding(); return; }
    }

    // Do NOT use cellDates:true — it creates local-time Date objects that shift
    // by the user's UTC offset. Read raw serial numbers and convert manually.
    const wb   = XLSX.read(buf, { type: 'array', cellDates: false });

    const sheetName = wb.SheetNames[0];
    const ws        = wb.Sheets[sheetName];
    window._workbook  = wb;
    window._sheetName = sheetName;

    // ── Expand merged cells so every cell in a merge has the origin value ────
    if (ws['!merges']) {
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

    // ── Excel serial → "07 Apr 2026" date label ───────────────────────────────
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function excelSerialToLabel(serial) {
      const ms = (serial - 25569) * 86400 * 1000;
      const d  = new Date(ms);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const mon = MONTHS[d.getUTCMonth()];
      const yr  = d.getUTCFullYear();
      return `${day} ${mon} ${yr}`;
    }

    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // ── Scan worksheet to find max col/row ────────────────────────────────────
    let maxCol = 0, maxRow = 0;
    Object.keys(ws).forEach(key => {
      if (key.startsWith('!')) return;
      const pos = XLSX.utils.decode_cell(key);
      if (pos.c > maxCol) maxCol = pos.c;
      if (pos.r > maxRow) maxRow = pos.r;
    });

    // ── Parse date header columns (column 2+) ─────────────────────────────────
    const dateCols = [];
    for (let c = 2; c <= maxCol; c++) {
      const addr     = XLSX.utils.encode_cell({ r: 0, c });
      const cell     = ws[addr];
      let dateLabel  = '';
      if (cell && cell.t === 'n') {
        dateLabel = excelSerialToLabel(cell.v);
      } else {
        dateLabel = cell ? String(cell.v || '') : '';
      }
      const dayCell  = ws[XLSX.utils.encode_cell({ r: 1, c })];
      const dayLabel = dayCell ? String(dayCell.v || '') : '';
      if (!dateLabel && !dayLabel) continue;
      dateCols.push({ idx: c, date: dateLabel, day: dayLabel });
    }

    // ── Parse employee rows ───────────────────────────────────────────────────
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

    // ── Compute stats ─────────────────────────────────────────────────────────
    const sites       = extractSites(employees, dateCols);
    const uniqueSites = new Set(sites.map(s => s.siteId).filter(Boolean)).size;

    // ── Render summary cards ──────────────────────────────────────────────────
    document.getElementById('summary-cards').innerHTML =
      makeCard('sticker-tl', 'Unique Sites', uniqueSites);

    // ── Store globally for modal / edit-job use ───────────────────────────────
    window._allSites     = sites;
    window._allEmployees = employees;
    window._dateCols     = dateCols;
    window._siteFilter   = 'all';
    window._sitePage     = 1;
    populateMonthFilter(dateCols);
    renderSites();

    // ── Render schedule table ─────────────────────────────────────────────────
    const table = document.getElementById('schedule-table');

    function getWeekKey(dateLabel) {
      const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      const [d, m, y] = dateLabel.split(' ');
      const dt = new Date(Date.UTC(+y, months[m], +d));
      const dow = (dt.getUTCDay() + 6) % 7;
      const mon = new Date(dt); mon.setUTCDate(dt.getUTCDate() - dow);
      return mon.toISOString().slice(0, 10);
    }

    function fmtShort(dateLabel) {
      const [d, m] = dateLabel.split(' ');
      return `${d} ${m}`;
    }

    // Build week spans for the week-label header row
    const weekSpans = [];
    let curKey = null, curStart = null, curSpan = 0;
    dateCols.forEach((dc) => {
      const wk = getWeekKey(dc.date);
      if (wk !== curKey) {
        if (curKey !== null) weekSpans.push({ label: curStart, span: curSpan });
        curKey = wk; curStart = dc.date; curSpan = 1;
      } else { curSpan++; }
    });
    if (curKey !== null) weekSpans.push({ label: curStart, span: curSpan });

    let html = '<thead class="bg-gray-50 border-b border-gray-200">';

    // Week-label row
    html += '<tr class="bg-blue-50/60">';
    html += '<th class="sticky left-0 bg-blue-50 z-20 border-r border-gray-100 border-b border-blue-100 px-4 py-1.5 text-left text-xs font-bold text-blue-500 uppercase tracking-widest">Week</th>';
    weekSpans.forEach(ws => {
      html += `<th colspan="${ws.span}" class="text-center px-2 py-1.5 text-xs font-bold text-blue-600 border-b border-blue-100 border-l border-blue-100/60 uppercase tracking-wide">
        w/c ${fmtShort(ws.label)}
      </th>`;
    });
    html += '</tr>';

    // Day/date header row
    html += '<tr>';
    html += '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 border-r border-gray-100">Employee</th>';
    dateCols.forEach((dc, i) => {
      const wk = getWeekKey(dc.date);
      const prevWk = i > 0 ? getWeekKey(dateCols[i-1].date) : wk;
      const weekBorder = (wk !== prevWk) ? 'border-l-2 border-blue-200' : '';
      html += `<th class="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[160px] ${weekBorder}">
        <div class="font-bold text-gray-800">${dc.day}</div>
        <div class="text-gray-400 font-normal normal-case">${dc.date}</div>
      </th>`;
    });
    html += '</tr></thead><tbody class="divide-y divide-gray-50">';

    employees.forEach((emp, i) => {
      html += `<tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30 transition">`;
      html += `<td class="px-4 py-3 font-semibold text-gray-800 sticky left-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-100 z-10">${emp.name}</td>`;
      emp.days.forEach((d, j) => {
        const cat = categorise(d);
        const bc  = badgeClass(cat);
        const display = d || '—';
        const wk = getWeekKey(dateCols[j].date);
        const prevWk = j > 0 ? getWeekKey(dateCols[j-1].date) : wk;
        const weekBorder = (wk !== prevWk) ? 'border-l-2 border-blue-100' : '';
        html += `<td class="px-4 py-3 text-center ${weekBorder}">
          ${d ? `<span class="site-badge ${bc}">${display}</span>` : `<span class="text-gray-300 text-xs">—</span>`}
        </td>`;
      });
      html += '</tr>';
    });

    html += '</tbody>';
    table.innerHTML = html;

    // ── Show dashboard ────────────────────────────────────────────────────────
    const now = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-updated').textContent = `Updated ${now}`;
    document.getElementById('loading').classList.add('hidden');
    const dash = document.getElementById('dashboard');
    dash.classList.remove('hidden');
    dash.style.display = '';

    // Update sidebar file chip
    const fname = window._fileHandle?.name || 'test.xlsx';
    if (typeof updateSidebarFileChip === 'function') updateSidebarFileChip(fname);

  } catch (err) {
    showLanding();
    document.getElementById('error-banner').textContent = '⚠ ' + err.message;
    document.getElementById('error-banner').classList.remove('hidden');
    console.error(err);
  }
}

// ─── Fallback file picker (non-Chrome browsers) ───────────────────────────────
function pickFileWithInput() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx';
    inp.onchange = async () => {
      if (!inp.files[0]) { resolve(null); return; }
      resolve(await inp.files[0].arrayBuffer());
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

// ─── Resume stored file handle ────────────────────────────────────────────────
async function resumeFile() {
  const handle = await getHandleFromIDB();
  if (!handle) { loadFile(); return; }
  const perm = await handle.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    showToast('⚠ Permission denied — please open the file manually.', true);
    showLanding();
    return;
  }
  window._fileHandle = handle;
  loadFile();
}

// ─── Auto-restore on page load ────────────────────────────────────────────────
(async () => {
  if (!window.showOpenFilePicker) { showLanding(); return; }
  const handle = await getHandleFromIDB();
  if (!handle) { showLanding(); return; }
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') {
    window._fileHandle = handle;
    loadFile();
  } else {
    showLanding();
    document.getElementById('resume-btn').classList.remove('hidden');
  }
})();
