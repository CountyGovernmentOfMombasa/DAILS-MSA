const request = require('supertest');
const app = require('../app');

describe('Declaration Controller', () => {
  it('should not allow unauthenticated declaration submission', async () => {
    const res = await request(app)
      .post('/api/declarations')
      .send({ declaration_date: '2025-08-18' });
    expect(res.statusCode).toBe(401);
  });

  // Add more declaration tests as needed
});
