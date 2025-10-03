const request = require('supertest');
const app = require('../app');

describe('Consent submission validation', () => {
  test('rejects missing full_name', async () => {
    const res = await request(app)
      .post('/api/admin/consent/consent')
      .send({ national_id: '12345', signed: true });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_FAILED');
    const fields = res.body.details.map(d => d.field);
    expect(fields).toContain('full_name');
  });

  test('rejects short national_id', async () => {
    const res = await request(app)
      .post('/api/admin/consent/consent')
      .send({ full_name: 'John Doe', national_id: '12', signed: true });
    expect(res.status).toBe(400);
    const nid = res.body.details.find(d => d.field === 'national_id');
    expect(nid).toBeTruthy();
  });

  test('accepts valid payload', async () => {
    const res = await request(app)
      .post('/api/admin/consent/consent')
      .send({ full_name: 'John Doe', national_id: '12345678', signed: true });
    // Controller might do additional processing; for validation success just ensure not 400
    expect(res.status).not.toBe(400);
  });
});
