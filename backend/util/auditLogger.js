// Unified audit logging helper.
// Provides resilient, minimal-dependency insert wrappers with structured error handling.
const pool = require('../config/db');

async function logDeclarationUpdate({ declarationId, userId, diff, action = 'UPDATE' }) {
  try {
    await pool.query(
      'INSERT INTO declaration_audit_logs (declaration_id, user_id, action, diff) VALUES (?,?,?,?)',
      [declarationId, userId, action, JSON.stringify(diff || {})]
    );
  } catch (e) {
    if (!/unknown table|doesn\'t exist/i.test(e.message)) {
      console.warn('logDeclarationUpdate failed:', e.message);
    }
  }
}

async function logDeclarationPatch({ declarationId, userId, changedScalar, replacedCollections }) {
  try {
    await pool.query(
      'INSERT INTO declaration_patch_audit (declaration_id, user_id, changed_scalar_fields, replaced_collections) VALUES (?,?,?,?)',
      [declarationId, userId, JSON.stringify(changedScalar||[]), JSON.stringify(replacedCollections||{})]
    );
  } catch (e) {
    if (!/unknown table|doesn\'t exist/i.test(e.message)) {
      console.warn('logDeclarationPatch failed:', e.message);
    }
  }
}

async function logOtpDisclosure(entry) {
  const { userId, adminId, adminRole, adminDept, adminSubDept, action, reason, hash, last2, generated, ip, ua } = entry;
  try {
    await pool.query(
      `INSERT INTO otp_disclosure_audit (user_id, admin_id, admin_role, admin_department, admin_sub_department, action, reason, hashed_otp, otp_last2, generated, ip_address, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, adminId||null, adminRole||null, adminDept||null, adminSubDept||null, action, (reason||'').slice(0,500), hash, last2, generated?1:0, (ip||'').slice(0,64), (ua||'').slice(0,255)]
    );
    return true;
  } catch (e) {
    console.warn('logOtpDisclosure failed:', e.message);
    return false;
  }
}

module.exports = { logDeclarationUpdate, logDeclarationPatch, logOtpDisclosure };
