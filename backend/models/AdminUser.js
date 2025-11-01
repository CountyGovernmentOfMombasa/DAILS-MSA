const pool = require('../config/db');
const bcrypt = require('bcryptjs');

class AdminUser {
    constructor(data) {
        this.id = data.id;
        this.username = data.username;
        this.email = data.email;
        this.role = data.role;
        this.first_name = data.first_name;
        this.other_names = Object.prototype.hasOwnProperty.call(data, 'other_names') ? data.other_names : null;
        this.surname = data.surname || data.last_name || null;
        this.department = data.department || null;
    this.sub_department = data.sub_department || data.subDepartment || null;
    // Linkage fields (may be absent in legacy rows)
    this.user_id = Object.prototype.hasOwnProperty.call(data, 'user_id') ? data.user_id : null;
    this.linked_national_id = data.linked_national_id || data.national_id || null;
    this.linked_user_email = data.linked_user_email || data.user_email || null;
        this.is_active = data.is_active;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
        this.last_login = data.last_login;
        this.password = data.password;
        this.created_by = data.created_by;
    }

    static async findByUsername(username) {
        try {
            const [rows] = await pool.query('SELECT * FROM admin_users WHERE username = ? AND is_active = TRUE', [username]);
            return rows.length > 0 ? new AdminUser(rows[0]) : null;
        } catch (error) {
            console.error('Error finding admin by username:', error);
            throw error;
        }
    }

    static async findById(id) {
        try {
            const [rows] = await pool.query('SELECT * FROM admin_users WHERE id = ? AND is_active = TRUE', [id]);
            return rows.length > 0 ? new AdminUser(rows[0]) : null;
        } catch (error) {
            console.error('Error finding admin by ID:', error);
            throw error;
        }
    }

    static async findByUserId(userId) {
        try {
            const [rows] = await pool.query('SELECT * FROM admin_users WHERE user_id = ? AND is_active = TRUE', [userId]);
            return rows.length > 0 ? new AdminUser(rows[0]) : null;
        } catch (error) {
            console.error('Error finding admin by user_id:', error);
            throw error;
        }
    }

    static async getAllActive() {
        // Try modern schema, fall back progressively
        const attempts = [
            // Preferred: include linkage + joined user snapshot
            `SELECT au.id, au.username, au.email, au.role, au.department, au.sub_department, au.first_name, au.other_names, au.surname, au.created_at, au.updated_at, au.last_login, au.user_id,
                    u.national_id AS linked_national_id, u.email AS linked_user_email
               FROM admin_users au
               LEFT JOIN users u ON au.user_id = u.id
              WHERE au.is_active = TRUE
              ORDER BY au.created_at DESC`,
            'SELECT id, username, email, role, department, sub_department, first_name, other_names, surname, created_at, updated_at, last_login FROM admin_users WHERE is_active = TRUE ORDER BY created_at DESC',
            'SELECT id, username, email, role, department, first_name, last_name, created_at, updated_at, last_login FROM admin_users WHERE is_active = TRUE ORDER BY created_at DESC',
            'SELECT id, username, email, role, first_name, last_login, created_at, updated_at, last_name FROM admin_users WHERE is_active = TRUE ORDER BY created_at DESC' // last fallback (no department)
        ];
        for (let i = 0; i < attempts.length; i++) {
            try {
                const [rows] = await pool.query(attempts[i]);
                return rows.map(r => new AdminUser(r));
            } catch (err) {
                if (!(err && err.code === 'ER_BAD_FIELD_ERROR') || i === attempts.length - 1) {
                    console.error('getAllActive attempt failed (index', i, '):', err.message);
                    if (i === attempts.length - 1) throw err;
                } else {
                    // try next
                    continue;
                }
            }
        }
        return [];
    }

