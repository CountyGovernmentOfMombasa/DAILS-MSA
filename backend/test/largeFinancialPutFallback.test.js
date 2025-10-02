const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const declarationController = require('../controllers/declarationController');
const patchValidation = require('../middleware/patchValidation');
const db = require('../config/db');

// Minimal app with auth stub
const app = express();
app.use(bodyParser.json({ limit: '5mb' }));
app.use((req,res,next)=>{ req.user = { id: 2, role: 'user' }; next(); });
app.patch('/api/declarations/:id', patchValidation, declarationController.patchDeclaration);

async function seed() {
  await db.execute("INSERT INTO users (id, payroll_number, surname, first_name, email, birthdate, password) VALUES (2,'PN002','User','Big','big@example.com','1990-01-01','x') ON DUPLICATE KEY UPDATE first_name=VALUES(first_name)");
  const [rows] = await db.execute('SELECT id FROM declarations WHERE user_id=2');
  if (!rows.length) {
    await db.execute("INSERT INTO declarations (user_id, marital_status, declaration_date) VALUES (2,'single','2025-10-01')");
  }
  const [rows2] = await db.execute('SELECT id FROM declarations WHERE user_id=2');
  return rows2[0].id;
}

describe('Large financial payload triggers PUT fallback (integration heuristic)', () => {
  let declId;
  beforeAll(async () => { declId = await seed(); });
  afterAll(async () => { try { await db.end?.(); } catch(_){} });

  test('PATCH large financial_declarations array still accepted (server always supports) - heuristic is client-side; ensure server handles big collection', async () => {
    const largeArray = Array.from({ length: 1200 }).map((_,i) => ({
      member_type: 'user',
      member_name: 'User',
      declaration_date: '2025-10-01',
      period_start_date: '2025-01-01',
      period_end_date: '2025-12-31',
      biennial_income: [],
      assets: [],
      liabilities: [],
      other_financial_info: 'X'
    }));
    // We send only financial_declarations; backend will treat as collection replace via PATCH.
    const res = await request(app).patch(`/api/declarations/${declId}`).send({ financial_declarations: largeArray });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
