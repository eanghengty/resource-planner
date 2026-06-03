# Team Schedule Dashboard

A local, browser-based dashboard that reads a team schedule from an Excel (`.xlsx`) file and displays it as a live, interactive web app — no server, no database, no internet required (after first load).

---

## Screenshots

| Landing | Dashboard |
|---------|-----------|
| Open the file picker to get started | Sites panel, stats cards, and weekly schedule table |

---

## Features

Current data model: Excel is import-only. Once a workbook is imported, the schedule, Sites & Jobs rows, and job-name edits are saved in IndexedDB and the app no longer writes changes back to the Excel file.

- **Live Excel reading** — opens your `.xlsx` directly in the browser; no upload, no copy
- **IndexedDB editing** — renaming a job saves instantly to the browser database and does not modify the Excel file
- **Auto-resume** — remembers the last opened file via IndexedDB; reopens automatically on refresh
- **Unique Sites card** — shows the count of distinct site IDs (e.g. `E07`) active within the current filter window; updates live when the date range or month filter changes
- **Sites & Jobs panel**
  - Search by name
  - Filter by All / Multi-day / Single-day
  - Sort by name, start date, or duration
  - Group by Site ID, Start Date, or Status
  - Filter visible sites by saved Flag and Tag values
  - Collapsible groups with pagination (20 groups per page)
  - Gap detection — flags non-consecutive date ranges
  - Edit job name inline and save back to IndexedDB
  - Site Setup saves browser-local main-site, flag, rate, and tag metadata per site ID in IndexedDB
  - Site/job row snapshots are persisted in IndexedDB with Site ID, Job Name, Flag, Tags, Total Hours, Start, and End fields
  - **Group by Start Date** — date groups are scoped to the active filter window; each group header shows site entry count and unique site ID count; the Start column for each row reflects the group's date, not the site's overall first date
  - "X sites found" label and the Unique Sites card always show the same count, computed from the same filtered list
- **Draft Email to Outlook** — each date group header (Group by Start Date mode) has a **Draft Email** button that generates a `.eml` file; double-clicking it opens Outlook 2021 as a new compose window with To, CC, Subject, and a formatted HTML table pre-filled — no manual pasting needed
- **Email Recipients config** — a **Recipients** button in the toolbar opens a modal to manage saved To and CC addresses (stored in browser localStorage); these auto-populate every drafted email
- **Site detail modal** — click any site to see which employees are assigned per day, with an option to hide inactive days
- **Weekly schedule table** — full roster grid with colour-coded badges and week-grouping headers
- **Month filter** — show only selected months
- **Date range filter** — narrow to any custom date window; all counts update to reflect only the selected range
- **Dark sidebar UI** — inspired by modern SaaS dashboards

---

## Draft Email to Outlook

When **Group by Start Date** is active, each date group header shows a **Draft Email** button.

### How it works

1. Click **Draft Email** on any date group header.
2. A `.eml` file is downloaded (e.g. `Site_Schedule_13_Apr_2026.eml`).
3. Double-click the file in Explorer — Outlook 2021 opens a new compose window with:
   - **To / CC** pre-filled from your saved recipients
   - **Subject** pre-filled: `Site Schedule — 13 Apr 2026`
   - **Body** containing a styled HTML table (Site ID, Job Name, Start, End, Days)

The `.eml` file uses the `X-Unsent: 1` MIME header, which tells Outlook to treat it as an unsent draft rather than a received message.

### Managing recipients

Click **Recipients** in the toolbar to open the config modal. Add or remove To and CC email addresses; they are saved automatically in `localStorage` and linked to every future Draft Email click.

---

## Excel File Format

The dashboard expects your `.xlsx` to follow this layout:

| Row | Column A | Column B | Column C+ |
|-----|----------|----------|-----------|
| 1 | *(blank)* | *(blank)* | Date (e.g. `07 Apr 2026`) |
| 2 | *(blank)* | *(blank)* | Day name (e.g. `Mon`) |
| 3+ | Employee name | *(unused)* | Assignment text per day |

- **Columns C onward** are date columns. Each column represents one working day.
- **Rows 3 onward** are employee rows. Column A holds the employee's name.
- **Cell values** are free text (e.g. `R08 Cable Run`, `Standby`, `Public Holiday`, `L2 Training`).
- Cells with **merged headers** are supported — merged cells are expanded automatically.
- **Slash-separated site IDs** (e.g. `E17/E14 Cable Run`) are split into individual sites.

### Badge colour rules

| Category | Triggered when cell contains |
|----------|------------------------------|
| 🟡 Standby | `standby` |
| 🟢 Holiday | `public holiday` or `holiday` |
| 🔵 Training / Travel | `training`, `travel`, or `trianing` (typo-safe) |
| 🟩 Site Work | anything else with a valid site ID |
| ⬜ Empty | blank cell |

---

## Getting Started

### Requirements

- **Python 3** (recommended) **or Node.js** installed on your machine
- A modern browser (Chrome 86+ recommended for full read/write support)
- **Outlook 2021** set as the default mail client (for Draft Email feature)

### Run

Double-click **`launch_dashboard.bat`**.

This starts a local web server on port `8089` and opens `http://localhost:8089/dashboard.html` in your default browser automatically.

If Python is not found, it falls back to Node.js `http-server`.

```
launch_dashboard.bat
```

