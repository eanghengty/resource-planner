# IndexedDB Diagram

The app uses IndexedDB database `schedule-dash` at version `2`.

Excel is import-only. After import, the schedule, Site Setup metadata, Sites & Jobs row snapshot, and job-name edits are saved in IndexedDB.

## Stores

```mermaid
erDiagram
  SCHEDULE_DASH {
    string name "schedule-dash"
    number version "2"
  }

  HANDLES {
    string key "last"
    object value "Legacy file handle"
  }

  APPDATA {
    string key "site-meta-v1 | site-jobs-v1 | schedule-data-v1"
    object value "Application data payload"
  }

  SCHEDULE_DASH ||--|| HANDLES : contains
  SCHEDULE_DASH ||--|| APPDATA : contains
```

## `appdata` Keys

```mermaid
erDiagram
  APPDATA {
    string objectStore "appdata"
  }

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

  SITE_META {
    string key "site-meta-v1"
    object sites
    object rates
  }

  SITE_META_RECORD {
    string siteId
    boolean isMain
    string flag
    array tags
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
    number actualDays
    boolean hasGap
    array dateList
    object slotsByDate
  }

  APPDATA ||--|| SCHEDULE_DATA : stores
  SCHEDULE_DATA ||--o{ EMPLOYEE : employees
  SCHEDULE_DATA ||--o{ DATE_COL : dateCols
  APPDATA ||--|| SITE_META : stores
  SITE_META ||--o{ SITE_META_RECORD : sites_by_siteId
  APPDATA ||--|| SITE_JOBS : stores
  SITE_JOBS ||--o{ SITE_JOB_ROW : rows
```

## Flag And Tag Storage

Flags and tags are saved in `appdata -> site-meta-v1`.

```json
{
  "sites": {
    "E07": {
      "isMain": true,
      "flag": "macro",
      "tags": ["priority", "night shift"]
    }
  },
  "rates": {
    "macro": 125,
    "ibc": 0,
    "tx": 0,
    "tunnel": 0,
    "core": 0
  }
}
```

The Sites & Jobs snapshot in `appdata -> site-jobs-v1` also includes `flag` and `tags` on each row. That snapshot is derived from `schedule-data-v1` plus `site-meta-v1`, so `site-meta-v1` is the source of truth for Site Setup values.

## Data Flow

```mermaid
flowchart LR
  A["Import Excel .xlsx"] --> B["Parse workbook in browser"]
  B --> C["Save schedule-data-v1"]
  C --> D["Render dashboard from IndexedDB"]
  E["Site Setup save"] --> F["Save site-meta-v1"]
  F --> G["Rebuild site-jobs-v1 row snapshot"]
  H["Edit job name"] --> I["Update schedule-data-v1 employees.days"]
  I --> D
  D --> G
```

## Source Of Truth

- `schedule-data-v1` is the source of truth for imported employee/day schedule cells.
- `site-meta-v1` is the source of truth for site setup fields: `isMain`, `flag`, `tags`, and flag `rates`.
- `site-jobs-v1` is a denormalized snapshot for row-style Sites & Jobs data, including copied `flag`, `tags`, and `totalHours`.
- `handles` is legacy file-handle storage and is no longer used for the full IndexedDB workflow.
