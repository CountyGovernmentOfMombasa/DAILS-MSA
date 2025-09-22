-- Email Management Utility Queries
-- Use these queries for database administration and email management

SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as users_with_email,
    COUNT(CASE WHEN email IS NULL OR email = '' THEN 1 END) as users_without_email,
    ROUND((COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) * 100.0 / COUNT(*)), 2) as completion_percentage
FROM users;

SELECT 
    national_id,
    surname,
    first_name,
    other_names,
    created_at
FROM users 
WHERE email IS NULL OR email = ''
ORDER BY national_id;

SELECT 
    email,
    COUNT(*) as count,
    GROUP_CONCAT(national_id) as national_ids
FROM users 
WHERE email IS NOT NULL AND email != ''
GROUP BY email 
HAVING COUNT(*) > 1;

SELECT 
    department,
    COUNT(*) as total_users,
    COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as users_with_email,
    ROUND((COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) * 100.0 / COUNT(*)), 2) as completion_percentage
FROM users 
GROUP BY department
ORDER BY completion_percentage DESC;

SELECT 
    national_id,
    surname,
    first_name,
    other_names,
    email
FROM users 
WHERE email IS NOT NULL 
AND email != ''
AND email NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';

SELECT 
    national_id,
    surname,
    first_name,
    other_names,
    email,
    updated_at
FROM users 
WHERE email IS NOT NULL 
AND updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY updated_at DESC;

SELECT 
    national_id as 'National ID',
    surname as 'Surname',
    first_name as 'First Name',
    other_names as 'Other Names',
    birthdate as 'Birth Date',
    created_at as 'Member Since'
FROM users 
WHERE email IS NULL OR email = ''
ORDER BY national_id;

ALTER TABLE users ADD CONSTRAINT chk_email_format 
CHECK (email IS NULL OR email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
