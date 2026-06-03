# Excel Conversion To IndexedDB Diagram

This diagram shows how an imported `.xlsx` file becomes IndexedDB data. The Excel file is only read during import. After conversion, the app renders and edits the IndexedDB dataset.

## Conversion Flow

```mermaid
flowchart TD
  A["User clicks Import Excel file"] --> B["Browser file picker"]
  B --> C["Read selected .xlsx as ArrayBuffer"]
  C --> D["SheetJS XLSX.read"]
  D --> E["Select first worksheet"]
  E --> F["Expand merged cells"]
  F --> G["Read date/day headers from columns C onward"]
  G --> H["Read employee rows from row 3 onward"]
  H --> I["Build schedule-data-v1 payload"]
  I --> J["Save schedule-data-v1 to IndexedDB appdata"]
  J --> K["Extract Sites & Jobs from saved employee/day cells"]
  K --> L["Merge Site Setup metadata from site-meta-v1"]
  L --> M["Build site-jobs-v1 row snapshot"]
  M --> N["Save site-jobs-v1 to IndexedDB appdata"]
  N --> O["Render dashboard from IndexedDB"]
```

## Imported Excel Shape

```mermaid
flowchart LR
  A["Excel worksheet"] --> B["Row 1: dates"]
  A --> C["Row 2: day labels"]
  A --> D["Column A: employee names"]
  A --> E["Columns C onward: schedule cells"]
  E --> F["Example cell: E07 Site install"]
  E --> G["Example slash cell: E17/E14 Cable run"]
```

## IndexedDB Output

```mermaid
erDiagram
  SCHEDULE_DATA {
    string key "schedule-data-v1"
    string sourceName
    string sheetName
    string importedAt
    string updatedAt
    array employees
    array dateCols
  }

  EMPLOYEE {
    string name
    array days
  }

  DATE_COL {
    number idx
    string date
    string day
  }

  SITE_JOBS {
    string key "site-jobs-v1"
    string sourceName
    string savedAt
    array rows
  }

  SITE_JOB_ROW {
    string display
    string siteId
    string jobName
    string flag
    array tags
    boolean isMain
    number totalHours
    number totalSlots
    string from
    string to
    array dateList
    object slotsByDate
  }

  SCHEDULE_DATA ||--o{ EMPLOYEE : contains
  SCHEDULE_DATA ||--o{ DATE_COL : contains
  SCHEDULE_DATA ||--|| SITE_JOBS : derives
  SITE_JOBS ||--o{ SITE_JOB_ROW : contains
```

## Conversion Details

1. `importExcelFile()` opens the browser file picker and reads the selected workbook as an `ArrayBuffer`.
2. `parseWorkbookToDataset()` parses the first worksheet with SheetJS.
3. Merged cells are expanded so every merged schedule cell has the origin value.
4. Date columns are read from Excel column C onward.
5. Employee rows are read from Excel row 3 onward.
6. The imported schedule is saved as `schedule-data-v1` in IndexedDB.
7. `extractSites()` derives Sites & Jobs rows from the saved employee/day cells.
8. `getSiteMeta()` adds saved Site Setup values from `site-meta-v1`, including `flag`, `tags`, and `isMain`.
9. `persistCurrentSiteJobs()` saves the denormalized row snapshot as `site-jobs-v1`.
10. The dashboard renders from the IndexedDB dataset, not from the Excel file.

## Key Rule

After import, edits update IndexedDB only:

```mermaid
flowchart LR
  A["Edit job name"] --> B["Update schedule-data-v1 employees.days"]
  B --> C["Re-extract Sites & Jobs"]
  C --> D["Refresh site-jobs-v1"]
  D --> E["Render updated dashboard"]
  E -. "No write-back" .-> F["Excel file unchanged"]
```
