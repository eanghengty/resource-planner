// IndexedDB persistence for the picked workbook handle and app view data.
const _IDB_NAME = 'schedule-dash';
const _IDB_STORE = 'handles';
const _IDB_APP_STORE = 'appdata';
const _IDB_KEY = 'last';
const _IDB_SITE_META_KEY = 'site-meta-v1';
const _IDB_SITE_JOBS_KEY = 'site-jobs-v1';
const _IDB_SCHEDULE_KEY = 'schedule-data-v1';

function _openIDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(_IDB_NAME, 2);
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
  try { await _putIDB(_IDB_APP_STORE, _IDB_SITE_META_KEY, state); } catch(e) {}
}

async function getSiteMetaFromIDB() {
  try { return await _getIDB(_IDB_APP_STORE, _IDB_SITE_META_KEY); } catch(e) { return null; }
}

async function saveSiteJobsToIDB(sites, sourceName = '') {
  try {
    await _putIDB(_IDB_APP_STORE, _IDB_SITE_JOBS_KEY, {
      sourceName,
      savedAt: new Date().toISOString(),
      rows: Array.isArray(sites) ? sites : []
    });
  } catch(e) {}
}

async function getSiteJobsFromIDB() {
  try { return await _getIDB(_IDB_APP_STORE, _IDB_SITE_JOBS_KEY); } catch(e) { return null; }
}

async function saveScheduleDataToIDB(data) {
  try { await _putIDB(_IDB_APP_STORE, _IDB_SCHEDULE_KEY, data); } catch(e) {}
}

async function getScheduleDataFromIDB() {
  try { return await _getIDB(_IDB_APP_STORE, _IDB_SCHEDULE_KEY); } catch(e) { return null; }
}

async function clearScheduleDataFromIDB() {
  try {
    const db = await _openIDB();
    db.transaction(_IDB_APP_STORE, 'readwrite').objectStore(_IDB_APP_STORE).delete(_IDB_SCHEDULE_KEY);
  } catch(e) {}
}
