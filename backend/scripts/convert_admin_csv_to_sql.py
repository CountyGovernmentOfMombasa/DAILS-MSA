#!/usr/bin/env python3
"""
Convert Admin Users CSV to SQL INSERT statements for admin_users table.

Expected CSV columns:
- User ID
- Username
- Role (hr_admin | it_admin | super_admin)
- First Name
- Last Name
- Department
- sub_department

Policy mapping:
- Only HR admins have departments; IT and Super should have department/sub_department unset (NULL / 'N/A').
- Use a default bcrypt hash for password (same as used in repo examples): hash for "password".

Outputs a multi-row INSERT into backend/database/admin_users_insert_from_csv_YYYYMMDD.sql
"""
import csv
import os
from datetime import datetime

# Known bcrypt hash for the string "password" (cost=10)
DEFAULT_PW_HASH = "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"

CSV_PATH = r"c:\\Users\\Admin\\WDP\\All - Admin Users.csv"
OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', f"admin_users_insert_from_csv_{datetime.now().strftime('%Y%m%d')}.sql")


def esc(s: str) -> str:
    return s.replace("'", "''")


def norm(val: str) -> str:
    return (val or '').strip()


def to_null_if_dash(val: str):
    v = norm(val)
    return None if v in ('', '-', 'N/A', 'NA', 'NULL', 'null') else v


def main():
    rows = []
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            user_id = norm(r.get('User ID', ''))
            username = norm(r.get('Username', ''))
            role = norm(r.get('Role', ''))
            first_name = norm(r.get('First Name', ''))
            surname = norm(r.get('Last Name', ''))
            department = to_null_if_dash(r.get('Department', ''))
            sub_department_raw = to_null_if_dash(r.get('sub_department', ''))

            # Policy: HR keeps dept fields; IT and Super: department=NULL, sub_department='N/A'
            if role in ('it_admin', 'super_admin'):
                department_out = None
                sub_department_out = 'N/A'
            else:
                department_out = department
                sub_department_out = sub_department_raw or 'Unknown'

            # Basic validation
            if not user_id or not username or not role or not first_name or not surname:
                # skip incomplete rows
                continue

            # Build VALUES tuple
            def q(v):
                return 'NULL' if v is None else f"'{esc(v)}'"

            values = [
                user_id,  # user_id (int)
                q(username),
                q(DEFAULT_PW_HASH),
                'NULL',  # email
                q(role),
                q(first_name),
                q(surname),
                '1',  # is_active
                q(department_out),
                q(sub_department_out)
            ]
            rows.append(f"({', '.join(map(str, values))})")

    with open(OUT_PATH, 'w', encoding='utf-8') as out:
        out.write("-- Generated admin_users INSERT from CSV\n")
        out.write(f"-- Source: {CSV_PATH}\n")
        out.write(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        out.write("-- Default password is bcrypt hash for 'password'\n\n")
        out.write("INSERT INTO admin_users (user_id, username, password, email, role, first_name, surname, is_active, department, sub_department) VALUES\n")
        if rows:
            out.write(",\n".join(rows))
            out.write(";\n")
        else:
            out.write("-- No valid rows parsed from CSV; nothing to insert.\n")

    print(f"Wrote {len(rows)} rows to {OUT_PATH}")


if __name__ == '__main__':
    main()
