const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');
const db = require('../config/db');
const { submitDeclaration } = require('../controllers/declarationController');

const app = express();
app.use(bodyParser.json());
app.use((req,res,next)=>{ req.user = { id: 88, email: 'u88@example.com', first_name:'Jane', surname:'Tester' }; next(); });
app.post('/api/declarations', submitDeclaration);

async function seedUser(){
  await db.execute("INSERT INTO users (id, payroll_number, surname, first_name, email, birthdate, password) VALUES (88,'PN088','Tester','Jane','u88@example.com','1992-02-02','x') ON DUPLICATE KEY UPDATE first_name=VALUES(first_name)");
  await db.execute("DELETE FROM declarations WHERE user_id=88");
}

describe('submitDeclaration normalization + witness', () => {
  beforeAll(async ()=>{ await seedUser(); });
  afterAll(async ()=>{ try { await db.end?.(); } catch(_){} });

  test('Normalizes Biennial spelling and saves witness flattened fields', async () => {
    const payload = {
      marital_status: 'single',
      declaration_type: 'Biennial', // frontend sends correct spelling
      declaration_date: '2025-11-05',
      biennial_income: [ { type:'Salary', description:'Net salary', value:'1000' } ],
      spouses: [],
      children: [],
      witness_signed: true,
      witness_name: 'Observer One',
      witness_address: '123 Street',
      witness_phone: '+254700000000'
    };
    const res = await request(app).post('/api/declarations').send(payload);
    expect(res.status).toBe(201);
      const id = res.body.declaration_id;
      const [rows] = await db.execute('SELECT declaration_type, witness_name, witness_phone, witness_signed FROM declarations WHERE id=?',[id]);
      expect(rows.length).toBe(1);
  // Post-migration only the correct spelling should persist
  expect(rows[0].declaration_type).toBe('Biennial');
      expect(rows[0].witness_name).toBe('Observer One');
      expect(rows[0].witness_phone).toBe('+254700000000');
      expect(rows[0].witness_signed).toBe(1);
  });
});
