-- Employee Declaration System Database Schema

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_number VARCHAR(50) UNIQUE NOT NULL,
    surname VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    other_names VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    birthdate DATE NOT NULL,
    password VARCHAR(255) NOT NULL,
    password_changed BOOLEAN DEFAULT FALSE,
    national_id VARCHAR(20),
    place_of_birth VARCHAR(100),
    marital_status VARCHAR(20),
    postal_address VARCHAR(200),
    physical_address VARCHAR(200),
    designation VARCHAR(100),
    department ENUM(
        'Executive',
        'Department of Public Service Administration, Youth, Gender and Sports',
        'Department of Blue Economy, Cooperatives, Agriculture and Livestock',
        'Department of Environment and Water',
        'Department of Transport, Infrastructure and Governance',
        'Department of Climate Change, Energy and Natural Resources',
        'Department of Lands, Urban Planning, Housing and Serikali Mtaani',
        'Department of Education and Vocational Training',
        'Department of Finance, Economic Planning and Digital Transformation',
        'Department of Health',
        'Department of Trade, Tourism and Culture',
        'Mombasa County Public Service Board'
    ) DEFAULT NULL,
    sub_department VARCHAR(150),
    nature_of_employment ENUM('Permanent', 'Contract', 'Temporary', 'Casual'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE declarations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    marital_status ENUM('single', 'married', 'divorced', 'widowed', 'separated') NOT NULL,
    declaration_type ENUM('First','Biennial','Final') NOT NULL,
    period_start_date DATE NULL,
    period_end_date DATE NULL,
    declaration_date DATE NOT NULL,
    period_start_date DATE NULL,
    period_end_date DATE NULL,
    biennial_income JSON,
    assets JSON NULL,
    liabilities JSON NULL,
    other_financial_info TEXT,
    -- signature_path repurposed as boolean flag (1 = employee declaration signed). If a file path is required in future, add signature_file_path.
    signature_path TINYINT(1) DEFAULT 0,
    witness_signed TINYINT(1) DEFAULT 0,
    witness_name VARCHAR(100),
    witness_address VARCHAR(200),
    witness_phone VARCHAR(20),
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    correction_message TEXT NULL,
    submitted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_decl_user_date (user_id,declaration_date)
);

CREATE TABLE declaration_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    declaration_id INT NOT NULL,
    user_id INT NOT NULL,
    action ENUM('CREATE','UPDATE','DELETE') NOT NULL DEFAULT 'UPDATE',
    diff JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_decl_audit_decl (declaration_id)
);

-- Audit log for declaration status changes (admin actions approve/reject)
CREATE TABLE declaration_status_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    declaration_id INT NOT NULL,
    admin_id INT NULL,
    previous_status ENUM('pending','approved','rejected') NULL,
    new_status ENUM('pending','approved','rejected') NOT NULL,
    previous_correction_message TEXT NULL,
    new_correction_message TEXT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_decl_status_audit_decl (declaration_id),
    INDEX idx_decl_status_audit_admin (admin_id)
);

-- Partial PATCH audit trail
CREATE TABLE declaration_patch_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        declaration_id INT NOT NULL,
        user_id INT NOT NULL,
        changed_scalar_fields JSON NULL,
        replaced_collections JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_decl_patch_audit_decl (declaration_id)
);

-- User edit requests
CREATE TABLE declaration_edit_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    declarationId INT NOT NULL,
    userId INT NOT NULL,
    reason TEXT NOT NULL,
    requestedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (declarationId) REFERENCES declarations(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_decl_edit_req_decl (declarationId)
);

-- Spouses table
CREATE TABLE spouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    declaration_id INT NOT NULL,
    surname VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    other_names VARCHAR(100),
    full_name VARCHAR(200) NOT NULL,
    biennial_income JSON,
    assets TEXT,
    liabilities TEXT,
    other_financial_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE
);

-- Children table
CREATE TABLE children (
    id INT AUTO_INCREMENT PRIMARY KEY,
    declaration_id INT NOT NULL,
    surname VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    other_names VARCHAR(100),
    full_name VARCHAR(200) NOT NULL,
    biennial_income JSON,
    assets TEXT,
    liabilities TEXT,
    other_financial_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX idx_users_payroll ON users(payroll_number);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_declarations_user ON declarations(user_id);
CREATE INDEX idx_declarations_date ON declarations(declaration_date);
CREATE INDEX idx_spouses_declaration ON spouses(declaration_id);
CREATE INDEX idx_children_declaration ON children(declaration_id);

-- Admin users (baseline added to avoid reliance on ad-hoc creation script)
CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(150),
        role ENUM('super_admin','hr_admin','finance_admin','it_admin') NOT NULL DEFAULT 'hr_admin',
        first_name VARCHAR(100),
        other_names VARCHAR(100),
        surname VARCHAR(100),
        department VARCHAR(150),
        sub_department VARCHAR(150),
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        created_by INT NULL,
        INDEX idx_admin_username (username),
        INDEX idx_admin_role (role),
        INDEX idx_admin_active (is_active)
);

-- Settings (declaration locks)
CREATE TABLE IF NOT EXISTS settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    biennial_declaration_locked TINYINT(1) DEFAULT 0,
    first_declaration_locked TINYINT(1) DEFAULT 0,
    final_declaration_locked TINYINT(1) DEFAULT 0
);
INSERT INTO settings (biennial_declaration_locked, first_declaration_locked, final_declaration_locked)
SELECT 0,0,0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM settings);

-- User progress (draft save state)
CREATE TABLE IF NOT EXISTS user_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    user_key VARCHAR(255) NOT NULL,
    data JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_progress (user_id, user_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password history to prevent reuse
CREATE TABLE IF NOT EXISTS user_password_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_uph_user_created (user_id, created_at)
);
CREATE TABLE IF NOT EXISTS admin_password_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    INDEX idx_aph_admin_created (admin_id, created_at)
);

-- Patch audit (partial updates)
CREATE TABLE IF NOT EXISTS declaration_patch_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    declaration_id INT NOT NULL,
    user_id INT NOT NULL,
    changed_scalar_fields JSON NULL,
    replaced_collections JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_patch_decl (declaration_id)
);

