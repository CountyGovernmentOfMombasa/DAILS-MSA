import csv
from datetime import datetime
from pathlib import Path

CSV_PATH = Path(r"c:\Users\Admin\WDP\Hospital Casuals.csv")
OUT_PATH = Path(r"c:\Users\Admin\WDP\backend\database\users_insert_hospital_casuals.sql")


def parse_date(mdy: str) -> str:
    """Parse M/D/YYYY to YYYY-MM-DD; if invalid Feb 29 on non-leap year, coerce to Feb 28."""
    mdy = mdy.strip()
    # Handle empty
    if not mdy:
        # Fallback minimal valid date to satisfy NOT NULL; choose '1900-01-01'
        return "1900-01-01"
    # Normalize separators
    try:
        dt = datetime.strptime(mdy, "%m/%d/%Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError as e:
        # Handle 2/29 on non-leap years by coercing to 2/28
        parts = mdy.split("/")
        if len(parts) == 3:
            m, d, y = parts
            try:
                m_i = int(m)
                d_i = int(d)
                y_i = int(y)
                if m_i == 2 and d_i == 29:
                    return f"{y_i:04d}-02-28"
            except Exception:
                pass
        # As a last resort, default
        return "1900-01-01"


def sql_escape(value: str) -> str:
    if value is None:
        return "NULL"
    # Ensure string
    s = str(value)
    # Trim whitespace
    s = s.strip()
    # Escape single quotes by doubling them
    s = s.replace("'", "''")
    return f"'{s}'"


def build_email(payroll_number: str) -> str:
    payroll = (payroll_number or "").strip()
    return f"{payroll}@mombasa.go.ke"


def main():
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    rows = []
    with CSV_PATH.open(newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        # Expected headers: First Name, Other Names, Surname, Payroll Number, National ID, Birth Date
        for r in reader:
            first_name = (r.get('First Name') or '').strip()
            other_names = (r.get('Other Names') or '').strip()
            surname = (r.get('Surname') or '').strip()
            payroll_number = (r.get('Payroll Number') or '').strip()
            national_id = (r.get('National ID') or '').strip()
            birthdate_raw = (r.get('Birth Date') or '').strip()

            birthdate = parse_date(birthdate_raw)
            email = build_email(payroll_number)

            # Prepare SQL-safe strings
            sql_first_name = sql_escape(first_name)
            sql_other_names = sql_escape(other_names) if other_names else "NULL"
            sql_surname = sql_escape(surname)
            sql_payroll = sql_escape(payroll_number)
            sql_email = sql_escape(email)
            sql_phone = "NULL"  # not provided
            sql_birthdate = sql_escape(birthdate)
            sql_password = sql_escape("")  # leave blank, NOT NULL
            sql_password_changed = "0"  # boolean false
            sql_national_id = sql_escape(national_id) if national_id else "NULL"
            sql_sub_department = sql_escape("")  # users.sub_department is NOT NULL; set empty string

            rows.append(
                f"({sql_payroll}, {sql_surname}, {sql_first_name}, {sql_other_names}, {sql_email}, {sql_phone}, {sql_birthdate}, {sql_password}, {sql_password_changed}, {sql_national_id}, {sql_sub_department})"
            )

    header = (
        "-- Generated SQL INSERT statements for users table from Hospital Casuals.csv\n"
        "-- Assumptions: email={payroll_number}@mombasa.go.ke; phone_number=NULL; password=''; password_changed=0; sub_department='' (required NOT NULL).\n"
        "-- Ensure users.id is AUTO_INCREMENT PRIMARY KEY before running.\n\n"
    )

    columns = (
        "INSERT INTO users (payroll_number, surname, first_name, other_names, email, phone_number, birthdate, password, password_changed, national_id, sub_department) VALUES\n"
    )

    sql_body = ",\n".join(rows) + ";\n"

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as out:
        out.write(header)
        out.write(columns)
        out.write(sql_body)

    print(f"Wrote {len(rows)} rows to {OUT_PATH}")


if __name__ == "__main__":
    main()
