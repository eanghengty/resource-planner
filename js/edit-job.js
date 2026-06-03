// Edit Job Name Modal
function openEditJobModal(displayKey) {
  window._editJobOldName = displayKey;
  document.getElementById('edit-job-old').textContent = displayKey;

  const inp = document.getElementById('edit-job-input');
  inp.value = displayKey;

  const site = (window._allSites || []).find(s => s.display === displayKey);
  const warning = document.getElementById('edit-job-slash-warning');
  if (site?.slashSiblings?.length) {
    warning.style.display = 'block';
    warning.textContent = `This site shares one imported schedule cell with: ${site.slashSiblings.join(', ')}. Editing the name updates the saved IndexedDB row for that shared cell.`;
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
  if (!newName || newName === oldName) {
    closeEditJobModal();
    return;
  }

  const dataset = window._scheduleDataset || (typeof getScheduleDataFromIDB === 'function' ? await getScheduleDataFromIDB() : null);
  if (!dataset || !Array.isArray(dataset.employees)) {
    showToast('No IndexedDB schedule data is loaded.', true);
    return;
  }

  let changed = false;
  const employees = dataset.employees.map(emp => ({
    ...emp,
    days: (emp.days || []).map(rawValue => {
      const updated = renameImportedJobCell(rawValue, oldName, newName);
      if (updated !== rawValue) changed = true;
      return updated;
    })
  }));

  if (!changed) {
    showToast('No matching IndexedDB job row found.', true);
    return;
  }

  const nextDataset = {
    ...dataset,
    employees,
    updatedAt: new Date().toISOString()
  };

  if (typeof saveScheduleDataToIDB === 'function') await saveScheduleDataToIDB(nextDataset);
  closeEditJobModal();

  if (typeof renderDashboardFromDataset === 'function') {
    await renderDashboardFromDataset(nextDataset);
  }

  showToast('Saved job name to IndexedDB');
}

function renameImportedJobCell(rawValue, oldName, newName) {
  if (!rawValue) return rawValue;

  const raw = String(rawValue);
  const base = raw.replace(/\(.*?\)/g, '').replace(/\n.*/g, '').trim();
  const expanded = expandSlashSites(base);
  const matchIdx = expanded.findIndex(e => e.display === oldName);
  const isRawMatch = matchIdx === -1 && base === oldName;
  if (matchIdx === -1 && !isRawMatch) return rawValue;

  let newBase;
  if (isRawMatch) {
    newBase = newName;
  } else {
    const slashM = base.match(/^((?:[A-Z]\d{2,3}\s*\/\s*)+[A-Z]\d{2,3})\s*(.*)/i);
    if (slashM && expanded.length >= 2) {
      const ids = slashM[1].split(/\s*\/\s*/).map(s => s.trim().toUpperCase());
      const oldDesc = slashM[2].trim();
      const newId = getSiteId(newName) || '';
      const newDesc = newId ? newName.slice(newId.length).trim() : newName;
      ids[matchIdx] = newId || ids[matchIdx];
      const finalDesc = newDesc || oldDesc;
      newBase = ids.join('/') + (finalDesc ? ' ' + finalDesc : '');
    } else {
      newBase = newName;
    }
  }

  return raw.replace(base, () => newBase);
}
