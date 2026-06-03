# Resource Planner Agent Notes

## Current Model

- The app is a static browser dashboard launched by `launch_dashboard.bat` on `http://localhost:8089/dashboard.html`.
- Excel files are import-only. The browser source of truth is IndexedDB after import.
- Schedule imports are slot-scoped. Each month/file should live in its own slot, and views/filters/summaries/edits should operate only on the active slot.

## IndexedDB Keys

- Database: `schedule-dash`.
- Object store: `appdata`.
- Slot registry: `schedule-slots-v1`.
- Active slot state shape: `{ activeSlotId, slots: [{ id, label, sourceName, createdAt, updatedAt, lastImportName }] }`.
- Slot schedule data: `schedule-data-v1:<slotId>`.
- Slot Site Setup metadata: `site-meta-v1:<slotId>`.
- Slot Sites & Jobs snapshot: `site-jobs-v1:<slotId>`.
- Legacy inputs only: unscoped `schedule-data-v1`, `site-meta-v1`, and `site-jobs-v1`.

## Migration Rules

- On upgrade, if legacy `schedule-data-v1` exists and no slot registry exists, create the first slot from it.
- Copy legacy `site-meta-v1` into that migrated slot so flags, tags, `isMain`, and rates survive.
- Copy legacy `site-jobs-v1` into the migrated slot snapshot.
- If there is no legacy schedule and the first user action is a first import, seed that first created slot with legacy global Site Setup metadata once.
- After creation or migration, slot metadata must diverge independently. Do not keep reading global `site-meta-v1` as live data.

## Import Flow

- `Import Excel` opens a required import target modal before the file picker.
- The user must choose either an existing slot or a new slot label such as `May 2026`, `June 2026`, or `July 2026`.
- Existing-slot imports overwrite only that slot's schedule data and preserve that slot's scoped Site Setup metadata.
- New-slot imports create a new slot and save schedule data under that new slot.
- The loader script is cache-busted in `dashboard.html`; bump its query string after behavior changes.

## Active Slot Behavior

- The sidebar `slot-picker` is the active dashboard slot selector.
- Switching the active slot reloads schedule data from `schedule-data-v1:<slotId>`.
- Site Setup metadata, flag/tag filters, flag-rate cost summary, Sites & Jobs snapshots, and edit-job saves must use the active slot only.
- `window._activeScheduleSlotId` and `window._scheduleDataset.activeSlotId` are used by UI helpers, but IndexedDB helpers should resolve the active slot through `getActiveScheduleSlotId()`.

## Files To Check For Slot Work

- `js/idb.js`: slot registry, scoped key helpers, migration, schedule/site-meta/site-jobs persistence.
- `js/loader.js`: import target modal flow, active slot loading, dashboard render setup.
- `js/site-meta.js`: scoped Site Setup cache and save/load behavior.
- `js/sites.js`: Sites & Jobs rendering and `persistCurrentSiteJobs()`.
- `js/edit-job.js`: saves renamed job cells back into the active slot schedule.
- `dashboard.html`: active slot selector, import target modal, script cache-busting.

## Verification

- Run a quick JS parse check after edits:

```powershell
@'
const fs = require('fs');
const files = ['js/idb.js','js/loader.js','js/site-meta.js','js/sites.js','js/edit-job.js','js/filters.js','js/utils.js'];
for (const file of files) new Function(fs.readFileSync(file, 'utf8'));
console.log('OK');
'@ | node
```

- Browser behavior is the real acceptance check for import target selection, slot switching, and IndexedDB persistence.
