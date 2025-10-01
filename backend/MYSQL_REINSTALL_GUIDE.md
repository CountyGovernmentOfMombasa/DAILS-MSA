# MariaDB / XAMPP Full Reinstall Guide

This document walks you through backing up only the data you need, fully removing the corrupted / noisy InnoDB metadata, and restoring a clean environment for the backend.

---

## 1. What Problem Are We Solving?

You encountered repeated InnoDB errors referencing missing per-table tablespace files like:

```text
InnoDB: Cannot open datafile for read-only: '.\\laravel\\failed_jobs.ibd' OS error: 203
```

Those tables were removed at the filesystem level without proper DROP TABLE / DROP DATABASE, so InnoDB's data dictionary entries are stale. A clean reinstall plus logical dumps removes the stale metadata.

---

## 2. Items To Back Up BEFORE Uninstall

Create a directory for backups, e.g. `C:\backup`.

Recommended backups:

| Item | Purpose | How |
|------|---------|-----|
| Application DB(s) | Your data | mysqldump logical export |
| Config: `my.ini` | Custom MySQL settings | Copy file |
| Config: `php.ini` | PHP tuning | Copy file |
| Apache: `httpd.conf` + vhosts | Web server config | Copy files |
| `htdocs` project folders | Web applications | Copy directories |
| Any SSL certs / keys | HTTPS | Copy cert/key files |
| Backend `.env` | App secrets (already outside XAMPP) | Ensure safe copy |

DO NOT copy raw internal InnoDB system files (`ibdata1`, `ib_logfile*`) if you want to eliminate corruption.

---

## 3. Export Databases (Logical Dumps)

From PowerShell (adjust root password):

```powershell
cd C:\xampp\mysql\bin
# Create backup dir if not exists
if (!(Test-Path C:\backup)) { New-Item -ItemType Directory -Path C:\backup | Out-Null }

# Dump the primary application DB
./mysqldump.exe -u root -p --routines --triggers --single-transaction employee_declarations > C:\backup\employee_declarations_%DATE:~10,4%-%DATE:~4,2%-%DATE:~7,2%.sql

# (Optional) Dump ALL databases (continues past errors with --force)
./mysqldump.exe -u root -p --all-databases --routines --triggers --events --single-transaction --force > C:\backup\all_databases_%DATE:~10,4%-%DATE:~4,2%-%DATE:~7,2%.sql
```

If the `laravel` schema throws errors but you don't need it, you can ignore them or omit the all-databases dump.

---

## 4. Stop and Uninstall XAMPP

1. Stop all services in the XAMPP Control Panel.
2. Uninstall XAMPP via Windows Apps & Features or the uninstaller.
3. Manually delete/rename `C:\xampp` (e.g. `C:\xampp_old`) to ensure no stale files remain.

---

## 5. Reinstall Fresh XAMPP

1. Download latest XAMPP (includes MariaDB) from Apache Friends.
2. Install to `C:\xampp` (default path recommended).
3. Start MySQL once to initialize data directory, then stop it.

---

## 6. Restore ONLY What You Need

Copy back (if modified):

- `my.ini` (merge customizations instead of overwriting entirely if versions differ)
- `php.ini`
- Apache vhosts files (merge carefully)
- Web app folders into `htdocs` if required

Keep raw new `ibdata1` and logfiles—do NOT overwrite them.

---

## 7. Recreate Database and Import Dumps

Start MySQL service (XAMPP Control Panel → Start). Then:

```powershell
cd C:\xampp\mysql\bin
# Create empty DB (import will also create, but explicit is fine)
./mysql.exe -u root -p -e "CREATE DATABASE IF NOT EXISTS employee_declarations CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Import primary database
./mysql.exe -u root -p employee_declarations < C:\backup\employee_declarations_YYYY-MM-DD.sql

# (Optional) Import all DBs dump instead (will recreate users, etc.)
# ./mysql.exe -u root -p < C:\backup\all_databases_YYYY-MM-DD.sql
```

Replace `YYYY-MM-DD` with actual date from your file name.

---

## 8. Create Application User (Least Privilege)

```powershell
./mysql.exe -u root -p -e "CREATE USER IF NOT EXISTS 'appuser'@'localhost' IDENTIFIED BY 'app_password_123!'; GRANT ALL PRIVILEGES ON employee_declarations.* TO 'appuser'@'localhost'; FLUSH PRIVILEGES;"
```

If your backend uses `127.0.0.1` explicitly:

```powershell
./mysql.exe -u root -p -e "CREATE USER IF NOT EXISTS 'appuser'@'127.0.0.1' IDENTIFIED BY 'app_password_123!'; GRANT ALL PRIVILEGES ON employee_declarations.* TO 'appuser'@'127.0.0.1'; FLUSH PRIVILEGES;"
```

---

## 9. Update Backend `.env`

Ensure values (example):

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=appuser
DB_PASSWORD=app_password_123!
DB_NAME=employee_declarations
```

---

## 10. Test

```powershell
# CLI test
cd C:\xampp\mysql\bin
./mysql.exe -u appuser -papp_password_123! -D employee_declarations -e "SELECT 1;"

# Backend
cd C:\Users\Admin\WDP\backend
node app.js
```

Expect to see: `Database connected (attempt 1/5)`.

If you added the optional health route earlier:

- <http://localhost:5000/api/health>
- <http://localhost:5000/api/health/db>

---

## 11. (Optional) Automated Backup Script

See `scripts/mysql_backup.ps1` (create it) to schedule daily dumps with Windows Task Scheduler.

---

## 12. Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Same InnoDB errors return | You restored old `ibdata1` / `ib_logfile*` or corrupted schema folder | Reinstall again, only import dumps |
| Access denied for appuser | Forgot to recreate user / imported old users with different auth plugin | Re-run CREATE USER + GRANT |
| Node cannot connect (ECONNREFUSED) | MySQL not running or port changed | Start service / update `.env` |
| Charset / collation issues | Missing utf8mb4 in new DB | ALTER DATABASE ... CHARACTER SET utf8mb4 |

---

## 13. FAQ

**Q:** Can I salvage the missing `laravel` tables?  
**A:** Not without the original `.ibd` files or a prior logical dump. They are unrecoverable if both are gone.

**Q:** Why not copy the entire `data` directory?  
**A:** That reintroduces stale metadata and defeats the purpose of a clean slate.

**Q:** Should I tune InnoDB now?  
**A:** After stability, increase `innodb_buffer_pool_size` (e.g., 512M+) in `my.ini` for better performance if memory allows.

---

## 14. Next Enhancements

- Add periodic backup Task Scheduler job.
- Add migration scripts / automated schema deployment.
- Use Docker for isolated dev DB to avoid host interference.

---

**Done.** Proceed with the steps above and your environment should be clean, with no recurring missing tablespace errors.
