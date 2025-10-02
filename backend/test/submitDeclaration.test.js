const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const db = require('../config/db');
const { submitDeclaration } = require('../controllers/declarationController');

const app = express();
app.use(bodyParser.json());
app.use((req,res,next)=>{ req.user = { id: 77, email: 'u77@example.com', first_name:'Test', surname:'User' }; next(); });
app.post('/api/declarations', submitDeclaration);

async function seedUser(){
  await db.execute("INSERT INTO users (id, payroll_number, surname, first_name, email, birthdate, password) VALUES (77,'PN077','User','Test','u77@example.com','1990-01-01','x') ON DUPLICATE KEY UPDATE first_name=VALUES(first_name)");
}

describe('submitDeclaration root-only financial', () => {
  beforeAll(async ()=>{ await seedUser(); });
  afterAll(async ()=>{ try { await db.end?.(); } catch(_){} });

  test('Creates declaration with period dates and empty arrays', async () => {
    const payload = {
      marital_status: 'single',
      declaration_type: 'First',
      declaration_date: '2025-10-01',
      period_start_date: '2025-01-01',
      period_end_date: '2025-12-31',
      biennial_income: [],
      assets: [],
      liabilities: [],
      spouses: [],
      children: []
    };
    const res = await request(app).post('/api/declarations').send(payload);
    expect(res.status).toBe(201);
    const id = res.body.declaration_id;
    const [rows] = await db.execute('SELECT period_start_date, period_end_date, JSON_LENGTH(biennial_income) AS cnt FROM declarations WHERE id=?',[id]);
    expect(rows.length).toBe(1);
    expect(String(rows[0].period_start_date)).toContain('2025-01-01');
    expect(String(rows[0].period_end_date)).toContain('2025-12-31');
    expect(rows[0].cnt).toBe(0);
  });
});