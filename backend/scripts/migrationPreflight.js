#!/usr/bin/env node
/**
 * Migration Preflight Script
 * Verifies that foreign key referenced columns exist with matching types & indexes
 * before applying new migrations. Run prior to migration execution.
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'employee_declarations'
  };
  const conn = await mysql.createConnection(config);
  try {
    const required = [
      { table: 'declarations', column: 'id', type: 'int' },
      { table: 'users', column: 'id', type: 'int' }
    ];
    const escIdent = (v) => v.replace(/`/g,'');
    for (const r of required) {
      // Some MariaDB versions reject parameter placeholders in SHOW statements; build query safely.
      const colQuery = `SHOW COLUMNS FROM \`${escIdent(r.table)}\` LIKE '${escIdent(r.column)}'`;
      const [rows] = await conn.query(colQuery);
      if (!rows.length) {
        console.error(`[Preflight] Missing column ${r.table}.${r.column}`);
        process.exitCode = 1;
        continue;
      }
      const col = rows[0];
      if (!(col.Type || '').toLowerCase().startsWith(r.type)) {
        console.error(`[Preflight] Type mismatch on ${r.table}.${r.column}: expected startsWith(${r.type}) got ${col.Type}`);
        process.exitCode = 1;
      } else {
        console.log(`[Preflight] OK ${r.table}.${r.column} (${col.Type})`);
      }
      // Ensure index (PRIMARY or other)
      const idxQuery = `SHOW INDEX FROM \`${escIdent(r.table)}\` WHERE Column_name = '${escIdent(r.column)}'`;
      const [idx] = await conn.query(idxQuery);
      if (!idx.length) {
        console.error(`[Preflight] No index found for ${r.table}.${r.column}`);
        process.exitCode = 1;
      } else {
        console.log(`[Preflight] Index present for ${r.table}.${r.column}`);
      }
    }
    if (process.exitCode === 1) {
      console.error('[Preflight] Issues detected. Review output before running migrations.');
    } else {
      console.log('[Preflight] All prerequisite FK columns validated.');
    }
  } catch (e) {
    console.error('[Preflight] Error:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
