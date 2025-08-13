#!/usr/bin/env python3
"""
CSV to SQL Converter for Users Table
Converts PSB Data.csv to SQL INSERT statements for the users table
"""

import csv
import hashlib
from datetime import datetime

def hash_password(password):
    """Hash a password using a simple method (for demo purposes)"""
    # For production, you should use bcrypt or similar
    # This is a simple hash for demonstration
    return "$2b$10$" + hashlib.sha256(password.encode()).hexdigest()[:53]

def format_date(date_str):
    """Convert date from MM/DD/YYYY to YYYY-MM-DD format"""
    if not date_str or date_str.strip() == '':
        return None
    
    try:
        # Parse MM/DD/YYYY format
        date_obj = datetime.strptime(date_str.strip(), '%m/%d/%Y')
        return date_obj.strftime('%Y-%m-%d')
    except ValueError:
        try:
            # Try MM/D/YYYY format
            date_obj = datetime.strptime(date_str.strip(), '%m/%d/%Y')
            return date_obj.strftime('%Y-%m-%d')
        except ValueError:
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

def convert_csv_to_sql(csv_file_path, output_file_path):
    """Convert CSV data to SQL INSERT statements"""
    
    sql_statements = []
    sql_statements.append("-- Generated SQL INSERT statements for users table")
    sql_statements.append("-- Generated on: " + datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    sql_statements.append("-- Default password for all users: 'TempPass123!' (hashed)")
    sql_statements.append("-- Email fields set to NULL - users can add emails later")
    sql_statements.append("")
    
    # Default password hash for "TempPass123!"
    default_password_hash = hash_password("TempPass123!")
    
    insert_statements = []
    
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            
            for row_num, row in enumerate(reader, 1):
                try:
                    # Extract data from CSV
                    payroll_number = row['payroll_number'].strip()
                    first_name = row['first_name'].strip()
                    last_name = row['last_name'].strip()
                    birthdate = format_date(row['birthdate'])
                    
                    # Skip if essential data is missing
                    if not payroll_number or not first_name or not last_name:
                        print(f"Warning: Skipping row {row_num} - missing essential data")
                        continue
                    
                    # Generate email if not provided
                    email = row.get('email', '').strip()
                    if not email:
                        email = None  # Set to None for NULL in SQL
                    
                    # Get phone if available
                    phone = clean_phone(row.get('phone', ''))
                    
                    # Create SQL values
                    values = []
                    values.append(f"'{payroll_number}'")  # payroll_number
                    values.append(f"'{first_name}'")      # first_name
                    values.append(f"'{last_name}'")       # last_name
                    values.append("NULL" if email is None else f"'{email}'")  # email
                    values.append(f"'{phone}'" if phone else "NULL")  # phone
                    values.append(f"'{birthdate}'" if birthdate else "NULL")  # birthdate
                    values.append(f"'{default_password_hash}'")  # password (hashed)
                    values.append("FALSE")                # password_changed
                    
                    insert_statement = f"({', '.join(values)})"
                    insert_statements.append(insert_statement)
                    
                except Exception as e:
                    print(f"Error processing row {row_num}: {e}")
                    continue
        
        if insert_statements:
            # Create the main INSERT statement
            sql_statements.append("INSERT INTO users (payroll_number, first_name, last_name, email, phone, birthdate, password, password_changed) VALUES")
            
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
        print(f"🔑 Default password for all users: 'TempPass123!'")
        print(f"📧 Email fields set to NULL - users will add emails later")
        
    except Exception as e:
        print(f"❌ Error reading CSV file: {e}")

if __name__ == "__main__":
    # File paths
    csv_file = r"c:\Users\Admin\WDP\PSB Data.csv"
    output_file = r"c:\Users\Admin\WDP\backend\database\users_insert_from_csv.sql"
    
    print("🔄 Converting CSV to SQL...")
    print(f"📁 Input file: {csv_file}")
    print(f"📁 Output file: {output_file}")
    print()
    
    convert_csv_to_sql(csv_file, output_file)
