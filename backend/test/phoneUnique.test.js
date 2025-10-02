const request = require('supertest');
const express = require('express');
const db = require('../config/db');
const itAdminController = require('../controllers/itAdminController');

// Minimal app & middleware stub for admin auth
const app = express();
app.use(express.json());
app.use((req,res,next)=>{ req.admin = { adminId:1, role:'it_admin' }; next(); });
app.post('/api/it-admin/create-user', itAdminController.createRegularUser);

describe('Phone number uniqueness on user creation', () => {
  const baseUser = {
    birthdate: '1990-01-01',
    first_name: 'Alice',
    surname: 'Tester',
    // Provide department & sub_department to satisfy NOT NULL schema after migration
    department: 'Executive',
    sub_department: 'Office of the Governor'
  };

  const phone = '0712345678';

  afterAll(async () => {
    try { await db.end?.(); } catch (_) {}
  });

  test('Creates first user with phone successfully', async () => {
    // Ensure columns for migration additions exist
    await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_last_changed_at DATETIME NULL");
    await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_change_count INT NULL");
    // Clean potential leftovers from earlier runs
    await db.execute("DELETE FROM users WHERE email IN ('phoneuser1@example.com','phoneuser2@example.com','phoneuser3@example.com')");
    const res = await request(app).post('/api/it-admin/create-user').send({
      ...baseUser,
      national_id: 'NID-PHONE-1',
      payroll_number: 'PN-PHONE-1',
      email: 'phoneuser1@example.com',
      phone_number: phone
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('Rejects second user with same phone number', async () => {
    const res = await request(app).post('/api/it-admin/create-user').send({
      ...baseUser,
      national_id: 'NID-PHONE-2',
      payroll_number: 'PN-PHONE-2',
      email: 'phoneuser2@example.com',
      phone_number: phone
    });
    expect(res.status).toBe(409);
    expect(String(res.body.message || '')).toMatch(/phone/i);
  });

  test('Rejects invalid phone format early', async () => {
    const res = await request(app).post('/api/it-admin/create-user').send({
      ...baseUser,
      national_id: 'NID-PHONE-3',
      payroll_number: 'PN-PHONE-3',
      email: 'phoneuser3@example.com',
      phone_number: 'abc123'
    });
    expect(res.status).toBe(400);
    expect(String(res.body.message || '')).toMatch(/invalid phone_number/i);
  });
});
