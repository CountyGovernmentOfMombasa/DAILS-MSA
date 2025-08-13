const pool = require('./config/db');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  try {
    console.log('Setting up database tables...');
    
    // Setup main schema only if tables don't exist
    await setupMainSchema();
    
    // Setup admin users table
    await setupAdminTable();
    
    console.log('Database setup completed successfully!');
    
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    process.exit();
  }
}

async function setupMainSchema() {
  try {
    console.log('Checking main schema...');
    
    // Check if users table exists
    const [tables] = await pool.query("SHOW TABLES LIKE 'users'");
    
    if (tables.length === 0) {
      console.log('Main tables not found, creating from schema...');
      const schemaPath = path.join(__dirname, 'database/schema.sql');
      
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        const statements = schemaSql.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
          if (statement.trim()) {
            await pool.query(statement);
          }
        }
        console.log('Main schema setup completed!');
      }
    } else {
      console.log('Main tables already exist, skipping schema setup.');
    }
    
  } catch (error) {
    console.error('Error setting up main schema:', error);
    throw error;
  }
}

async function setupAdminTable() {
  try {
    console.log('Setting up admin_users table...');
    
    // Check if admin_users table exists
    const [adminTables] = await pool.query("SHOW TABLES LIKE 'admin_users'");
    
    if (adminTables.length === 0) {
      console.log('Creating admin_users table...');
      
      // Create admin_users table SQL
      const adminTableSQL = `
        CREATE TABLE admin_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            email VARCHAR(100),
            role ENUM('super_admin', 'hr_admin', 'finance_admin') DEFAULT 'hr_admin',
            first_name VARCHAR(50),
            last_name VARCHAR(50),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL,
            created_by INT,
            INDEX idx_username (username),
            INDEX idx_role (role),
            INDEX idx_active (is_active)
        )
      `;
      
      // Execute table creation
      await pool.query(adminTableSQL);
      console.log('Admin users table created successfully!');
    } else {
      console.log('Admin users table already exists.');
    }
    
    // Check if admin users already exist
    const [existingAdmins] = await pool.query('SELECT COUNT(*) as count FROM admin_users');
    
    if (existingAdmins[0].count === 0) {
      console.log('Inserting default admin users...');
      
      // Insert default admin users
      const insertAdminsSQL = `
        INSERT INTO admin_users (username, password, email, role, first_name, last_name, created_by) VALUES
        ('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@mombasa.go.ke', 'super_admin', 'System', 'Administrator', 1),
        ('hr_admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'hr@mombasa.go.ke', 'hr_admin', 'HR', 'Administrator', 1),
        ('finance_admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'finance@mombasa.go.ke', 'finance_admin', 'Finance', 'Administrator', 1)
      `;
      
      await pool.query(insertAdminsSQL);
      
      console.log('✅ Default admin users created successfully!');
      console.log('');
      console.log('📋 Default admin credentials:');
      console.log('┌─────────────────┬──────────┬─────────────────┐');
      console.log('│ Username        │ Password │ Role            │');
      console.log('├─────────────────┼──────────┼─────────────────┤');
      console.log('│ admin           │ password │ super_admin     │');
      console.log('│ hr_admin        │ password │ hr_admin        │');
      console.log('│ finance_admin   │ password │ finance_admin   │');
      console.log('└─────────────────┴──────────┴─────────────────┘');
      console.log('');
      console.log('⚠️  IMPORTANT: Change these passwords in production!');
      console.log('🔗 Access admin panel at: http://localhost:3000/admin');
    } else {
      console.log('✅ Admin users already exist, skipping insertion.');
      
      // Show existing admin users (without passwords)
      const [admins] = await pool.query(`
        SELECT username, role, first_name, last_name, is_active, last_login 
        FROM admin_users 
        ORDER BY role, username
      `);
      
      console.log('');
      console.log('📋 Existing admin users:');
      console.log('┌─────────────────┬─────────────────┬──────────┬─────────────────┐');
      console.log('│ Username        │ Role            │ Active   │ Last Login      │');
      console.log('├─────────────────┼─────────────────┼──────────┼─────────────────┤');
      
      admins.forEach(admin => {
        const lastLogin = admin.last_login ? 
          new Date(admin.last_login).toLocaleDateString() : 
          'Never';
        console.log(
          `│ ${admin.username.padEnd(15)} │ ${admin.role.padEnd(15)} │ ${admin.is_active ? 'Yes' : 'No'} ${admin.is_active ? '     ' : '      '} │ ${lastLogin.padEnd(15)} │`
        );
      });
      
      console.log('└─────────────────┴─────────────────┴──────────┴─────────────────┘');
    }
    
  } catch (error) {
    console.error('Error setting up admin table:', error);
    throw error;
  }
}

// Function to setup only admin table (for quick admin setup)
async function setupAdminOnly() {
  try {
    console.log('Setting up admin users only...');
    await setupAdminTable();
    console.log('Admin setup completed successfully!');
  } catch (error) {
    console.error('Error setting up admin table:', error);
  } finally {
    process.exit();
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--admin-only')) {
    setupAdminOnly();
  } else {
    setupDatabase();
  }
}

module.exports = { setupDatabase, setupAdminTable, setupAdminOnly };