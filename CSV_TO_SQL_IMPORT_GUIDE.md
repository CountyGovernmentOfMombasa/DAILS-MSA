# CSV to SQL Conversion - Complete Guide

## ✅ Conversion Summary
- **Input File**: PSB Data.csv (5,634 rows)
- **Output File**: `backend/database/users_insert_from_csv.sql`
- **Records Processed**: 5,631 users successfully converted
- **Default Password**: `TempPass123!` (hashed for security)
- **Email Fields**: Set to NULL - users will add emails later

## 📧 Email Information
All email fields are set to **NULL** in the database. Users can add their email addresses later through:
- User profile update functionality
- Admin panel
- Database update queries

## 🔑 Password Information
- All users have the same temporary password: **`TempPass123!`**
- Passwords are hashed for security
- `password_changed` is set to `FALSE` so users will be prompted to change their password on first login

## 📊 Data Mapping
| CSV Column | Users Table Column | Notes |
|------------|-------------------|-------|
| payroll_number | payroll_number | Unique identifier |
| first_name | first_name | Includes titles (MR, MRS, MS, MISS) |
| last_name | last_name | Employee surname |
| birthdate | birthdate | Converted from MM/DD/YYYY to YYYY-MM-DD |
| (null) | email | Set to NULL - users add later |
| phone | phone | Set to NULL (not provided in CSV) |
| (default) | password | Hashed "TempPass123!" |
| (default) | password_changed | FALSE |

## 🚀 How to Import the Data

### Method 1: Using phpMyAdmin (Recommended)
1. Open phpMyAdmin: http://localhost/phpmyadmin/
2. Select your database: `employee_declarations`
3. Click on the **SQL** tab
4. Open the file: `backend/database/users_insert_from_csv.sql`
5. Copy all content and paste it into the SQL query box
6. Click **Go** to execute

### Method 2: Using Command Line
```bash
mysql -u your_username -p employee_declarations < "c:/Users/Admin/WDP/backend/database/users_insert_from_csv.sql"
```

### Method 3: Import in Chunks (if file is too large)
If the file is too large for phpMyAdmin, you can split it into smaller chunks:
1. Open the SQL file
2. Copy the first 1000 INSERT statements
3. Execute in phpMyAdmin
4. Repeat for the remaining records

## ⚠️ Important Notes

### Before Import:
- **Backup your database** before running the import
- Ensure the `users` table exists and matches the schema
- Check for any existing data that might conflict

### After Import:
- Verify the data was imported correctly:
  ```sql
  SELECT COUNT(*) FROM users;
  SELECT * FROM users LIMIT 10;
  ```
- Test login with a sample user:
  - Payroll Number: `19870002565`
  - Password: `TempPass123!`
- Note: Users will need to add their email addresses later

### Adding Email Functionality:
Since emails are NULL, you'll want to:
1. **Create user profile update forms** where users can add their emails
2. **Add email validation** in your application
3. **Consider making email optional or required** based on your business rules
4. **Update users via admin panel** if needed

Example SQL to add emails later:
```sql
UPDATE users SET email = 'user@example.com' WHERE payroll_number = '19870002565';
```

### Data Cleanup (Optional):
You might want to clean up the names to remove titles:
```sql
UPDATE users SET 
  first_name = REPLACE(REPLACE(REPLACE(REPLACE(first_name, 'MR ', ''), 'MRS ', ''), 'MS ', ''), 'MISS ', '')
WHERE first_name LIKE 'MR %' OR first_name LIKE 'MRS %' OR first_name LIKE 'MS %' OR first_name LIKE 'MISS %';
```

## 🔧 Troubleshooting

### If you get "Duplicate entry" errors:
- Some payroll numbers or emails might already exist
- Check for duplicates:
  ```sql
  SELECT payroll_number, COUNT(*) 
  FROM users 
  GROUP BY payroll_number 
  HAVING COUNT(*) > 1;
  ```

### If you get "Data too long" errors:
- Some names might be longer than the column allows
- Check your table schema and adjust if needed

### If import is slow:
- Disable foreign key checks temporarily:
  ```sql
  SET FOREIGN_KEY_CHECKS = 0;
  -- Run your INSERT statements
  SET FOREIGN_KEY_CHECKS = 1;
  ```

## 📝 Next Steps
1. Import the data using one of the methods above
2. Test user login functionality
3. Set up password reset functionality for users
4. Consider adding email validation
5. Update user profiles with additional information as needed

## 🔄 Re-running the Converter
If you need to modify the conversion logic, you can edit the Python script at:
`c:\Users\Admin\WDP\csv_to_sql_converter.py`

Then run it again:
```bash
C:/Users/Admin/WDP/.venv/Scripts/python.exe "c:\Users\Admin\WDP\csv_to_sql_converter.py"
```
