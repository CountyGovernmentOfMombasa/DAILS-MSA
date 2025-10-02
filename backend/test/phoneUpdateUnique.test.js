const request = require('supertest');
const express = require('express');
const db = require('../config/db');
const authController = require('../controllers/authController');

// Minimal auth app (no full JWT flow, we stub req.user for update route)
const app = express();
app.use(express.json());

// Login route
app.post('/api/auth/login', authController.login);
// Update profile route (stub verify middleware)
app.put('/api/auth/me', (req,res,next)=>{ req.user = { id: 2 }; next(); }, authController.updateMe);

// Helper to seed users
async function seedUsers() {
  // Ensure new columns exist (in case migration not run in test env)
  await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_last_changed_at DATETIME NULL");
  await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_change_count INT NULL");
  // Clear prior test data (id 1 & 2 specific)
  await db.execute('DELETE FROM users WHERE id IN (1,2)');
  const bcrypt = require('bcryptjs');
  const pwd = await bcrypt.hash('Passw0rd!', 10);
  // Provide required NOT NULL fields including sub_department
  await db.execute(`INSERT INTO users (id,payroll_number,surname,first_name,other_names,email,phone_number,birthdate,password,password_changed,national_id,place_of_birth,marital_status,postal_address,physical_address,designation,department,sub_department,nature_of_employment) VALUES (1,'PN100','One','User','A','user1@example.com','0711111111','1990-01-01',?,1,'NID100',NULL,NULL,NULL,NULL,NULL,'Executive','Office of the Governor',NULL)`, [pwd]);
  await db.execute(`INSERT INTO users (id,payroll_number,surname,first_name,other_names,email,phone_number,birthdate,password,password_changed,national_id,place_of_birth,marital_status,postal_address,physical_address,designation,department,sub_department,nature_of_employment) VALUES (2,'PN200','Two','User','B','user2@example.com',NULL,'1990-01-01',?,1,'NID200',NULL,NULL,NULL,NULL,NULL,'Executive','Office of the Governor',NULL)`, [pwd]);
}

describe('Phone uniqueness on login & profile update', () => {
  beforeAll(async () => {
    await seedUsers();
  });
  afterAll(async () => { try { await db.end?.(); } catch(_){} });

  test('Login rejects duplicate phone when supplying for first time', async () => {
    const res = await request(app).post('/api/auth/login').send({ nationalId: 'NID200', password: 'Passw0rd!', phoneNumber: '0711111111' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_IN_USE');
  });

  test('Profile update rejects setting phone to existing user phone', async () => {
    const res = await request(app).put('/api/auth/me').send({ phone_number: '0711111111' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_IN_USE');
  });

  test('Profile update accepts valid new unique phone', async () => {
    const res = await request(app).put('/api/auth/me').send({ phone_number: '+254722000888' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile.phone_number).toBe('+254722000888');
  });
});
