// IndexedDB persistence for the picked workbook handle and app view data.
const _IDB_NAME = 'schedule-dash';
const _IDB_STORE = 'handles';
const _IDB_APP_STORE = 'appdata';
const _IDB_KEY = 'last';
const _IDB_SLOTS_KEY = 'schedule-slots-v1';
const _IDB_SITE_META_KEY = 'site-meta-v1';
const _IDB_SITE_JOBS_KEY = 'site-jobs-v1';
const _IDB_SCHEDULE_KEY = 'schedule-data-v1';

function _openIDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(_IDB_NAME, 3);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_IDB_STORE)) db.createObjectStore(_IDB_STORE);
      if (!db.objectStoreNames.contains(_IDB_APP_STORE)) db.createObjectStore(_IDB_APP_STORE);
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror = e => rej(e.target.error);
  });
}

async function _putIDB(storeName, key, value) {
  const db = await _openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => res(true);
    tx.onerror = e => rej(e.target.error);
  });
}

async function _getIDB(storeName, key) {
  const db = await _openIDB();
  return await new Promise((res, rej) => {
    const r = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    r.onsuccess = e => res(e.target.result || null);
    r.onerror = e => rej(e.target.error);
  });
}

function _makeSlotScopedKey(prefix, slotId) {
  return `${prefix}:${slotId}`;
}

function _createSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function _normalizeSlotRecord(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const now = new Date().toISOString();
  return {
    id: String(safe.id || _createSlotId()),
    label: String(safe.label || safe.sourceName || 'Imported schedule').trim() || 'Imported schedule',
    sourceName: String(safe.sourceName || '').trim(),
    createdAt: String(safe.createdAt || now),
    updatedAt: String(safe.updatedAt || safe.createdAt || now),
    lastImportName: String(safe.lastImportName || safe.sourceName || '').trim()
  };
}

function _normalizeSlotsState(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const slots = Array.isArray(safe.slots) ? safe.slots.map(_normalizeSlotRecord) : [];
  const activeSlotId = slots.some(slot => slot.id === safe.activeSlotId)
    ? safe.activeSlotId
    : (slots[0]?.id || null);
  return { activeSlotId, slots };
}

async function _getLegacySiteMetaInput() {
  const legacySiteMeta = await _getIDB(_IDB_APP_STORE, _IDB_SITE_META_KEY);
  if (legacySiteMeta) return legacySiteMeta;

  try {
    return JSON.parse(localStorage.getItem('schedulehq-site-meta-v1')) || null;
  } catch (e) {
    return null;
  }
}

async function _copyLegacySiteMetaIntoSlot(slotId, { overwrite = false } = {}) {
  if (!slotId) return false;

  const slotMetaKey = _makeSlotScopedKey(_IDB_SITE_META_KEY, slotId);
  if (!overwrite) {
    const existingSlotMeta = await _getIDB(_IDB_APP_STORE, slotMetaKey);
    if (existingSlotMeta) return false;
  }

  const legacySiteMeta = await _getLegacySiteMetaInput();
  if (!legacySiteMeta) return false;

  await _putIDB(_IDB_APP_STORE, slotMetaKey, legacySiteMeta);
  return true;
}

async function _migrateLegacySlotState() {
  const legacySchedule = await _getIDB(_IDB_APP_STORE, _IDB_SCHEDULE_KEY);
  if (!legacySchedule || !Array.isArray(legacySchedule.employees) || !Array.isArray(legacySchedule.dateCols)) {
    return { activeSlotId: null, slots: [] };
  }

  const slotId = _createSlotId();
  const timestamp = legacySchedule.updatedAt || legacySchedule.importedAt || new Date().toISOString();
  const slot = _normalizeSlotRecord({
    id: slotId,
    label: legacySchedule.sourceName || 'Imported schedule',
    sourceName: legacySchedule.sourceName || '',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastImportName: legacySchedule.sourceName || ''
  });
  const nextState = { activeSlotId: slot.id, slots: [slot] };

  await _putIDB(_IDB_APP_STORE, _IDB_SLOTS_KEY, nextState);
  await _putIDB(_IDB_APP_STORE, _makeSlotScopedKey(_IDB_SCHEDULE_KEY, slot.id), legacySchedule);
  await _copyLegacySiteMetaIntoSlot(slot.id, { overwrite: true });

  const legacySiteJobs = await _getIDB(_IDB_APP_STORE, _IDB_SITE_JOBS_KEY);
  if (legacySiteJobs) {
    await _putIDB(_IDB_APP_STORE, _makeSlotScopedKey(_IDB_SITE_JOBS_KEY, slot.id), legacySiteJobs);
  }

  return nextState;
}

async function getScheduleSlotsState() {
  try {
    const saved = await _getIDB(_IDB_APP_STORE, _IDB_SLOTS_KEY);
    if (saved) return _normalizeSlotsState(saved);
    return await _migrateLegacySlotState();
  } catch (e) {
    return { activeSlotId: null, slots: [] };
  }
}

