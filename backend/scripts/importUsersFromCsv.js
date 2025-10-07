/**
 * Bulk re-import users from a CSV after purging existing user data.
 *
 * PURPOSE
 *   - Remove existing rows in `users` (which currently have prefixes in surname like 'Mrs.')
 *   - Insert new rows derived from the provided CSV using ONLY these columns:
 *       Surname, First Name, Other Names, ID Number, Payroll Number, Birth Date
 *     (Full Name column is ignored as requested.)
 *   - Generate email as: <payroll_number>@mombasa.go.ke (override with --email-domain)
 *   - Set a uniform initial password (env DEFAULT_USER_PASSWORD or 'ChangeMe123!')
 *   - Birth Date in CSV is dd/mm/yyyy -> stored as yyyy-mm-dd
 *
 * IMPORTANT
 *   - TRUNCATING `users` will CASCADE DELETE related records (declarations etc.)
 *     because of ON DELETE CASCADE foreign keys. BACKUP FIRST if you need them.
 *
 * USAGE (from backend directory):
 *   node scripts/importUsersFromCsv.js --file "../PSB Data 220925.csv"
 *   node scripts/importUsersFromCsv.js --file "../PSB Data 220925.csv" --password Temp@2025 --email-domain example.org
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true; // boolean flag
      } else {
        out[key] = next;
        i += 1;
      }
    }
  }
  return out;
}

// Parse one CSV line respecting the quoted first column (Full Name) which may contain commas.
function parseLine(line) {
  if (!line.trim()) return null;
  // Expect structure: "Full Name",Surname,First Name,Other Names,ID Number,Payroll Number,Birth Date
  // We ignore the first quoted field entirely.
  let rest = line;
  if (rest.startsWith('"')) {
    const closing = rest.indexOf('",');
    if (closing === -1) return null; // malformed
    rest = rest.slice(closing + 2); // skip closing quote and following comma
  }
  const parts = rest.split(',');
  // After removing Full Name we expect exactly 6 or 7 parts depending on blank other names
  // Surname,First Name,Other Names,ID Number,Payroll Number,Birth Date
  if (parts.length < 6) return null;
  const [surname, firstName, otherNames, idNumber, payrollNumber, birthDate] = parts.map(p => p.trim().replace(/^"|"$/g, ''));
  return { surname, firstName, otherNames: otherNames || null, idNumber, payrollNumber, birthDate };
}

function toIsoDate(dmy) {
  if (!dmy) return null;
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

async function run() {
  const args = parseArgs();
  let finalPath = null;
  if (args.file) {
    // If absolute use as-is; otherwise resolve relative to current working directory (where npm script is run)
    finalPath = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
  }
  if (!finalPath || !fs.existsSync(finalPath)) {
    console.error('CSV file not found. Provide with --file "<relative-or-absolute-path>"');
    process.exit(1);
  }

  const emailDomain = (args['email-domain'] || 'mombasa.go.ke').toLowerCase();
  const plainPassword = args.password || process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123!';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  console.log('--- User Re-import Script ---');
  console.log('CSV Path         :', finalPath);
  console.log('Email Domain     :', emailDomain);
  console.log('Default Password :', plainPassword);
  console.log('WARNING: This will DELETE all existing users (and cascade delete dependent records).');
  const dryRun = !!args['dry-run'];
  if (!args.force) {
    console.log('Add --force to proceed without interactive confirmation.');
    if (process.stdin.isTTY) {
      process.stdout.write('Type YES to continue: ');
      const answer = await new Promise((resolve) => {
        process.stdin.once('data', d => resolve(String(d).trim()));
      });
      if (answer !== 'YES') {
        console.log('Aborted.');
        process.exit(0);
      }
    } else {
      console.log('Non-interactive session; aborting (use --force).');
      process.exit(1);
    }
  }

  const raw = fs.readFileSync(finalPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  // Skip header
  const dataLines = lines.slice(1).filter(l => l.trim());

  const rows = [];
  const seenPayroll = new Set();
  let skipped = 0;
  const toTitle = (s) => {
    if (!s) return s;
    if (/^[A-Z\s'.-]+$/.test(s) && s.length > 1) {
      return s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
    }
    return s;
  };
  dataLines.forEach((line) => {
    const parsed = parseLine(line);
    if (!parsed) { skipped += 1; return; }
    const { surname, firstName, otherNames, idNumber, payrollNumber, birthDate } = parsed;
    if (!surname || !firstName || !payrollNumber || !birthDate) { skipped += 1; return; }
    if (seenPayroll.has(payrollNumber)) { skipped += 1; return; }
    const isoDate = toIsoDate(birthDate);
    if (!isoDate) { skipped += 1; return; }
    seenPayroll.add(payrollNumber);
    const cleanSurname = surname.replace(/^(Mr\.|Mrs\.|Ms\.|Miss\.|Dr\.|MR\.|MRS\.|MISS\.|MS\.|DR\.)\s*/i, '').trim();
    const normSurname = toTitle(cleanSurname);
    const normFirst = toTitle(firstName.trim());
    const normOther = otherNames ? toTitle(otherNames.trim()) : null;
    rows.push([
      payrollNumber,
      normSurname,
      normFirst,
      normOther,
      `${payrollNumber}@${emailDomain}`,
      null, // phone_number
      isoDate,
      hashedPassword,
      0, // password_changed
      idNumber || null
    ]);
  });

  console.log(`Parsed ${rows.length} rows. Skipped ${skipped}.`);
  if (rows.length === 0) {
    console.error('No valid rows to insert. Aborting.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('--- DRY RUN SUMMARY ---');
    console.log('Rows that would be inserted:', rows.length);
    console.log('First 5 sample rows:', rows.slice(0, 5));
    console.log('No database changes performed.');
    process.exit(0);
  }
  const conn = await pool.getConnection();
  try {
    console.log('Disabling foreign key checks & truncating users...');
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    await conn.query('TRUNCATE TABLE users');
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    console.log('Inserting new users...');
    const batchSize = 1000; // safe chunking
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      // Bulk insert
      // NOTE: Only inserting mandatory columns we have data for; other nullable columns left NULL
      // Order of columns must match values
      await conn.query(
        `INSERT INTO users (
          payroll_number,
          surname,
          first_name,
          other_names,
          email,
          phone_number,
          birthdate,
          password,
          password_changed,
          national_id
        ) VALUES ?`,
        [batch]
      );
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${rows.length}...`);
    }
    console.log('SUCCESS: Re-import complete.');
    console.log('Total inserted:', inserted);
  } catch (err) {
    console.error('Import failed:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    // Let pool drain
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run }; // export for potential testing
