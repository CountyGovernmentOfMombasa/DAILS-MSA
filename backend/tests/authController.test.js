const request = require('supertest');
const app = require('../app');

describe('Auth Controller', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        payroll_number: '12345',
        birthdate: '1990-01-01',
        first_name: 'Test',
        last_name: 'User',
        email: 'testuser@example.com',
        phone: '1234567890'
      });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('success', true);
  });

  it('should not register duplicate user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        payroll_number: '12345',
        birthdate: '1990-01-01',
        first_name: 'Test',
        last_name: 'User',
        email: 'testuser@example.com',
        phone: '1234567890'
      });
    expect(res.statusCode).toBe(400);
  });

  it('should login a user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ payrollNumber: '12345', birthdate: '1990-01-01' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});
