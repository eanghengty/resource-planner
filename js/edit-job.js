// ─── Edit Job Name Modal ──────────────────────────────────────────────────────
function openEditJobModal(displayKey) {
  window._editJobOldName = displayKey;
  document.getElementById('edit-job-old').textContent = displayKey;

  const inp = document.getElementById('edit-job-input');
  inp.value = displayKey;

  const site    = (window._allSites || []).find(s => s.display === displayKey);
  const warning = document.getElementById('edit-job-slash-warning');
  if (site?.slashSiblings?.length) {
    warning.style.display = 'block';
    warning.textContent   = `⚠ This site shares an Excel cell with: ${site.slashSiblings.join(', ')}. Editing the name will update the shared cell — both sites in that row will reflect your change.`;
  } else {
    warning.style.display = 'none';
  }

  document.getElementById('edit-job-modal').style.display = 'flex';
  setTimeout(() => { inp.select(); inp.focus(); }, 50);
}

function closeEditJobModal() {
  document.getElementById('edit-job-modal').style.display = 'none';
}

async function saveEditJobName() {
  const oldName = window._editJobOldName;
  const newName = (document.getElementById('edit-job-input').value || '').trim();
  if (!newName || newName === oldName) { closeEditJobModal(); return; }

  // Patch Excel workbook in-memory
  const wb = window._workbook;
  const ws = wb && wb.Sheets[window._sheetName];
  if (wb && ws) {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell || cell.t !== 's' || !cell.v) continue;

        const raw  = cell.v;
        const base = raw.replace(/\(.*?\)/g, '').replace(/\n.*/g, '').trim();

        const expanded = expandSlashSites(base);
        const matchIdx = expanded.findIndex(e => e.display === oldName);
        const isRawMatch = (matchIdx === -1 && base === oldName);
        if (matchIdx === -1 && !isRawMatch) continue;

        let newBase;
        if (isRawMatch) {
          newBase = newName;
        } else {
          const slashM = base.match(/^((?:[A-Z]\d{2,3}\s*\/\s*)+[A-Z]\d{2,3})\s*(.*)/i);
          if (slashM && expanded.length >= 2) {
            const ids       = slashM[1].split(/\s*\/\s*/).map(s => s.trim().toUpperCase());
            const oldDesc   = slashM[2].trim();
            const newId     = getSiteId(newName) || '';
            const newDesc   = newId ? newName.slice(newId.length).trim() : newName;
            ids[matchIdx]   = newId || ids[matchIdx];
            const finalDesc = newDesc || oldDesc;
            newBase = ids.join('/') + (finalDesc ? ' ' + finalDesc : '');
          } else {
            newBase = newName;
          }
        }

        cell.v = raw.replace(base, () => newBase);
        cell.w = cell.v;
      }
    }

    // Write back to file on disk
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const handle = window._fileHandle;
    if (handle) {
      try {
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          const req = await handle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') throw new Error('Write permission not granted.');
        }
        const writable = await handle.createWritable();
        await writable.write(new Uint8Array(wbOut));
        await writable.close();
        showToast('✓ Saved to ' + handle.name);
      } catch (err) {
        showToast('⚠ Save failed: ' + err.message, true);
      }
    } else {
      // Fallback: trigger download
      const blob = new Blob([wbOut], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = 'test.xlsx';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('↓ Downloaded (open via Refresh to enable direct save)');
    }
  }

  // Re-derive sites from the patched workbook
  const dc = window._dateCols || [];
  if (ws && dc.length) {
    const raw2 = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const emps = [];
    for (let r = 2; r < raw2.length; r++) {
      const row = raw2[r];
      const name = String(row[0] || '').trim();
      if (!name) continue;
      emps.push({ name, days: dc.map(col => String(row[col.idx] || '').trim()) });
    }
    window._allEmployees = emps;
    window._allSites = extractSites(emps, dc);
  }

  closeEditJobModal();
  renderSites();
}
