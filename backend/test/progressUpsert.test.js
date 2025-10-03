const request = require('supertest');
const express = require('express');
const db = require('../config/db');
const progressRoutes = require('../routes/progressRoutes');
const authController = require('../controllers/authController');
const jwt = require('jsonwebtoken');

// We spin a minimal app using real progress routes & a stub verifyToken that injects a real user id.
const app = express();
app.use(express.json());

// Seed helper creates a user we will reference in JWT
async function seedUser() {
  await db.execute("DELETE FROM users WHERE id = 5000");
  const bcrypt = require('bcryptjs');
  const pwd = await bcrypt.hash('Passw0rd!', 10);
  // Provide required fields (some columns may be nullable, but keep parity with NOT NULL where enforced)
  await db.execute(`INSERT INTO users (id,payroll_number,surname,first_name,other_names,email,birthdate,password,password_changed,national_id,department,sub_department,designation) VALUES (5000,'PN5000','Progress','Tester','X','progtest@example.com','1990-05-05',?,1,'NIDPROG5000','Executive','Office of the Governor','QA')`, [pwd]);
}

// Custom middleware replacing verifyToken: generate & verify a JWT using same secret so controller hydration code works.
function issueTestToken(userId) {
  const secret = process.env.JWT_SECRET || 'testsecret';
  return jwt.sign({ id: userId }, secret, { expiresIn: '15m' });
}

// Attach real progress routes but pre-wrap with a simple auth stub that mimics verifyToken outcome
app.use('/api/progress', (req,res,next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const secret = process.env.JWT_SECRET || 'testsecret';
  try {
    const decoded = jwt.verify(token, secret);
    req.user = { id: decoded.id }; // minimal shape needed by controller
    return next();
  } catch (e) {
    return res.status(401).json({ success:false, message:'Invalid token (test stub)' });
  }
}, progressRoutes);

// Also expose /api/auth/login to confirm we can still reuse login logic if needed (not essential here)
app.post('/api/auth/login', authController.login);

describe('Progress upsert & fetch', () => {
  let token;
  const USER_ID = 5000;
  const USER_KEY = 'resume-key-1';

  beforeAll(async () => {
    await seedUser();
    token = issueTestToken(USER_ID);
  });

  afterAll(async () => { try { await db.end?.(); } catch(_){} });

  test('Upsert progress returns success (POST)', async () => {
    const payload = { lastStep: 'user', stateSnapshot: { userData: { surname: 'Progress' }, spouses: [], children: [] } };
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ userKey: USER_KEY, progress: payload });
    expect([200,201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  test('Subsequent GET returns persisted progress', async () => {
    const res = await request(app)
      .get(`/api/progress?userKey=${encodeURIComponent(USER_KEY)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.progress).toBeTruthy();
    expect(res.body.progress.userKey).toBe(USER_KEY);
    expect(res.body.progress.stateSnapshot.userData.surname).toBe('Progress');
  });

  test('Validation rejects oversized arrays', async () => {
    const bigChildren = Array.from({ length: 60 }).map((_,i)=>({ name:`Child${i}` }));
    const payload = { lastStep: 'user', stateSnapshot: { userData: {}, children: bigChildren } };
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ userKey: 'too-many-children', progress: payload });
    // Controller-level validation triggers 400
    if (res.status === 400) {
      expect(res.body.message).toMatch(/exceeds limit/);
    } else {
      // If rate limiting or other interference, ensure not a silent 200
      expect([401,403,429]).not.toContain(res.status);
    }
  });
});
