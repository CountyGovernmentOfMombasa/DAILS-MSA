-- Admin Users upsert generated from CSV on 2025-11-01
-- Default password hash corresponds to the commonly used placeholder password; change passwords post-import.
-- Ensure we target the correct database/schema for temp tables and inserts
USE employee_declarations;
START TRANSACTION;

-- Use a temporary table so we can safely join to users; if a user_id doesn't exist, we set it to NULL to satisfy FK.
CREATE TEMPORARY TABLE IF NOT EXISTS tmp_admin_import_20251101 (
  tmp_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NULL,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(150) NULL,
  role ENUM('super_admin','hr_admin','it_admin') NOT NULL,
  first_name VARCHAR(100),
  surname VARCHAR(100),
  department VARCHAR(150) NULL,
  sub_department VARCHAR(150) NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_by INT NULL,
  PRIMARY KEY (tmp_id)
);

INSERT INTO tmp_admin_import_20251101 (user_id, username, password, email, role, first_name, surname, department, sub_department, is_active, created_by)
VALUES
  (2204, 'Cynthia', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Cynthia', 'Dzilla', 'Executive', 'Office of the Governor', 1, 1),
  (2163, 'Kinana', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Kinana', 'Juma', 'Executive', 'Office of the Governor', 1, 1),
  (2730, 'Florence', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Florence', 'Mwilole', 'Executive', 'Office of the Governor', 1, 1),
  (1090, 'Joab', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Joab', 'Unda', 'Executive', 'Office of the County Secretary', 1, 1),
  (4148, 'Hussein', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Hussein', 'S.', 'Executive', 'Office of the County Secretary', 1, 1),
  (4760, 'James', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'James', 'Mwanza', 'Executive', 'Office of the County Attorney', 1, 1),
  (2012, 'Joseph', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Joseph', 'Atunda', 'Executive', 'Office of the County Attorney', 1, 1),
  (3150, 'Leah', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Leah', 'Akinyi', 'Finance, Economic Planning & Digital Transformation', 'Finance & Investment', 1, 1),
  (2162, 'Kaltuma', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Kaltuma', 'Ahmed', 'Finance, Economic Planning & Digital Transformation', 'Finance & Investment', 1, 1),
  (2236, 'Omar', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Omar', 'Mahmoud', 'Finance, Economic Planning & Digital Transformation', 'Finance & Investment', 1, 1),
  (3936, 'Fauzia', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Fauzia', 'Mohamed', 'Finance, Economic Planning & Digital Transformation', 'Finance & Investment', 1, 1),
  (4766, 'Abdirazak', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Abdirazak', 'Abdikadir', 'Finance, Economic Planning & Digital Transformation', 'Economic Planning & Digital Transformation', 1, 1),
  (4846, 'Halima', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Halima', 'Hussein', 'Finance, Economic Planning & Digital Transformation', 'Economic Planning & Digital Transformation', 1, 1),
  (4759, 'Adhan', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Adhan', 'Kuso', 'Finance, Economic Planning & Digital Transformation', 'Economic Planning & Digital Transformation', 1, 1),
  (4406, 'Everlyne', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Everlyne', 'Owour', 'Cooperatives', 'Mombasa Water Supply & Sanitation Company Limited (MOWASSCO)', 1, 1),
  (6010, 'Laban', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Laban', 'Ainga', 'Cooperatives', 'Mombasa Water Supply & Sanitation Company Limited (MOWASSCO)', 1, 1),
  (6246, 'Edwin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Edwin', 'Mwale', 'Cooperatives', 'Mombasa Water Supply & Sanitation Company Limited (MOWASSCO)', 1, 1),
  (4774, 'Angela', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Angela', 'Oseko', 'Cooperatives', 'Mombasa Investment Corporation (MIC)', 1, 1),
  (1826, 'Athman', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Athman', 'Matano', 'Department of Public Service Administration, Youth, Gender and Sports', 'Public Service Administration', 1, 1),
  (2906, 'Maryam', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Maryam', 'Abdillahi', 'Department of Public Service Administration, Youth, Gender and Sports', 'Public Service Administration', 1, 1),
  (4980, 'Diana', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Diana', 'Gabriel', 'Department of Public Service Administration, Youth, Gender and Sports', 'Public Service Administration', 1, 1),
  (2201, 'Sophie', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Sophie', 'Ismail', 'Department of Health', 'Public Health & Disease Prevention', 1, 1),
  (246, 'Lucy', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Lucy', 'Nyambura', 'Department of Health', 'Public Health & Disease Prevention', 1, 1),
  (3164, 'Sumeiya', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Sumeiya', 'Hussein', 'Department of Health', 'Public Health & Disease Prevention', 1, 1),
  (2263, 'Suleiman', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Suleiman', 'Mohammed', 'Department of Health', 'Clinical Services', 1, 1),
  (58, 'Esha', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Esha', 'Swaleh', 'Department of Health', 'Clinical Services', 1, 1),
  (4841, 'Ibrahim', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Ibrahim', 'Farhad', 'Department of Health', 'Clinical Services', 1, 1),
  (492, 'Lilian', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Lilian', 'Wachuka', 'Department of Health', 'Coast General Teaching And Referral Hospital (CGTRH)', 1, 1),
  (2628, 'Daniel', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Daniel', 'Chai', 'Department of Health', 'Coast General Teaching And Referral Hospital (CGTRH)', 1, 1),
  (5071, 'Jessica', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Jessica', 'Judith', 'Department of Health', 'Coast General Teaching And Referral Hospital (CGTRH)', 1, 1),
  (6428, 'Yahya', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Yahya', 'Abeid', 'Department of Health', 'Coast General Teaching And Referral Hospital (CGTRH)', 1, 1),
  (6338, 'Mohamed', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Mohamed', 'Shuaib', 'Department of Health', 'Coast General Teaching And Referral Hospital (CGTRH)', 1, 1),
  (474, 'Nancy', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Nancy', 'Wairimu', 'Department of Health', 'Clinical Services', 1, 1),
  (685, 'Roselyne', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Roselyne', 'Wangari', 'Department of Health', 'Clinical Services', 1, 1),
  (463, 'Cecilia', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Cecilia', 'Kajumwa', 'Department of Health', 'Clinical Services', 1, 1),
  (3479, 'Ifdhel', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Ifdhel', 'Badi', 'Department of Health', 'Clinical Services', 1, 1),
  (684, 'Phelisters', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Phelisters', 'Ngare', 'Department of Health', 'Clinical Services', 1, 1),
  (5724, 'Saadia', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Saadia', 'Abdi', 'Department of Health', 'Clinical Services', 1, 1),
  (5739, 'Ali', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Ali', 'Abdusalam', 'Department of Health', 'Clinical Services', 1, 1),
  (5198, 'Athman2', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Athman', 'Rajab', 'Department of Health', 'Clinical Services', 1, 1),
  (5752, 'Salma', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Salma', 'Ali', 'Department of Health', 'Clinical Services', 1, 1),
  (5717, 'Amina', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Amina', 'Ali', 'Department of Health', 'Clinical Services', 1, 1),
  (5055, 'Henrita', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Henrita', 'Shali', 'Department of Health', 'Clinical Services', 1, 1),
  (3492, 'Barrau', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Barrau', 'M', 'Department of Health', 'Clinical Services', 1, 1),
  (3832, 'Raymond', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Raymond', 'N.', 'Department of Public Service Administration, Youth, Gender and Sports', 'Youth, Gender, Sports & Social Services', 1, 1),
  (4094, 'Fatma', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Fatma', 'S.', 'Department of Public Service Administration, Youth, Gender and Sports', 'Youth, Gender, Sports & Social Services', 1, 1),
  (2978, 'Julie', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Julie', 'Omondi', 'Department of Public Service Administration, Youth, Gender and Sports', 'Youth, Gender, Sports & Social Services', 1, 1),
  (3932, 'Ambrose', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Ambrose', 'Kelle', 'Department of Transport, Infrastructure & Governance', 'Governance', 1, 1),
  (5040, 'Hannan', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Hannan', 'Abdun', 'Department of Transport, Infrastructure & Governance', 'Governance', 1, 1),
  (3790, 'Brian', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Brian', 'Email', 'Department of Transport, Infrastructure & Governance', 'Governance', 1, 1),
  (1670, 'Kennedy', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Kennedy', 'Asati', 'Department of Transport, Infrastructure & Governance', 'Transport & Infrastructure', 1, 1),
  (2943, 'Ruth', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Ruth', 'Akeyo', 'Department of Transport, Infrastructure & Governance', 'Transport & Infrastructure', 1, 1),
  (5115, 'Maimuna', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Maimuna', 'Abdi', 'Department of Transport, Infrastructure & Governance', 'Transport & Infrastructure', 1, 1),
  (1306, 'Hashora', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Hashora', 'Morowa', 'Department of Lands, Urban Planning and Housing', 'Lands, Urban Planning and Housing', 1, 1),
  (1095, 'Bakari', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Bakari', 'Hamisi', 'Department of Lands, Urban Planning and Housing', 'Lands, Urban Planning and Housing', 1, 1),
  (1279, 'Neema', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Neema', 'Mwidani', 'Department of Lands, Urban Planning and Housing', 'Lands, Urban Planning and Housing', 1, 1),
  (2562, 'Ahmed', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Ahmed', 'Al-Amin', 'Department of Lands, Urban Planning and Housing', 'Serikali Mitaani', 1, 1),
  (4703, 'AbdulRahman', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'AbdulRahman', 'Kassim', 'Department of Lands, Urban Planning and Housing', 'Serikali Mitaani', 1, 1),
  (4346, 'Abdillatif', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Abdillatif', 'Abdisalan', 'Department of Lands, Urban Planning and Housing', 'Serikali Mitaani', 1, 1),
  (2288, 'Harun', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Harun', 'Iddi', 'Department of Education & Vocational Training', 'Department of Education & Vocational Training', 1, 1),
  (2629, 'Amina2', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Amina', 'Shee', 'Department of Education & Vocational Training', 'Department of Education & Vocational Training', 1, 1),
  (2015, 'Florence2', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Florence', 'Kache', 'Department of Education & Vocational Training', 'Department of Education & Vocational Training', 1, 1),
  (2868, 'Nasra', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Nasra', 'Mohamed', 'Department of  Trade, Tourism and Culture', 'Department of  Trade, Tourism and Culture', 1, 1),
  (2254, 'Amal', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Amal', 'Mohamed', 'Department of  Trade, Tourism and Culture', 'Department of  Trade, Tourism and Culture', 1, 1),
  (4909, 'Alexander', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Alexander', 'Kangentu', 'Department of  Trade, Tourism and Culture', 'Department of  Trade, Tourism and Culture', 1, 1),
  (4240, 'Salwa', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Salwa', 'Said', 'Department of Climate Change, Energy and Natural Resources', 'Department of Climate Change, Energy and Natural Resources', 1, 1),
  (2303, 'Amina3', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Amina', 'Walegwa', 'Department of Climate Change, Energy and Natural Resources', 'Department of Climate Change, Energy and Natural Resources', 1, 1),
  (4190, 'Mohammed', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Mohammed', 'Mwachiro', 'Department of Climate Change, Energy and Natural Resources', 'Department of Climate Change, Energy and Natural Resources', 1, 1),
  (4763, 'Habon', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Habon', 'Mohamed', 'Department of Environment and Water', 'Environment and Solid Waste Management', 1, 1),
  (4473, 'Kevin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Kevin', 'Ouma', 'Department of Environment and Water', 'Environment and Solid Waste Management', 1, 1),
  (4199, 'Aisha', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Aisha', 'Mohamed', 'Department of Environment and Water', 'Environment and Solid Waste Management', 1, 1),
  (4683, 'John', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'John', 'Xavier', 'Department of Environment and Water', 'Water and Sanitation', 1, 1),
  (1327, 'Nixon', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Nixon', 'Kilukumi', 'Department of Environment and Water', 'Water and Sanitation', 1, 1),
  (4507, 'Bramwel', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Bramwel', 'Wanami', 'Department of Environment and Water', 'Water and Sanitation', 1, 1),
  (532, 'Abigael', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Abigael', 'Andanje', 'Department of Blue Economy, Cooperatives, Agriculture and Livestock', 'Department of Blue Economy, Cooperatives, Agriculture and Livestock', 1, 1),
  (4502, 'Lydia', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Lydia', 'Michira', 'Department of Blue Economy, Cooperatives, Agriculture and Livestock', 'Department of Blue Economy, Cooperatives, Agriculture and Livestock', 1, 1),
  (2675, 'Takash', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Takash', 'Mahfudh', 'Department of Blue Economy, Cooperatives, Agriculture and Livestock', 'Department of Blue Economy, Cooperatives, Agriculture and Livestock', 1, 1),
  (1667, 'Sheba', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Sheba', 'Fakih', 'Mombasa County Public Service Board', 'Mombasa County Public Service Board', 1, 1),
  (2695, 'Andrew', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Andrew', 'Muasya', 'Mombasa County Public Service Board', 'Mombasa County Public Service Board', 1, 1),
  (2846, 'Joan', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'hr_admin', 'Joan', 'Phidiliah', 'Mombasa County Public Service Board', 'Mombasa County Public Service Board', 1, 1),
  (3163, 'Swaleh', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'it_admin', 'Swaleh', 'Bakari', NULL, NULL, 1, 1),
  (5901, 'Saleh', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'it_admin', 'Saleh', 'Ali', NULL, NULL, 1, 1),
  (5896, 'Mariam', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'it_admin', 'Mariam', 'Jamal', NULL, NULL, 1, 1),
  (4878, 'Samuel', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'it_admin', 'Samuel', 'Mwanjala', NULL, NULL, 1, 1),
  (1143, 'Ahmed2', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'it_admin', 'Ahmed', 'Abushiri', NULL, NULL, 1, 1),
  (4187, 'JamesT', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'it_admin', 'James', 'Tayo', NULL, NULL, 1, 1),
  (2500, 'Anastansia', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', NULL, 'super_admin', 'Anastansia', 'Nabukenya', NULL, NULL, 1, 1);

INSERT INTO admin_users (user_id, username, password, email, role, first_name, surname, department, sub_department, is_active, created_by)
SELECT 
  u.id AS user_id,
  t.username,
  t.password,
  t.email,
  t.role,
  t.first_name,
  t.surname,
  CASE 
    WHEN t.department IS NULL OR t.department = '-' OR TRIM(t.department) = '' THEN NULL 
    ELSE TRIM(t.department) 
  END AS department,
  CASE 
    WHEN t.sub_department IS NULL OR t.sub_department = '-' OR TRIM(t.sub_department) = '' THEN '' 
    ELSE TRIM(t.sub_department) 
  END AS sub_department,
  t.is_active,
  t.created_by
FROM tmp_admin_import_20251101 t
LEFT JOIN users u ON u.id = t.user_id
ON DUPLICATE KEY UPDATE
  user_id = IFNULL(VALUES(user_id), admin_users.user_id),
  role = VALUES(role),
  first_name = VALUES(first_name),
  surname = VALUES(surname),
  department = VALUES(department),
  sub_department = VALUES(sub_department),
  is_active = VALUES(is_active);

DROP TEMPORARY TABLE IF EXISTS tmp_admin_import_20251101;

COMMIT;