    static async create(adminData) {
        try {
            let { username, password, email, role, department, sub_department, first_name, other_names, surname, created_by, is_active, user_id } = adminData;
            const allowedRoles = ['super_admin', 'hr_admin', 'it_admin'];
            if (!role || !allowedRoles.includes(role)) role = 'hr_admin';
            if (typeof is_active === 'undefined') is_active = true;
            const hashedPassword = await bcrypt.hash(password, 10);

            const insertAttempts = [
                // New preferred schema including user_id + sub_department + other_names + surname
                {
                    sql: 'INSERT INTO admin_users (username, password, email, role, department, sub_department, first_name, other_names, surname, created_by, is_active, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    params: [username, hashedPassword, email, role, department, (sub_department || 'Unknown'), first_name, other_names, surname, created_by, is_active, user_id || null]
                },
                {
                    sql: 'INSERT INTO admin_users (username, password, email, role, department, sub_department, first_name, other_names, surname, created_by, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    params: [username, hashedPassword, email, role, department, (sub_department || 'Unknown'), first_name, other_names, surname, created_by, is_active]
                },
                {
                    sql: 'INSERT INTO admin_users (username, password, email, role, department, first_name, last_name, created_by, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    params: [username, hashedPassword, email, role, department, first_name, surname, created_by, is_active]
                },
                {
                    sql: 'INSERT INTO admin_users (username, password, email, role, first_name, last_login, created_at, updated_at, last_name, is_active) VALUES (?, ?, ?, ?, ?, NULL, NOW(), NOW(), ?, ?)',
                    params: [username, hashedPassword, email, role, first_name, surname, is_active]
                }
            ];

            for (let i = 0; i < insertAttempts.length; i++) {
                const attempt = insertAttempts[i];
                try {
                    const [result] = await pool.query(attempt.sql, attempt.params);
                    return await AdminUser.findById(result.insertId);
                } catch (err) {
                    if (!(err && err.code === 'ER_BAD_FIELD_ERROR') || i === insertAttempts.length - 1) {
                        console.error('Create admin attempt failed (index', i, '):', err.message);
                        if (i === insertAttempts.length - 1) throw err;
                    } else {
                        continue; // try next variant
                    }
                }
            }
            throw new Error('Unable to insert admin with available schema variations');
        } catch (error) {
            console.error('Error creating admin:', error);
            throw error;
        }
    }

    async updatePassword(newPassword) {
        try {
            // Fetch current hash for history & reuse checks
            const [cur] = await pool.query('SELECT password FROM admin_users WHERE id = ?', [this.id]);
            if (!cur.length) throw new Error('Admin not found for password update');
            const currentHash = cur[0].password;
            // Load last N (including current) from history + current
            const HISTORY_LIMIT = 5; // configurable
            const [hist] = await pool.query('SELECT password_hash FROM admin_password_history WHERE admin_id = ? ORDER BY created_at DESC LIMIT ?', [this.id, HISTORY_LIMIT]);
            // Compare new password against history
            for (const row of hist) {
                const matchPrev = await bcrypt.compare(newPassword, row.password_hash);
                if (matchPrev) {
                    throw new Error('Cannot reuse a recent password');
                }
            }
            // Also compare with current
            const reuseCurrent = await bcrypt.compare(newPassword, currentHash);
            if (reuseCurrent) throw new Error('Cannot reuse a recent password');

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await pool.query('UPDATE admin_users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hashedPassword, this.id]);
            // Insert old hash into history (only if we had one and different)
            if (currentHash && currentHash !== hashedPassword) {
                await pool.query('INSERT INTO admin_password_history (admin_id, password_hash) VALUES (?, ?)', [this.id, currentHash]);
            }
            // Enforce history limit (keep only last HISTORY_LIMIT)
            await pool.query('DELETE FROM admin_password_history WHERE admin_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM admin_password_history WHERE admin_id = ? ORDER BY created_at DESC LIMIT ?) x)', [this.id, this.id, HISTORY_LIMIT]);
            return true;
        } catch (error) {
            console.error('Error updating admin password:', error);
            throw error;
        }
    }

    async updateLastLogin() {
        try {
            await pool.query('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [this.id]);
        } catch (error) {
            console.error('Error updating last login:', error);
            throw error;
        }
    }

    async verifyPassword(password) {
        try {
            const [rows] = await pool.query('SELECT password FROM admin_users WHERE id = ?', [this.id]);
            if (rows.length === 0) return false;
            return await bcrypt.compare(password, rows[0].password);
        } catch (error) {
            console.error('Error verifying password:', error);
            throw error;
        }
    }

    async deactivate() {
        try {
            await pool.query('UPDATE admin_users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [this.id]);
            return true;
        } catch (error) {
            console.error('Error deactivating admin:', error);
            throw error;
        }
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            email: this.email,
            role: this.role,
            department: this.department,
            sub_department: this.sub_department,
            first_name: this.first_name,
            other_names: this.other_names,
            surname: this.surname,
            is_active: this.is_active,
            created_at: this.created_at,
            updated_at: this.updated_at,
            last_login: this.last_login
            ,user_id: this.user_id
            ,linked_national_id: this.linked_national_id
            ,linked_user_email: this.linked_user_email
        };
    }
}

module.exports = AdminUser;
