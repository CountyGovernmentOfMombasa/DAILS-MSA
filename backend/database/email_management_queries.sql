-- Email Management Utility Queries
-- Use these queries for database administration and email management

-- 1. Check email completion statistics
SELECT 
    COUNT(*) as total_users,
    COUNT(email) as users_with_email,
    COUNT(*) - COUNT(email) as users_without_email,
    ROUND((COUNT(email) * 100.0 / COUNT(*)), 2) as completion_percentage
FROM users;

-- 2. Find users without email addresses
SELECT 
    payroll_number,
    first_name,
    last_name,
    created_at
FROM users 
WHERE email IS NULL OR email = ''
ORDER BY payroll_number;

-- 3. Find duplicate email addresses
SELECT 
    email,
    COUNT(*) as count,
    GROUP_CONCAT(payroll_number) as payroll_numbers
FROM users 
WHERE email IS NOT NULL AND email != ''
GROUP BY email 
HAVING COUNT(*) > 1;

-- 4. Update email for specific user
UPDATE users 
SET email = 'user@example.com', updated_at = CURRENT_TIMESTAMP 
WHERE payroll_number = '19870002565';

-- 5. Bulk generate emails with pattern (use with caution)
UPDATE users 
SET email = CONCAT(
    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(first_name, 'MR ', ''), 'MRS ', ''), 'MS ', ''), 'MISS ', '')),
    '.',
    LOWER(REPLACE(last_name, ' ', '.')),
    '@psb.gov.ke'
),
updated_at = CURRENT_TIMESTAMP
WHERE email IS NULL OR email = '';

-- 6. Clear all email addresses (for testing)
-- UPDATE users SET email = NULL WHERE email IS NOT NULL;

-- 7. Find users by email domain
SELECT 
    payroll_number,
    first_name,
    last_name,
    email
FROM users 
WHERE email LIKE '%@psb.gov.ke'
ORDER BY email;

-- 8. Get email completion by department (if you have department data)
SELECT 
    SUBSTRING_INDEX(payroll_number, '', 4) as dept_code,
    COUNT(*) as total_users,
    COUNT(email) as users_with_email,
    ROUND((COUNT(email) * 100.0 / COUNT(*)), 2) as completion_percentage
FROM users 
GROUP BY SUBSTRING_INDEX(payroll_number, '', 4)
ORDER BY completion_percentage DESC;

-- 9. Find users with invalid email formats
SELECT 
    payroll_number,
    first_name,
    last_name,
    email
FROM users 
WHERE email IS NOT NULL 
AND email != ''
AND email NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';

-- 10. Recent email updates
SELECT 
    payroll_number,
    first_name,
    last_name,
    email,
    updated_at
FROM users 
WHERE email IS NOT NULL 
AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY updated_at DESC;

-- 11. Export users without emails (for CSV export)
SELECT 
    payroll_number as 'Payroll Number',
    first_name as 'First Name',
    last_name as 'Last Name',
    birthdate as 'Birth Date',
    created_at as 'Member Since'
FROM users 
WHERE email IS NULL OR email = ''
ORDER BY payroll_number;

-- 12. Validate email uniqueness before bulk update
SELECT email, COUNT(*) 
FROM (
    SELECT CONCAT(
        LOWER(REPLACE(REPLACE(REPLACE(REPLACE(first_name, 'MR ', ''), 'MRS ', ''), 'MS ', ''), 'MISS ', '')),
        '.',
        LOWER(REPLACE(last_name, ' ', '.')),
        '@psb.gov.ke'
    ) as email
    FROM users 
    WHERE email IS NULL OR email = ''
) as generated_emails
GROUP BY email 
HAVING COUNT(*) > 1;

-- 13. Add email validation constraints (run once)
-- ALTER TABLE users ADD CONSTRAINT chk_email_format 
-- CHECK (email IS NULL OR email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- 14. Create index for email searches (run once for performance)
-- CREATE INDEX idx_users_email_search ON users(email);

-- 15. Backup users with emails before making changes
-- CREATE TABLE users_email_backup AS 
-- SELECT id, payroll_number, email, updated_at 
-- FROM users 
-- WHERE email IS NOT NULL;

-- 16. Restore emails from backup (if needed)
-- UPDATE users u
-- JOIN users_email_backup b ON u.id = b.id
-- SET u.email = b.email, u.updated_at = b.updated_at;

-- 17. Generate unique emails for duplicates
SET @counter = 0;
UPDATE users 
SET email = CONCAT(
    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(first_name, 'MR ', ''), 'MRS ', ''), 'MS ', ''), 'MISS ', '')),
    '.',
    LOWER(REPLACE(last_name, ' ', '.')),
    CASE 
        WHEN (@counter := @counter + 1) = 1 THEN ''
        ELSE CONCAT(@counter - 1)
    END,
    '@psb.gov.ke'
),
updated_at = CURRENT_TIMESTAMP
WHERE email IS NULL OR email = ''
ORDER BY payroll_number;
