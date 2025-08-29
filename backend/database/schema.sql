-- Employee Declaration System Database Schema

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payroll_number VARCHAR(50) UNIQUE NOT NULL,
    surname VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    other_names VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    birthdate DATE NOT NULL,
    password VARCHAR(255) NOT NULL,
    password_changed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Declarations table
CREATE TABLE declarations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    marital_status ENUM('single', 'married', 'divorced', 'widowed', 'separated') NOT NULL,
    declaration_date DATE NOT NULL,
    annual_income DECIMAL(15, 2),
    assets TEXT,
    liabilities TEXT,
    other_financial_info TEXT,
    signature_path VARCHAR(500),
    witness_signed TINYINT(1) DEFAULT 0,
    witness_name VARCHAR(100),
    witness_address VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Spouses table
CREATE TABLE spouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    declaration_id INT NOT NULL,
    surname VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    other_names VARCHAR(100),
    full_name VARCHAR(200) NOT NULL,
    annual_income DECIMAL(15, 2),
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
    annual_income DECIMAL(15, 2),
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
