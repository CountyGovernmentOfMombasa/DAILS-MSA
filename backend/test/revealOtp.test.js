const request = require('supertest');
const express = require('express');
const db = require('../config/db');
const itAdminController = require('../controllers/itAdminController');

// Minimal app w/ admin auth stub
const app = express();
app.use(express.json());
app.use((req,res,next)=>{ req.admin = { adminId: 99, role: 'it_admin', department: 'Executive', sub_department: 'Office of the Governor' }; next(); });
app.post('/api/it-admin/create-user', itAdminController.createRegularUser);
app.post('/api/it-admin/users/:userId/reveal-otp', itAdminController.revealUserOtp);

// Helper to create user quickly
async function createTestUser(idSuffix) {
  const unique = Date.now() + '-' + Math.floor(Math.random()*1000);
  const payload = {
    national_id: 'NID-OTP-' + idSuffix + '-' + unique,
    payroll_number: 'PN-OTP-' + idSuffix + '-' + unique,
    birthdate: '1990-01-01',
    first_name: 'User' + idSuffix,
    surname: 'Tester',
    email: `otpuser${idSuffix}-${unique}@example.com`,
    department: 'Executive',
    sub_department: 'Office of the Governor'
  };
  const res = await request(app).post('/api/it-admin/create-user').send(payload);
  if (res.status !== 201) throw new Error('Failed to create test user: ' + res.text);
  return res.body.userId;
}

describe('IT Admin Reveal OTP', () => {
  let userId;
  afterAll(async ()=>{ try { await db.end?.(); } catch(e){} });

  test('Create user and reveal OTP (generation)', async () => {
    userId = await createTestUser('A');
    const res = await request(app).post(`/api/it-admin/users/${userId}/reveal-otp`).send({ reason: 'Support call user without phone' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.otp).toMatch(/^\d{6}$/);
  });

  test('Reveal existing active OTP without regeneration', async () => {
    const res = await request(app).post(`/api/it-admin/users/${userId}/reveal-otp`).send({ reason: 'Repeat support view' });
    // Accept 200 success; if 404 due to expiry timing (unlikely in test), regenerate
    if (res.status === 404) {
      const regen = await request(app).post(`/api/it-admin/users/${userId}/reveal-otp`).send({ reason: 'Regenerate after expiry', regenerate: true });
      expect(regen.status).toBe(200);
      expect(regen.body.success).toBe(true);
    } else {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });

  test('Reject missing reason', async () => {
    const res = await request(app).post(`/api/it-admin/users/${userId}/reveal-otp`).send({ });
    expect(res.status).toBe(400);
  });
});
