# SQL Console User Manual

## Table of Contents
1. [Overview](#overview)
2. [Access Methods](#access-methods)
3. [Authentication](#authentication)
4. [Features](#features)
5. [SQL Query Operations](#sql-query-operations)
6. [Database Management](#database-management)
7. [Project Data Management](#project-data-management)
8. [Common Query Examples](#common-query-examples)
9. [Important Notes](#important-notes)

---

## Overview

SQL Console is a database management tool for the NBINS system, providing direct SQL query execution, database import/export, and project data management capabilities.

**Key Features:**
- Execute arbitrary SQL queries (SELECT, INSERT, UPDATE, DELETE, etc.)
- Export/Import the complete database, including `ncr_index` and `R2` objects
- Export/Import individual project data, including project-scoped `R2` objects
- Delete projects and associated data, while cleaning related `R2` objects
- Quick access to common data tables

---

## Access Methods

### Method 1: From Admin Page
1. Log in to the system and navigate to the Admin page (`/admin`)
2. Click the **"SQL Console"** button

### Method 2: Direct Access
Direct URL: `/admin/sql`

---

## Authentication

### First Access
1. The system displays a login interface requiring console password
2. Enter the value of environment variable `SQL_CONSOLE_SECRET`
3. Click **"Verify and Enter"** or press Enter

### Password Verification
- Password is saved in browser's sessionStorage
- Re-entry required after closing browser tab
- Error message if password is incorrect: "Incorrect password, please confirm you entered the SQL_CONSOLE_SECRET value"

### Logout
Click the **"Log out"** button in the top right corner to clear saved password

---

## Features

SQL Console interface is divided into two main areas:

### Left Area: SQL Query Editor
- SQL statement input box (multi-line support)
- Execute button
- Query results display area

### Right Area: Data Management Panel
- Database import/export
- Project data management
- Quick access to common tables

---

## SQL Query Operations

### Execute Query

1. **Enter SQL Statement**
   - Type SQL statement in the text box
   - Multi-line input supported
   - Default example: `SELECT * FROM users LIMIT 10;`

2. **Execution Methods**
   - Click **"Execute ▶"** button
   - Or use keyboard shortcut: `Ctrl + Enter` (Mac: `Cmd + Enter`)

3. **View Results**
   - SELECT queries: Display results in table format with row count
   - INSERT/UPDATE/DELETE: Show affected rows, execution time, last inserted row ID

### Query Results

#### SELECT Query Results
```
┌─────────────────────────────────────┐
│ RESULT                    10 rows   │
├─────────────────────────────────────┤
│ id │ username │ email │ role       │
├────┼──────────┼───────┼────────────┤
│ 1  │ admin    │ ...   │ admin      │
│ 2  │ user1    │ ...   │ inspector  │
└─────────────────────────────────────┘
```

#### Modification Operation Results
```
✓ Changes: 1, Duration: 5ms, Last Row ID: 123
```

### Error Handling
- SQL errors display in red alert above results area
- Click **✕** on the right side of error message to dismiss

---

## Database Management

### Export Complete Database

1. Find **"DATABASE"** section in right panel
2. Click **"Export"** button
3. System automatically downloads JSON file with format: `nbins-db-YYYY-MM-DD.json`
4. File size notification displayed after download

**Export Contents:**
- Complete data from all tables
- Includes: `users`, `projects`, `ships`, `inspection_items`, `inspection_rounds`, `comments`, `ncrs`, `ncr_index`, `observation_types`, `observations`, etc.
- When an `R2` bucket is configured, objects under `ncrs/`, `media/`, `ncr-files/`, and `ncr-pdf/` are exported as well

### Import Complete Database

⚠️ **Warning: This operation will clear and overwrite the entire database!**

1. Click **"Import"** button
2. Select previously exported JSON file
3. System displays confirmation dialog: **"⚠️ Warning: This will clear and overwrite the entire database. Continue?"**
4. Click **"OK"** to start import
5. Success message displayed: **"Database import successful!"**

**Use Cases:**
- Database migration
- Disaster recovery
- Test environment data reset
- Full `NCR + R2` environment backup and restore

---

## Project Data Management

### Select Project
Choose the target project from the dropdown menu in **"PROJECT DATA"** section

Display format: `Project Code — Project Name`
Example: `PRJ001 — Ship Project Name`

### Export Project Data

1. Select target project from dropdown menu
2. Click **"Export"** button
3. System downloads JSON file with format: `nbins-project-{project-code}-YYYY-MM-DD.json`

**Export Contents:**
- Project basic information
- All associated ships
- All inspection records
- All observations
- All NCR records
- Project member information
- Project-scoped `R2` objects under `ncrs/`, `media/`, `ncr-files/`, and `ncr-pdf/`

### Import Project Data

⚠️ **Warning: This operation will overwrite all data for the project with the same name!**

1. Click **"Import"** button
2. Select previously exported project JSON file
3. System identifies project code and displays confirmation: **"⚠️ Warning: This will overwrite all data for project [XXX]. Continue?"**
4. Click **"OK"** to start import
5. Success message displayed: **"Project [XXX] import successful!"**

**Use Cases:**
- Project data backup and recovery
- Cross-environment project migration
- Project data sharing

### Delete Project

⚠️ **Dangerous Operation: This action cannot be undone!**

1. Select project to delete from dropdown menu
2. Click red **"Delete Project"** button
3. System displays input prompt: **"Delete project XXX and all associated data (ships, inspections, observations, etc.). Enter project code to confirm:"**
4. Enter project code (must match exactly)
5. Click **"OK"** to execute deletion
6. Success message displayed: **"Project XXX deleted"**

**Deletion Scope:**
- Project basic information
- All associated ships
- All inspection records and items
- All observations
- All NCR records
- All comments
- Project member relationships

---

## Common Query Examples

### Quick Access to Data Tables
The **"TABLES"** section at the bottom of the right panel lists all common data tables. Clicking a table name auto-fills the query:

```sql
SELECT * FROM "table_name" LIMIT 20;
```

**Available Data Tables:**
- `users` - Users table
- `projects` - Projects table
- `ships` - Ships table
- `inspection_items` - Inspection items table
- `inspection_rounds` - Inspection rounds table
- `comments` - Comments table
- `ncrs` - NCR records table
- `observations` - Observations table
- `observation_types` - Observation types table
- `project_members` - Project members table

### User Management Queries

```sql
-- View all users
SELECT * FROM users;

-- View admin users
SELECT * FROM users WHERE role = 'admin';

-- View specific user details
SELECT * FROM users WHERE username = 'admin';

-- Count users by role
SELECT role, COUNT(*) as count FROM users GROUP BY role;
```

### Project Related Queries

```sql
-- View all projects
SELECT * FROM projects;

-- View projects with ship count
SELECT p.code, p.name, COUNT(s.id) as ship_count
FROM projects p
LEFT JOIN ships s ON p.id = s.projectId
GROUP BY p.id;

-- View project discipline configuration
SELECT code, name, disciplines FROM projects;
```

### Ship Related Queries

```sql
-- View all ships
SELECT * FROM ships;

-- View ships for specific project
SELECT * FROM ships WHERE projectId = 'project-id-here';

-- View ships with observation count
SELECT s.hullNumber, s.name, COUNT(o.id) as observation_count
FROM ships s
LEFT JOIN observations o ON s.id = o.shipId
GROUP BY s.id;
```

### Observations Queries

```sql
-- View all observations
SELECT * FROM observations ORDER BY createdAt DESC LIMIT 50;

-- View observations for specific ship
SELECT * FROM observations WHERE shipId = 'ship-id-here';

-- Count observations by status
SELECT status, COUNT(*) as count FROM observations GROUP BY status;

-- View observations by discipline
SELECT * FROM observations WHERE discipline = 'Electrical';

-- View open observations
SELECT * FROM observations WHERE status = 'Open';

-- View observation details with ship and project info
SELECT 
  o.serialNo,
  o.type,
  o.discipline,
  o.location,
  o.content,
  o.status,
  s.hullNumber,
  s.name as shipName,
  p.code as projectCode
FROM observations o
JOIN ships s ON o.shipId = s.id
JOIN projects p ON s.projectId = p.id
ORDER BY o.createdAt DESC
LIMIT 50;
```

### NCR Related Queries

```sql
-- View all NCRs
SELECT * FROM ncrs ORDER BY createdAt DESC;

-- Count NCRs by status
SELECT status, COUNT(*) as count FROM ncrs GROUP BY status;

-- View NCRs for specific ship
SELECT * FROM ncrs WHERE shipId = 'ship-id-here';
```

### Inspection Related Queries

```sql
-- View inspection rounds
SELECT * FROM inspection_rounds;

-- View inspection items
SELECT * FROM inspection_items;

-- View inspection items for specific round
SELECT * FROM inspection_items WHERE roundId = 'round-id-here';

-- Count inspection items by status
SELECT status, COUNT(*) as count FROM inspection_items GROUP BY status;
```

### Data Statistics Queries

```sql
-- System overview statistics
SELECT 
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM projects) as total_projects,
  (SELECT COUNT(*) FROM ships) as total_ships,
  (SELECT COUNT(*) FROM observations) as total_observations,
  (SELECT COUNT(*) FROM ncrs) as total_ncrs;

-- Project activity statistics
SELECT 
  p.code,
  p.name,
  COUNT(DISTINCT s.id) as ships,
  COUNT(DISTINCT o.id) as observations,
  COUNT(DISTINCT n.id) as ncrs
FROM projects p
LEFT JOIN ships s ON p.id = s.projectId
LEFT JOIN observations o ON s.id = o.shipId
LEFT JOIN ncrs n ON s.id = n.shipId
GROUP BY p.id;
```

### Data Modification Examples

```sql
-- Update observation status
UPDATE observations SET status = 'Closed' WHERE id = 'observation-id-here';

-- Batch update observation status
UPDATE observations SET status = 'Closed' WHERE shipId = 'ship-id-here' AND status = 'Open';

-- Delete specific record (use with caution)
DELETE FROM comments WHERE id = 'comment-id-here';

-- Update user role
UPDATE users SET role = 'admin' WHERE username = 'someuser';
```

---

## Important Notes

### Security
1. **Protect Password**: SQL_CONSOLE_SECRET is the highest privilege credential, keep it secure
2. **Careful Operations**: SQL Console can execute any SQL statement, including data deletion
3. **Regular Backups**: Export database backup before important operations

### Data Operations
1. **Use Transactions**: Use transactions for batch modifications to ensure data consistency
2. **Test Queries**: Verify conditions with SELECT before executing modifications in production
3. **Limit Results**: Use LIMIT when querying large tables to avoid browser lag

### Import/Export
1. **File Format**: Import files must be JSON format exported by the system
2. **Data Integrity**: Verify file completeness before import to avoid data corruption
3. **Environment Isolation**: Don't import production data to test environment and vice versa
4. **Large Payloads**: Full exports that include `R2` object bodies can become much larger and take longer to import/export

### Performance Optimization
1. **Use Indexes**: Query using indexed fields when possible (e.g., id, projectId, shipId)
2. **Avoid Full Table Scans**: Add WHERE conditions when querying large tables
3. **Paginated Queries**: Use LIMIT and OFFSET for pagination

### Common Issues

**Q: Forgot SQL_CONSOLE_SECRET?**
A: Contact system administrator or check server environment variable configuration

**Q: Database import failed?**
A: Check JSON file format is correct and file is not corrupted

**Q: How to recover accidentally deleted data?**
A: If backup exists, use import function to restore; otherwise data cannot be recovered

**Q: Query results not fully displayed?**
A: Table column width is limited, hover to view full content; or export data and view in external tool

**Q: Can multiple SQL statements be executed?**
A: Currently only one statement can be executed at a time, multiple statements need separate execution

---

## Technical Details

### Database Type
- Uses Cloudflare D1 (based on SQLite)
- Supports standard SQL syntax

### API Endpoints
- Execute SQL: `POST /api/sql/execute`
- Export Database: `GET /api/sql/export-db`
- Import Database: `POST /api/sql/import-db`
- Export Project: `GET /api/sql/export-project/:projectId`
- Import Project: `POST /api/sql/import-project`
- Delete Project: `DELETE /api/sql/delete-project/:projectId`

### Permission Verification
All API requests require Header:
```
X-SQL-Secret: {SQL_CONSOLE_SECRET}
```

---

## Version History

### v1.0.0
- Initial release
- SQL query execution support
- Database import/export support
- Project data management support
- Project deletion functionality

---

**Document Version**: v1.0.0  
**Last Updated**: April 12, 2026  
**Maintained by**: NBINS Development Team
