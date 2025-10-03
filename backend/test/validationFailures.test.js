const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const adminRoutes = require('../routes/adminRoutes');

const app = express();
app.use(bodyParser.json());
// Minimal admin token injector middleware mock
app.use((req,res,next)=>{ req.admin = { adminId:1, role:'super', normalizedRole:'super', department:'Executive' }; next(); });
app.use('/api/admin', adminRoutes);

describe('Validation failure scenarios', () => {
  test('Rejects invalid sortBy on /users', async () => {
    const res = await request(app).get('/api/admin/users?sortBy=hack_column');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.some(d=>d.field==='sortBy')).toBe(true);
  });

  test('Rejects oversized search on /users', async () => {
    const big = 'x'.repeat(101);
    const res = await request(app).get('/api/admin/users?search='+big);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  test('Rejects invalid date range on status audit', async () => {
    const res = await request(app).get('/api/admin/declarations/status-audit?from=2025-12-31&to=2025-01-01');
    expect([400,422]).toContain(res.status);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