async function saveScheduleSlotsState(state) {
  const normalized = _normalizeSlotsState(state);
  try {
    await _putIDB(_IDB_APP_STORE, _IDB_SLOTS_KEY, normalized);
  } catch (e) {}
  return normalized;
}

async function getScheduleSlots() {
  const state = await getScheduleSlotsState();
  return state.slots;
}

async function getActiveScheduleSlotId() {
  const state = await getScheduleSlotsState();
  window._activeScheduleSlotId = state.activeSlotId || null;
  return window._activeScheduleSlotId;
}

async function setActiveScheduleSlotId(slotId) {
  const state = await getScheduleSlotsState();
  if (!slotId || !state.slots.some(slot => slot.id === slotId)) return state;
  const nextState = await saveScheduleSlotsState({ ...state, activeSlotId: slotId });
  window._activeScheduleSlotId = nextState.activeSlotId || null;
  return nextState;
}

async function createScheduleSlot(slotInput) {
  const state = await getScheduleSlotsState();
  const slot = _normalizeSlotRecord(slotInput);
  const nextState = await saveScheduleSlotsState({
    activeSlotId: slot.id,
    slots: [...state.slots.filter(existing => existing.id !== slot.id), slot]
  });
  if (state.slots.length === 0) {
    await _copyLegacySiteMetaIntoSlot(slot.id);
  }
  window._activeScheduleSlotId = slot.id;
  return slot;
}

async function updateScheduleSlot(slotId, patch = {}) {
  const state = await getScheduleSlotsState();
  const existing = state.slots.find(slot => slot.id === slotId);
  if (!existing) return null;
  const slot = _normalizeSlotRecord({ ...existing, ...patch, id: slotId });
  await saveScheduleSlotsState({
    activeSlotId: state.activeSlotId === slotId ? slotId : state.activeSlotId,
    slots: state.slots.map(entry => entry.id === slotId ? slot : entry)
  });
  return slot;
}

async function saveHandleToIDB(handle) {
  try { await _putIDB(_IDB_STORE, _IDB_KEY, handle); } catch(e) {}
}

async function getHandleFromIDB() {
  try { return await _getIDB(_IDB_STORE, _IDB_KEY); } catch(e) { return null; }
}

async function clearHandleFromIDB() {
  try {
    const db = await _openIDB();
    db.transaction(_IDB_STORE, 'readwrite').objectStore(_IDB_STORE).delete(_IDB_KEY);
  } catch(e) {}
}

async function saveSiteMetaToIDB(state) {
  try {
    const slotId = await getActiveScheduleSlotId();
    if (!slotId) return;
    await _putIDB(_IDB_APP_STORE, _makeSlotScopedKey(_IDB_SITE_META_KEY, slotId), state);
  } catch(e) {}
}

async function getSiteMetaFromIDB() {
  try {
    const slotId = await getActiveScheduleSlotId();
    if (!slotId) return null;
    return await _getIDB(_IDB_APP_STORE, _makeSlotScopedKey(_IDB_SITE_META_KEY, slotId));
  } catch(e) { return null; }
}

async function saveSiteJobsToIDB(sites, sourceName = '') {
  try {
    const slotId = await getActiveScheduleSlotId();
    if (!slotId) return;
    await _putIDB(_IDB_APP_STORE, _makeSlotScopedKey(_IDB_SITE_JOBS_KEY, slotId), {
      sourceName,
      savedAt: new Date().toISOString(),
      rows: Array.isArray(sites) ? sites : []
    });
  } catch(e) {}
}

async function getSiteJobsFromIDB() {
  try {
    const slotId = await getActiveScheduleSlotId();
    if (!slotId) return null;
    return await _getIDB(_IDB_APP_STORE, _makeSlotScopedKey(_IDB_SITE_JOBS_KEY, slotId));
  } catch(e) { return null; }
}

async function saveScheduleDataToIDB(data) {
  try {
    const slotId = await getActiveScheduleSlotId();
    if (!slotId) return;
    await _putIDB(_IDB_APP_STORE, _makeSlotScopedKey(_IDB_SCHEDULE_KEY, slotId), data);
  } catch(e) {}
}

async function getScheduleDataFromIDB(slotId = null) {
  try {
    const targetSlotId = slotId || await getActiveScheduleSlotId();
    if (!targetSlotId) return null;
    return await _getIDB(_IDB_APP_STORE, _makeSlotScopedKey(_IDB_SCHEDULE_KEY, targetSlotId));
  } catch(e) { return null; }
}

async function clearScheduleDataFromIDB() {
  try {
    const db = await _openIDB();
    const slotId = await getActiveScheduleSlotId();
    if (!slotId) return;
    db.transaction(_IDB_APP_STORE, 'readwrite').objectStore(_IDB_APP_STORE).delete(_makeSlotScopedKey(_IDB_SCHEDULE_KEY, slotId));
  } catch(e) {}
}
