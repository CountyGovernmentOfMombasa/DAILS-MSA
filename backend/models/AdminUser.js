const pool = require('../config/db');
const bcrypt = require('bcryptjs'); // Using bcryptjs instead of bcrypt

class AdminUser {
    constructor(data) {
        this.id = data.id;
        this.username = data.username;
        this.email = data.email;
        this.role = data.role;
        this.first_name = data.first_name;
        this.other_names = data.other_names;
        this.surname = data.surname;
    this.department = data.department;
    this.is_active = data.is_active;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_login = data.last_login;
    this.password = data.password;
    this.created_by = data.created_by;
    }
    // Find admin by username
    static async findByUsername(username) {
        try {
            const [rows] = await pool.query(
                'SELECT * FROM admin_users WHERE username = ? AND is_active = TRUE',
                [username]
            );
            return rows.length > 0 ? new AdminUser(rows[0]) : null;
        } catch (error) {
            console.error('Error finding admin by username:', error);
            throw error;
        }
    }

    // Find admin by ID
    static async findById(id) {
        try {
            const [rows] = await pool.query(
                'SELECT * FROM admin_users WHERE id = ? AND is_active = TRUE',
                [id]
            );
            return rows.length > 0 ? new AdminUser(rows[0]) : null;
        } catch (error) {
            console.error('Error finding admin by ID:', error);
            throw error;
        }
    }

    // Get all active admins
    static async getAllActive() {
        try {
            const [rows] = await pool.query(
                'SELECT id, username, email, role, department, first_name, other_names, surname, created_at, updated_at, last_login FROM admin_users WHERE is_active = TRUE ORDER BY created_at DESC'
            );
            return rows.map(row => new AdminUser(row));
        } catch (error) {
            console.error('Error getting all active admins:', error);
            throw error;
        }
    }
    // Create new admin with enhanced validation
    static async create(adminData) {
        try {
            let { username, password, email, role, department, first_name, other_names, surname, created_by, is_active } = adminData;
            // Validate role enum
            const allowedRoles = ['super_admin', 'hr_admin', 'finance_admin', 'it_admin'];
            if (!role || !allowedRoles.includes(role)) {
                role = 'hr_admin'; // default
            }
            // Default is_active to true if not provided
            if (typeof is_active === 'undefined') {
                is_active = true;
            }
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            const [result] = await pool.query(
                'INSERT INTO admin_users (username, password, email, role, department, first_name, other_names, surname, created_by, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [username, hashedPassword, email, role, department, first_name, other_names, surname, created_by, is_active]
            );
            return await AdminUser.findById(result.insertId);
        } catch (error) {
            console.error('Error creating admin:', error);
            throw error;
        }
    }

    // Update password
    async updatePassword(newPassword) {
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            await pool.query(
                'UPDATE admin_users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [hashedPassword, this.id]
            );
            
            return true;
        } catch (error) {
            console.error('Error updating admin password:', error);
            throw error;
        }
    }

    // Update last login
    async updateLastLogin() {
        try {
            await pool.query(
                'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [this.id]
            );
        } catch (error) {
            console.error('Error updating last login:', error);
            throw error;
        }
    }

    // Verify password
    async verifyPassword(password) {
        try {
            const [rows] = await pool.query(
                'SELECT password FROM admin_users WHERE id = ?',
                [this.id]
            );
            
            if (rows.length === 0) return false;
            
            return await bcrypt.compare(password, rows[0].password);
        } catch (error) {
            console.error('Error verifying password:', error);
            throw error;
        }
    }

    // Deactivate admin (soft delete)
    async deactivate() {
        try {
            await pool.query(
                'UPDATE admin_users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [this.id]
            );
            return true;
        } catch (error) {
            console.error('Error deactivating admin:', error);
            throw error;
        }
    }

    // Get admin info without password
    toJSON() {
        return {
            id: this.id,
            username: this.username,
            email: this.email,
            role: this.role,
            department: this.department,
            first_name: this.first_name,
            other_names: this.other_names,
            surname: this.surname,
            is_active: this.is_active,
            created_at: this.created_at,
            updated_at: this.updated_at,
            last_login: this.last_login
        };
    }
}

module.exports = AdminUser;
