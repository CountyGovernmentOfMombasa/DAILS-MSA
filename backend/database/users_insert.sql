-- Insert sample users data
-- Note: Passwords are hashed using bcrypt for "TempPass123!"
-- Users should change their password on first login

INSERT INTO users (payroll_number, first_name, last_name, email, phone, birthdate, password, password_changed) VALUES
('PSB001', 'John', 'Doe', 'john.doe@psb.com', '+1876-555-0001', '1985-05-15', '$2b$10$rZ8kXKKuYGLQczaYYe1w4OGK5IY4nB9ScZBHjxEn9mNlVt1CgKWmO', FALSE),
('PSB002', 'Jane', 'Smith', 'jane.smith@psb.com', '+1876-555-0002', '1990-08-22', '$2b$10$rZ8kXKKuYGLQczaYYe1w4OGK5IY4nB9ScZBHjxEn9mNlVt1CgKWmO', FALSE),
('PSB003', 'Michael', 'Johnson', 'michael.johnson@psb.com', '+1876-555-0003', '1988-12-10', '$2b$10$rZ8kXKKuYGLQczaYYe1w4OGK5IY4nB9ScZBHjxEn9mNlVt1CgKWmO', FALSE),
('PSB004', 'Sarah', 'Williams', 'sarah.williams@psb.com', '+1876-555-0004', '1992-03-18', '$2b$10$rZ8kXKKuYGLQczaYYe1w4OGK5IY4nB9ScZBHjxEn9mNlVt1CgKWmO', FALSE),
('PSB005', 'Robert', 'Brown', 'robert.brown@psb.com', '+1876-555-0005', '1987-11-25', '$2b$10$rZ8kXKKuYGLQczaYYe1w4OGK5IY4nB9ScZBHjxEn9mNlVt1CgKWmO', FALSE);

-- To add more users, follow this pattern:
-- ('PAYROLL_NUM', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'YYYY-MM-DD', 'HASHED_PASSWORD', FALSE),

-- Notes:
-- 1. Payroll numbers should be unique
-- 2. Email addresses should be unique
-- 3. Birthdate format: YYYY-MM-DD
-- 4. Phone numbers can include country code
-- 5. Passwords are hashed - the example uses hash for "TempPass123!"
-- 6. password_changed is set to FALSE so users are prompted to change password on first login