> **Why a local server?** The File System Access API and ES modules require an `http://` or `https://` origin. Opening `dashboard.html` directly as a `file://` URL will not work.

---

## Project Structure

```
Convert to HTML/
├── dashboard.html        # App shell — HTML structure only
├── launch_dashboard.bat  # One-click launcher (Python or Node)
├── test.xlsx             # Sample schedule file
│
├── css/
│   └── dashboard.css     # All styles (layout, sidebar, cards, modals)
│
└── js/
    ├── utils.js          # Pure helpers: categorise, getSiteId, expandSlashSites,
    │                     #   dateLabelToISO, showToast, makeCard
    ├── idb.js            # IndexedDB file-handle persistence
    ├── filters.js        # Month filter, date range filter, activeDataCols()
    ├── sites.js          # Sites panel: extractSites, renderSites, groups,
    │                     #   pagination, collapse, sort, groupBy;
    │                     #   renderSites() updates both "sites found" label and
    │                     #   the Unique Sites card from a single computed value
    ├── modal.js          # Site detail modal + Escape key handler
    ├── edit-job.js       # Edit job name modal + IndexedDB save
    ├── email-config.js   # Email Recipients modal, localStorage config,
    │                     #   draftEmailForDate() — builds and downloads .eml
    └── loader.js         # loadFile, schedule table render, resumeFile, auto-init
```

Scripts are loaded in dependency order in `dashboard.html`:

```
utils → idb → filters → sites → modal → edit-job → email-config → loader
```

---

## How It Works

1. **File open** — `loader.js` uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (`window.showOpenFilePicker`) to let the user pick a `.xlsx`. The file handle is stored in IndexedDB so the next page load can re-open the same file without prompting.

2. **Parsing** — [SheetJS (xlsx.js)](https://sheetjs.com/) reads the workbook. Merged cells are expanded so every cell in a merged range holds the origin value. Excel date serials are converted to `"DD Mon YYYY"` labels using UTC maths (avoids timezone drift).

3. **Rendering** — Three independent render passes:
   - `makeCard()` builds the Unique Sites summary card on initial load. After that, `renderSites()` owns the count: it computes `new Set(filtered.map(s => s.siteId)).size` — counting distinct site ID prefixes (e.g. `E07`) among the currently visible sites — and writes that single value to both the "X sites found" subtitle and the summary card, so they are always in sync.
   - `renderSites()` builds the collapsible, paginated sites panel. In **Group by Start Date** mode, `buildGroups()` intersects each site's full date list with `activeDataCols()` so only dates inside the active filter window generate groups. The Start column for each row uses the group's date rather than the site's overall first date.
   - The schedule table is built directly inside `loadFile()`

4. **Edit & save** — `saveEditJobName()` in `edit-job.js` patches the saved IndexedDB schedule dataset, re-derives Sites & Jobs, and refreshes the dashboard without writing back to Excel.

5. **Draft Email** — `draftEmailForDate()` in `email-config.js` reads saved recipients from `localStorage`, builds an Outlook-compatible HTML email (inline styles, `border-collapse` table), and writes it into a `.eml` file using the `X-Unsent: 1` MIME header. The browser downloads the file; double-clicking it opens Outlook 2021 as a new compose draft.

---

## Browser Compatibility

| Feature | Chrome 86+ | Edge 86+ | Firefox | Safari 15.2+ |
|---------|-----------|----------|---------|--------------|
| View dashboard | ✅ | ✅ | ✅ | ✅ |
| Direct file save | ✅ | ✅ | ❌ | ✅ |
| Auto-resume | ✅ | ✅ | ❌ | ✅ |
| Draft Email (.eml) | ✅ | ✅ | ✅ | ✅ |

On Firefox, the app falls back to a standard `<input type="file">` picker. Edits download as a new file instead of saving in-place.

---

## Dependencies (CDN, no install needed)

| Library | Version | Purpose |
|---------|---------|---------|
| [SheetJS](https://cdn.sheetjs.com/) | 0.18.5 | Read & write `.xlsx` files |
| [Tailwind CSS](https://tailwindcss.com/) | CDN | Utility classes for layout |
| [Inter](https://fonts.google.com/specimen/Inter) | Google Fonts | UI typography |

---

## Customisation

### Change the port

Edit line 9 of `launch_dashboard.bat`:

```bat
start "" http://localhost:8089/dashboard.html
python -m http.server 8089
```

Replace `8089` with any free port.

### Add or rename skip terms

In `js/sites.js`, the `skip` set controls which cell values are **excluded** from the Sites panel:

```js
const skip = new Set([
  'standby', 'public holiday', 'l2 training', 'travel wa + l2',
  'trianing (wah & tr) - vic', 'travel wa + l2 training', 'prep work', '', 'nan'
]);
```

Add any values you want suppressed from the sites list.

### Change the accent colour

The primary orange accent is defined once in `css/dashboard.css`. Search for `#F97316` and replace with your preferred colour. The sidebar dark background is `#0F172A`.

---

## Known Limitations

- Only the **first sheet** of the workbook is read.
- The schedule table renders **all date columns** at once — very wide files may require horizontal scrolling.
- Direct save requires the browser to have been granted **read/write** permission on the file (prompted once per browser session).
- Email recipients are stored in `localStorage` — clearing browser data will remove them.
- The Draft Email `.eml` file opens correctly in Outlook 2021 when it is set as the system default mail client.
