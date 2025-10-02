const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const declarationController = require('../controllers/declarationController');
const patchValidation = require('../middleware/patchValidation');
const db = require('../config/db');

// Build a minimal app with auth stub
const app = express();
app.use(bodyParser.json());

// Auth stub middleware
app.use((req,res,next)=>{ req.user = { id: 1, role: 'user' }; next(); });

app.patch('/api/declarations/:id', patchValidation, declarationController.patchDeclaration);

// Helper to seed a declaration row directly
async function seedDeclaration() {
  // Users schema requires: payroll_number, surname, first_name, email, birthdate, password
  await db.execute("INSERT INTO users (id, payroll_number, surname, first_name, email, birthdate, password) VALUES (1,'PN001','User','Test','test@example.com','1990-01-01','x') ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), surname=VALUES(surname)");
  const [rows] = await db.execute('SELECT id FROM declarations WHERE user_id=1');
  let id;
  if (!rows.length) {
    await db.execute("INSERT INTO declarations (user_id, marital_status) VALUES (1,'single')");
    const [rows2] = await db.execute('SELECT id FROM declarations WHERE user_id=1');
    id = rows2[0].id;
  } else { id = rows[0].id; }
  return id;
}

describe('PATCH /api/declarations/:id', () => {
  let declId;
  beforeAll(async () => {
    declId = await seedDeclaration();
  });
  afterAll(async () => {
    try { await db.end?.(); } catch (_) {}
  });

  test('PATCH only marital_status leaves spouses untouched', async () => {
    // Insert a spouse
    await db.execute('DELETE FROM spouses WHERE declaration_id=?',[declId]);
    await db.execute("INSERT INTO spouses (declaration_id, first_name, surname, full_name) VALUES (?,?,?,?)", [declId,'Jane','Doe','Jane Doe']);
    const res = await request(app).patch(`/api/declarations/${declId}`).send({ marital_status: 'married' });
    expect(res.status).toBe(200);
    const [spouses] = await db.execute('SELECT * FROM spouses WHERE declaration_id=?',[declId]);
    expect(spouses.length).toBe(1); // untouched
    const [declRows] = await db.execute('SELECT marital_status FROM declarations WHERE id=?',[declId]);
    expect(declRows[0].marital_status).toBe('married');
  });

  test('PATCH with spouses array only updates spouses without changing marital_status', async () => {
    const [beforeDecl] = await db.execute('SELECT marital_status FROM declarations WHERE id=?',[declId]);
    const originalStatus = beforeDecl[0].marital_status;
    const res = await request(app).patch(`/api/declarations/${declId}`).send({ spouses: [{ first_name: 'Anna', surname: 'Smith' }] });
    expect(res.status).toBe(200);
    const [spouses] = await db.execute('SELECT * FROM spouses WHERE declaration_id=?',[declId]);
    expect(spouses.length).toBe(1);
    expect(spouses[0].first_name).toBe('Anna');
    const [afterDecl] = await db.execute('SELECT marital_status FROM declarations WHERE id=?',[declId]);
    expect(afterDecl[0].marital_status).toBe(originalStatus); // unchanged
  });

  test('PATCH invalid witness_phone returns 400', async () => {
    const res = await request(app).patch(`/api/declarations/${declId}`).send({ witness_phone: '12abc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/witness_phone/);
  });

  test('PATCH period_start_date only updates that field', async () => {
    const res = await request(app).patch(`/api/declarations/${declId}`).send({ period_start_date: '2025-01-01' });
    expect(res.status).toBe(200);
    const [rows] = await db.execute('SELECT period_start_date FROM declarations WHERE id=?',[declId]);
    expect(String(rows[0].period_start_date)).toContain('2025-01-01');
  });

  test('PATCH period_end_date only updates that field', async () => {
    const res = await request(app).patch(`/api/declarations/${declId}`).send({ period_end_date: '2025-12-31' });
    expect(res.status).toBe(200);
    const [rows] = await db.execute('SELECT period_end_date FROM declarations WHERE id=?',[declId]);
    expect(String(rows[0].period_end_date)).toContain('2025-12-31');
  });
});
