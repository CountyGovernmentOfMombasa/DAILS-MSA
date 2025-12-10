import csv
from pathlib import Path

CSV_PATH = Path(r"c:\Users\Admin\WDP\documents\ABSORBED CASUALS PER FACILITY.csv")
OUT_PATH = Path(r"c:\Users\Admin\WDP\backend\database\users_insert_absorbed_casuals.sql")

def norm_payroll(id_no: str) -> str:
    id_no = (id_no or '').strip()
    if not id_no or id_no == '-':
        return ''
    return f"TN{id_no}HTL"

def make_email(payroll: str) -> str:
    return f"{payroll}@mombasa.go.ke" if payroll else ''

def esc(value: str) -> str:
    if value is None:
        return 'NULL'
    s = value.strip()
    return s.replace("'", "''")

def main():
    rows = []
    with CSV_PATH.open(newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            # Expected order: first_name, other_names, surname, ID NO, Payroll number
            if not row or len(row) < 4:
                continue
            first = (row[0] or '').strip()
            other = (row[1] or '').strip()
            surname = (row[2] or '').strip()
            id_no = (row[3] or '').strip()
            payroll = norm_payroll(id_no)
            email = make_email(payroll)
            # Skip rows without ID (cannot generate normalized payroll)
            if not payroll:
                continue
            rows.append({
                'payroll_number': payroll,
                'surname': surname,
                'first_name': first,
                'other_names': other if other else None,
                'email': email,
                'phone_number': None,
                'birthdate': '1999-01-01',
                'password': '',
                'password_changed': 'FALSE',
                'national_id': id_no,
                'sub_department': None,
            })

    header = (
        "-- Generated from ABSORBED CASUALS PER FACILITY.csv\n"
        "-- payroll_number format: TN<ID_NO>HTL; email: {payroll}@mombasa.go.ke; birthdate: 1999-01-01\n"
        "-- Rows with missing ID are skipped.\n\n"
    )
    cols = (
        "payroll_number, surname, first_name, other_names, email, phone_number, birthdate, password, password_changed, national_id"
    )
    lines = [header]
    lines.append(f"INSERT INTO users ({cols}) VALUES\n")

    values_sql = []
    for r in rows:
        vals = [
            f"'{esc(r['payroll_number'])}'",
            f"'{esc(r['surname'])}'",
            f"'{esc(r['first_name'])}'",
            'NULL' if r['other_names'] is None else f"'{esc(r['other_names'])}'",
            f"'{esc(r['email'])}'",
            'NULL',
            f"'{r['birthdate']}'",
            "''",
            r['password_changed'],
            f"'{esc(r['national_id'])}'",
        ]
        values_sql.append(f"({', '.join(vals)})")

    # End with semicolon
    lines.append(',\n'.join(values_sql) + ';\n')

    OUT_PATH.write_text(''.join(lines), encoding='utf-8')
    print(f"Wrote {len(rows)} rows to {OUT_PATH}")

if __name__ == '__main__':
    main()
