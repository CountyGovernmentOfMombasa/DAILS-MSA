#!/usr/bin/env python3
"""
CSV to SQL Converter for Users Table
Converts PSB Data CSVs to SQL INSERT statements for the users table.

Now supports the header format found in "PSB Data 220925.csv":
Full Name, Surname, First Name, Other Names, ID Number, Payroll Number, Birth Date
"""

import csv
import hashlib
from datetime import datetime

def hash_password(password):
    """Return a deterministic bcrypt hash string for the default password.

    NOTE: For actual authentication, generate real bcrypt hashes.
    Here we use a known-good bcrypt hash for "TempPass123!" to ensure
    compatibility with the Node backend's bcrypt compare.
    """
    # Known bcrypt hash for "TempPass123!" (cost=10)
    # Matches example hashes used elsewhere in this repo
    return "$2b$10$rZ8kXKKuYGLQczaYYe1w4OGK5IY4nB9ScZBHjxEn9mNlVt1CgKWmO"

def format_date(date_str):
    """Convert date to YYYY-MM-DD format.

    Supports:
    - DD/MM/YYYY (as in PSB Data 220925.csv)
    - D/M/YYYY
    - YYYY-MM-DD (passthrough)
    """
    if not date_str:
        return None
    ds = date_str.strip()
    if not ds:
        return None

    # Already ISO-like
    if '-' in ds and len(ds.split('-')[0]) == 4:
        return ds

    # Try day-first formats
    for fmt in ('%d/%m/%Y', '%-d/%-m/%Y', '%d/%m/%y'):
        try:
            date_obj = datetime.strptime(ds, fmt)
            return date_obj.strftime('%Y-%m-%d')
        except Exception:
            pass

    # Try month-first as a fallback
    for fmt in ('%m/%d/%Y', '%-m/%-d/%Y'):
        try:
            date_obj = datetime.strptime(ds, fmt)
            return date_obj.strftime('%Y-%m-%d')
        except Exception:
            pass

    print(f"Warning: Could not parse date '{date_str}', using NULL")
    return None

def generate_email(first_name, last_name, payroll_number):
    """Generate an email address from name and payroll number"""
    # Clean the names
    first_clean = first_name.replace('MR ', '').replace('MRS ', '').replace('MS ', '').replace('MISS ', '').strip()
    last_clean = last_name.strip()
    
    # Create email
    email = f"{first_clean.lower().replace(' ', '.')}.{last_clean.lower().replace(' ', '.')}@psb.gov.ke"
    return email

def clean_phone(phone_str):
    """Clean and format phone number"""
    if not phone_str or phone_str.strip() == '':
        return None
    # Add basic formatting - you may want to adjust this based on your data
    return phone_str.strip()


def sql_escape(value: str) -> str:
    """Escape single quotes for safe SQL string literals."""
    return value.replace("'", "''") if isinstance(value, str) else value

