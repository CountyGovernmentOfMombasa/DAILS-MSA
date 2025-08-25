const request = require('supertest');
const app = require('../app');

describe('Admin Controller', () => {
  it('should return 401 for unauthenticated admin', async () => {
    const res = await request(app).get('/api/admin/declarations');
    expect(res.statusCode).toBe(401);
  });

  it('should not allow admin creation without token', async () => {
    const res = await request(app)
      .post('/api/admin/admins')
      .send({
        username: 'adminuser',
        password: 'securepass',
        email: 'admin@example.com',
        first_name: 'Admin',
        last_name: 'User'
      });
    expect(res.statusCode).toBe(401);
  });

  // Add more admin tests as needed (e.g., with valid token)
});
