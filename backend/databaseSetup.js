const pool = require('./config/db');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  try {
    console.log('Setting up database tables...');
    
    // Setup main schema only if tables don't exist
    await setupMainSchema();
    
  // Admin users now part of baseline schema; ensure at least one default admin exists
  await ensureDefaultAdmins();
    
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

async function ensureDefaultAdmins() {
  try {
    console.log('Ensuring default admin users exist...');
    const [adminTables] = await pool.query("SHOW TABLES LIKE 'admin_users'");
    if (!adminTables.length) {
      console.warn('admin_users table not found – ensure schema.sql executed correctly.');
      return;
    }
    const [existingAdmins] = await pool.query('SELECT COUNT(*) as count FROM admin_users');
    if (existingAdmins[0].count === 0) {
      console.log('Inserting baseline admin accounts (change passwords ASAP in production).');
      await pool.query(`INSERT INTO admin_users (username, password, email, role, first_name, surname, other_names, created_by) VALUES
        ('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin@mombasa.go.ke', 'super_admin', 'System', 'Administrator', 1),
        ('hr_admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'hr@mombasa.go.ke', 'hr_admin', 'HR', 'Administrator', 1)`);
    } else {
      console.log('Admin users already present – skipping defaults.');
    }
  } catch (e) {
    console.error('ensureDefaultAdmins error:', e.message);
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
  const args = process.argv.slice(2);
  if (args.includes('--admin-only')) {
    ensureDefaultAdmins().finally(()=>process.exit());
  } else {
    setupDatabase();
  }
}

module.exports = { setupDatabase, ensureDefaultAdmins };