def convert_csv_to_sql(csv_file_path, output_file_path):
    """Convert CSV data to SQL INSERT statements for the users table.

    Expected columns (case-insensitive match):
        - Payroll Number -> payroll_number
        - Surname -> surname
        - First Name -> first_name
        - Other Names -> other_names (optional)
        - Birth Date -> birthdate
        - ID Number -> national_id (optional)

    Any missing optional field will be inserted as NULL.
    Email and phone_number are set to NULL by default to avoid conflicts.
    """

    sql_statements = []
    sql_statements.append("-- Generated SQL INSERT statements for users table")
    sql_statements.append("-- Generated on: " + datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    sql_statements.append("-- Default password for all users: '' (empty string)")
    sql_statements.append("-- Email and phone fields set to NULL - users can add later")
    sql_statements.append("")
    
    # Default password set to empty string
    default_password_hash = ""
    
    insert_statements = []
    
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)

            # Normalize header keys for easier access
            def get_val(row, *keys):
                for k in keys:
                    if k in row:
                        return row[k]
                # Try case-insensitive/trimmed match
                lower_map = {kk.lower().strip(): kk for kk in row.keys()}
                for k in keys:
                    lk = k.lower().strip()
                    if lk in lower_map:
                        return row[lower_map[lk]]
                return ''

            seen_payroll = set()

            for row_num, row in enumerate(reader, 1):
                try:
                    # Extract using known headers
                    payroll_number = get_val(row, 'Payroll Number', 'payroll_number').strip()
                    surname = get_val(row, 'Surname', 'surname', 'Last Name', 'last_name').strip()
                    first_name = get_val(row, 'First Name', 'first_name').strip()
                    other_names = get_val(row, 'Other Names', 'other_names', 'Middle Name', 'middle_name').strip()
                    birthdate = format_date(get_val(row, 'Birth Date', 'birthdate'))
                    national_id = get_val(row, 'ID Number', 'National ID', 'national_id').strip()

                    # Skip if essential data is missing
                    if not payroll_number or not first_name or not surname:
                        print(f"Warning: Skipping row {row_num} - missing essential name or payroll number")
                        continue

                    if not birthdate:
                        print(f"Warning: Skipping row {row_num} - invalid/missing birth date for {first_name} {surname}")
                        continue

                    # De-duplicate by payroll number
                    if payroll_number in seen_payroll:
                        print(f"Warning: Skipping duplicate payroll_number on row {row_num}: {payroll_number}")
                        continue
                    seen_payroll.add(payroll_number)

                    # Generate a guaranteed-unique, valid placeholder email from payroll number
                    email = f"{payroll_number.lower()}@mombasa.go.ke"
                    phone = None

                    # Create SQL values
                    values = []
                    values.append(f"'{sql_escape(payroll_number)}'")  # payroll_number
                    values.append(f"'{sql_escape(surname)}'")         # surname
                    values.append(f"'{sql_escape(first_name)}'")      # first_name
                    values.append(f"'{sql_escape(other_names)}'" if other_names else "NULL")  # other_names
                    values.append(f"'{sql_escape(email)}'")             # email
                    values.append("NULL")                               # phone_number
                    values.append(f"'{birthdate}'")                     # birthdate
                    values.append(f"'{default_password_hash}'")         # password (empty)
                    values.append("FALSE")                              # password_changed
                    values.append(f"'{sql_escape(national_id)}'" if national_id else "NULL")  # national_id

                    insert_statement = f"({', '.join(values)})"
                    insert_statements.append(insert_statement)

                except Exception as e:
                    print(f"Error processing row {row_num}: {e}")
                    continue

        if insert_statements:
            # Create the main INSERT statement
            sql_statements.append(
                "INSERT INTO users ("
                "payroll_number, surname, first_name, other_names, email, phone_number, birthdate, password, password_changed, national_id"
                ") VALUES"
            )

            # Add all value statements
            for i, statement in enumerate(insert_statements):
                if i == len(insert_statements) - 1:  # Last statement
                    sql_statements.append(statement + ";")
                else:
                    sql_statements.append(statement + ",")

            sql_statements.append("")
            sql_statements.append("-- End of INSERT statements")
            sql_statements.append(f"-- Total records processed: {len(insert_statements)}")

        # Write to output file
        with open(output_file_path, 'w', encoding='utf-8') as outfile:
            outfile.write('\n'.join(sql_statements))

        print(f"✅ Successfully converted {len(insert_statements)} records")
        print(f"📄 SQL file saved to: {output_file_path}")
        print(f"🔑 Default password for all users: '' (empty)")
        print(f"📧 Email fields set to NULL - users will add emails later")

    except Exception as e:
        print(f"❌ Error reading CSV file: {e}")

if __name__ == "__main__":
    # File paths
    # Default to the 220925 CSV; adjust as needed.
    csv_file = r"c:\Users\Admin\WDP\PSB Data 220925 (1).csv"
    output_file = r"c:\Users\Admin\WDP\backend\database\users_insert_from_csv_220925.sql"

    print("🔄 Converting CSV to SQL...")
    print(f"📁 Input file: {csv_file}")
    print(f"📁 Output file: {output_file}")
    print()

    convert_csv_to_sql(csv_file, output_file)
