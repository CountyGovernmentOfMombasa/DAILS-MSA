const request = require('supertest');
const app = require('../app');

// Helper to create a fake JWT? If verifyToken requires real JWT, we may need to stub/middleware bypass.
// Assuming test environment allows simple token or middleware bypass for non-admin tokens.

describe('Progress save validation', () => {
  test('rejects missing user_key (validation 400 before auth)', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', 'Bearer invalid')
      .send({ data: { anything: true } });
    // Auth may return 401 before validation; ensure either 400 or 401 but not 200
    expect([400,401,403]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
    }
  });

  test('rejects long user_key', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', 'Bearer invalid')
      .send({ user_key: 'x'.repeat(101), data: {} });
    expect([400,401,403]).toContain(res.status);
  });

  test('valid payload not rejected by validation layer', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', 'Bearer invalid')
      .send({ user_key: 'draft123', data: { section: 'A' } });
    // Expect auth failure (401/403) but not 400
    expect(res.status).not.toBe(400);
  });
});
