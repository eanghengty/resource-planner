// ─── IndexedDB file handle persistence ────────────────────────────────────────
const _IDB_NAME = 'schedule-dash', _IDB_STORE = 'handles', _IDB_KEY = 'last';

function _openIDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(_IDB_NAME, 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore(_IDB_STORE);
    r.onsuccess = e => res(e.target.result);
    r.onerror  = e => rej(e.target.error);
  });
}

async function saveHandleToIDB(handle) {
  try { const db = await _openIDB(); db.transaction(_IDB_STORE,'readwrite').objectStore(_IDB_STORE).put(handle,_IDB_KEY); } catch(e){}
}

async function getHandleFromIDB() {
  try {
    const db = await _openIDB();
    return await new Promise((res,rej) => {
      const r = db.transaction(_IDB_STORE,'readonly').objectStore(_IDB_STORE).get(_IDB_KEY);
      r.onsuccess = e => res(e.target.result||null);
      r.onerror   = e => rej(e.target.error);
    });
  } catch(e) { return null; }
}

async function clearHandleFromIDB() {
  try { const db = await _openIDB(); db.transaction(_IDB_STORE,'readwrite').objectStore(_IDB_STORE).delete(_IDB_KEY); } catch(e){}
}
