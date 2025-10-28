// --- Update Declaration (PUT) ---
// NOTE: This endpoint now performs a *selective* update. It will ONLY modify
// fields explicitly provided in the request body. Previously, omitted fields
// were defaulted (e.g., arrays -> []) which caused unintended data loss.
exports.updateDeclaration = async (req, res) => {
  try {
    const declarationId = req.params.id;
    const userId = req.user.id;
    const db = require("../config/db");

    // Ensure the declaration exists
    const [existingDeclRows] = await db.execute(
      "SELECT * FROM declarations WHERE id = ? AND user_id = ?",
      [declarationId, userId]
    );
    if (!existingDeclRows.length) {
      if (process.env.DECLARATION_DEBUG === "1") {
        console.warn(
          `[updateDeclaration] Declaration not found: id=${declarationId} user=${userId}`
        );
      }
      return res
        .status(404)
        .json({ success: false, message: "Declaration not found" });
    }
    const existingRow = existingDeclRows[0];

    // Enforce single user edit after submission: allow update only if status is pending or rejected OR (approved and user_edit_count == 0)
    if (
      ["approved"].includes(existingRow.status) &&
      (existingRow.user_edit_count || 0) >= 1
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You have already edited this declaration once. Further edits are not allowed.",
      });
    }

    const payload = req.body || {};

    // Optional debug (enable by setting process.env.DECLARATION_DEBUG=1)
    if (process.env.DECLARATION_DEBUG === "1") {
      try {
        console.log(
          "[updateDeclaration] Incoming payload",
          JSON.stringify(payload).slice(0, 2000)
        );
      } catch (_) {
        /* ignore */
      }
    }

    // Build dynamic SET clause only for provided scalar fields
    const setClauses = [];
    const values = [];
    const scalarFieldHandlers = {
      marital_status: (v) => (v === "" ? null : v),
      witness_signed: (v) => (v ? 1 : 0),
      witness_name: (v) => v || "",
      witness_address: (v) => v || "",
      witness_phone: (v) => v || null,
      biennial_income: (v) =>
        JSON.stringify(
          Array.isArray(v)
            ? v
            : typeof v === "string"
            ? (() => {
                try {
                  return JSON.parse(v) || [];
                } catch {
                  return [];
                }
              })()
            : []
        ),
      assets: (v) => {
        if (Array.isArray(v)) return JSON.stringify(v);
        if (typeof v === "string") {
          // Assume already JSON or raw text; try parse
          try {
            JSON.parse(v);
            return v;
          } catch {
            return JSON.stringify([]);
          }
        }
        return JSON.stringify([]);
      },
      liabilities: (v) => {
        if (Array.isArray(v)) return JSON.stringify(v);
        if (typeof v === "string") {
          try {
            JSON.parse(v);
            return v;
          } catch {
            return JSON.stringify([]);
          }
        }
        return JSON.stringify([]);
      },
      other_financial_info: (v) => v || "",
      declaration_date: (v) => (v ? v : existingRow.declaration_date),
      period_start_date: (v) => (v === "" ? null : v),
      period_end_date: (v) => (v === "" ? null : v),
      signature_path: (v) => (v ? 1 : 0),
    };

    Object.keys(scalarFieldHandlers).forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
      const rawVal = payload[field];
      // Skip null / undefined to avoid accidental data erasure
      if (rawVal === null || rawVal === undefined) return;
      // For marital_status specifically, skip empty string (treat as 'no change')
      if (
        field === "marital_status" &&
        typeof rawVal === "string" &&
        rawVal.trim() === ""
      )
        return;
      setClauses.push(`${field} = ?`);
      values.push(scalarFieldHandlers[field](rawVal));
    });

    if (setClauses.length) {
      setClauses.push("updated_at = CURRENT_TIMESTAMP");
      await db.execute(
        `UPDATE declarations SET ${setClauses.join(
          ", "
        )} WHERE id = ? AND user_id = ?`,
        [...values, declarationId, userId]
      );
    }

    // Fetch existing witness info to detect changes
    let oldWitnessPhone = null;
    try {
      const [oldRows] = await db.execute(
        "SELECT witness_phone FROM declarations WHERE id = ? AND user_id = ?",
        [declarationId, userId]
      );
      if (oldRows && oldRows[0])
        oldWitnessPhone = oldRows[0].witness_phone || null;
    } catch (e) {
      console.warn(
        "Could not fetch previous witness info for change detection:",
        e.message
      );
    }

    // Fetch previous state for audit
    let prevDeclaration = null;
    let prevFinDecls = []; // removed feature
    try {
      const [drows] = await db.execute(
        "SELECT id, marital_status, declaration_date, biennial_income, assets, liabilities, other_financial_info, witness_signed, witness_name, witness_address, witness_phone FROM declarations WHERE id = ? AND user_id = ?",
        [declarationId, userId]
      );
      if (drows && drows[0]) prevDeclaration = drows[0];
      // financial_declarations deprecated
    } catch (e) {
      console.warn("Audit prefetch failed:", e.message);
    }

    // Update declaration table (limited to existing columns in schema)
    // Sanitize values (convert undefined -> null or string) prior to binding
    const sanitizeDate = (d) => (d === undefined || d === "" ? null : d);
    const rootUpdateParams = [
      marital_status === "" ? null : marital_status,
      witness_signed ? 1 : 0,
      witness_name || "",
      witness_address || "",
      witness_phone || null,
      JSON.stringify(Array.isArray(biennial_income) ? biennial_income : []),
      typeof assets === "string"
        ? assets
        : JSON.stringify(Array.isArray(assets) ? assets : []),
      typeof liabilities === "string"
        ? liabilities
        : JSON.stringify(Array.isArray(liabilities) ? liabilities : []),
      other_financial_info || "",
      sanitizeDate(declaration_date),
      sanitizeDate(period_start_date),
      sanitizeDate(period_end_date),
      typeof req.body?.signature_path === "number"
        ? req.body.signature_path
        : req.body?.declarationChecked
        ? 1
        : null,
      declarationId,
      userId,
    ];
    await db.execute(
      `UPDATE declarations SET 
                marital_status=?, 
                witness_signed=?, witness_name=?, witness_address=?, witness_phone=?, 
                biennial_income=?, assets=?, liabilities=?, other_financial_info=?, 
                declaration_date=?, period_start_date=?, period_end_date=?, 
                signature_path=COALESCE(?, signature_path), 
                updated_at=CURRENT_TIMESTAMP 
             WHERE id=? AND user_id=?`,
      rootUpdateParams
    );

    // If witness phone changed or newly added, notify the (new) witness
    try {
      if (witness_phone && witness_phone !== oldWitnessPhone) {
        const [urows] = await db.execute(
          "SELECT first_name, other_names, surname FROM users WHERE id = ?",
          [userId]
        );
        const parts = [];
        if (urows && urows[0]) {
          if (urows[0].first_name) parts.push(urows[0].first_name);
          if (urows[0].other_names) parts.push(urows[0].other_names);
          if (urows[0].surname) parts.push(urows[0].surname);
        }
        const fullName = parts.join(" ") || "an employee";
        const sendSMS = require("../util/sendSMS");
        const { buildWitnessSmsBody } = require("../util/witnessSms");
        await sendSMS({
          to: witness_phone,
          body: buildWitnessSmsBody(fullName),
        });
      }
    } catch (e) {
      console.error("Witness change SMS notify error:", e.message);
    }

    // Update spouses ONLY if explicitly supplied
    if (Object.prototype.hasOwnProperty.call(payload, "spouses")) {
      // Safeguard: if empty array provided but existing rows present AND no force flag, skip deletion (likely unintended)
      const [spCountRows] = await db.execute(
        "SELECT COUNT(*) as cnt FROM spouses WHERE declaration_id = ?",
        [declarationId]
      );
      const existingSpouseCount = spCountRows[0]?.cnt || 0;
      if (
        Array.isArray(payload.spouses) &&
        payload.spouses.length === 0 &&
        existingSpouseCount > 0 &&
        !payload._forceReplace
      ) {
        if (process.env.DECLARATION_DEBUG === "1")
          console.warn(
            "[updateDeclaration] Empty spouses array ignored to prevent unintended data loss"
          );
      } else {
        const spouses = Array.isArray(payload.spouses) ? payload.spouses : [];
        await db.execute("DELETE FROM spouses WHERE declaration_id = ?", [
          declarationId,
        ]);
        for (const spouse of spouses) {
          const fullName = `${spouse.first_name || ""} ${
            spouse.other_names || ""
          } ${spouse.surname || ""}`.trim();
          const incomeJson = Array.isArray(spouse.biennial_income)
            ? JSON.stringify(spouse.biennial_income)
            : "[]";
          const assetsJson = Array.isArray(spouse.assets)
            ? JSON.stringify(spouse.assets)
            : typeof spouse.assets === "string"
            ? spouse.assets
            : "[]";
          const liabilitiesJson = Array.isArray(spouse.liabilities)
            ? JSON.stringify(spouse.liabilities)
            : typeof spouse.liabilities === "string"
            ? spouse.liabilities
            : "[]";
          await db.execute(
            "INSERT INTO spouses (declaration_id, first_name, other_names, surname, full_name, biennial_income, assets, liabilities, other_financial_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              declarationId,
              spouse.first_name || "",
              spouse.other_names || "",
              spouse.surname || "",
              fullName,
              incomeJson,
              assetsJson,
              liabilitiesJson,
              spouse.other_financial_info || "",
            ]
          );
        }
      }
    } else if (process.env.DECLARATION_DEBUG === "1") {
      console.log(
        "[updateDeclaration] Spouses not provided -> existing rows preserved"
      );
    }

    // Update children ONLY if explicitly supplied
    if (Object.prototype.hasOwnProperty.call(payload, "children")) {
      const [chCountRows] = await db.execute(
        "SELECT COUNT(*) as cnt FROM children WHERE declaration_id = ?",
        [declarationId]
      );
      const existingChildCount = chCountRows[0]?.cnt || 0;
      if (
        Array.isArray(payload.children) &&
        payload.children.length === 0 &&
        existingChildCount > 0 &&
        !payload._forceReplace
      ) {
        if (process.env.DECLARATION_DEBUG === "1")
          console.warn(
            "[updateDeclaration] Empty children array ignored to prevent unintended data loss"
          );
      } else {
        const children = Array.isArray(payload.children)
          ? payload.children
          : [];
        await db.execute("DELETE FROM children WHERE declaration_id = ?", [
          declarationId,
        ]);
        for (const child of children) {
          const fullName = `${child.first_name || ""} ${
            child.other_names || ""
          } ${child.surname || ""}`.trim();
          const incomeJson = Array.isArray(child.biennial_income)
            ? JSON.stringify(child.biennial_income)
            : "[]";
          const assetsJson = Array.isArray(child.assets)
            ? JSON.stringify(child.assets)
            : typeof child.assets === "string"
            ? child.assets
            : "[]";
          const liabilitiesJson = Array.isArray(child.liabilities)
            ? JSON.stringify(child.liabilities)
            : typeof child.liabilities === "string"
            ? child.liabilities
            : "[]";
          await db.execute(
            "INSERT INTO children (declaration_id, first_name, other_names, surname, full_name, biennial_income, assets, liabilities, other_financial_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              declarationId,
              child.first_name || "",
              child.other_names || "",
              child.surname || "",
              fullName,
              incomeJson,
              assetsJson,
              liabilitiesJson,
              child.other_financial_info || "",
            ]
          );
        }
      }
    } else if (process.env.DECLARATION_DEBUG === "1") {
      console.log(
        "[updateDeclaration] Children not provided -> existing rows preserved"
      );
    }

    // financial_declarations removed

    // Fetch new fin declarations for audit diff
    let newFinDecls = []; // removed

    // Compute diff (shallow) for declaration root
    const computeShallowDiff = (beforeObj, afterObj) => {
      const diff = { changed: {}, removed: [], added: {} };
      if (!beforeObj)
        return { changed: afterObj || {}, removed: [], added: afterObj || {} };
      const before = beforeObj || {};
      const after = afterObj || {};
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      keys.forEach((k) => {
        if (!(k in after)) {
          diff.removed.push(k);
        } else if (!(k in before)) {
          diff.added[k] = after[k];
        } else if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
          diff.changed[k] = { before: before[k], after: after[k] };
        }
      });
      return diff;
    };
    let newDeclarationRow = null;
    try {
      const [drowsNew] = await db.execute(
        "SELECT id, marital_status, declaration_date, biennial_income, assets, liabilities, other_financial_info, witness_signed, witness_name, witness_address, witness_phone FROM declarations WHERE id = ? AND user_id = ?",
        [declarationId, userId]
      );
      if (drowsNew && drowsNew[0]) newDeclarationRow = drowsNew[0];
    } catch (e) {
      console.warn("Audit new declaration fetch failed:", e.message);
    }
    // Insert declaration audit log
    try {
      const diff = computeShallowDiff(prevDeclaration, newDeclarationRow);
      const { logDeclarationUpdate } = require("../util/auditLogger");
      await logDeclarationUpdate({
        declarationId,
        userId,
        diff,
        action: "UPDATE",
      });
    } catch (e) {
      console.warn("Audit log wrapper (declaration) failed:", e.message);
    }

    // Increment user_edit_count only if declaration was previously submitted (submitted_at not null) and not already incremented
    try {
      if (existingRow.submitted_at && (existingRow.user_edit_count || 0) < 1) {
        await db.execute(
          "UPDATE declarations SET user_edit_count = user_edit_count + 1 WHERE id = ? AND user_id = ?",
          [declarationId, userId]
        );
        try {
          const { logDeclarationUpdate } = require("../util/auditLogger");
          await logDeclarationUpdate({
            declarationId,
            userId,
            diff: {
              changed: {
                user_edit_count: {
                  before: existingRow.user_edit_count || 0,
                  after: (existingRow.user_edit_count || 0) + 1,
                },
              },
              removed: [],
              added: {},
            },
            action: "UPDATE",
          });
        } catch (auditIncErr) {
          console.warn(
            "Audit log for user_edit_count increment failed:",
            auditIncErr.message
          );
        }
      }
    } catch (e) {
      console.warn("Failed to increment user_edit_count:", e.message);
    }

    res.json({ success: true, message: "Declaration updated successfully." });
  } catch (err) {
    console.error("Error updating declaration:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update declaration.",
      error: err.message,
    });
  }
};

// --- Partial Update Declaration (PATCH) ---
// Accepts a subset of fields and only updates those provided. Does not delete/replace
// full related collections unless explicitly supplied. Designed to work with
// diffModels output from frontend.
exports.patchDeclaration = async (req, res) => {
  try {
    const declarationId = req.params.id;
    const userId = req.user.id;
    const db = require("../config/db");
    const [existing] = await db.execute(
      "SELECT * FROM declarations WHERE id = ? AND user_id = ?",
      [declarationId, userId]
    );
    if (!existing.length) {
      if (process.env.DECLARATION_DEBUG === "1") {
        console.warn(
          `[patchDeclaration] Declaration not found: id=${declarationId} user=${userId}`
        );
      }
      return res
        .status(404)
        .json({ success: false, message: "Declaration not found" });
    }
    const existingRow = existing[0];
    if (
      ["approved"].includes(existingRow.status) &&
      (existingRow.user_edit_count || 0) >= 1
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You have already edited this declaration once. Further edits are not allowed.",
      });
    }
    const allowedScalar = new Set([
      "marital_status",
      "witness_signed",
      "witness_name",
      "witness_address",
      "witness_phone",
      "biennial_income",
      "assets",
      "liabilities",
      "other_financial_info",
      "declaration_date",
      "period_start_date",
      "period_end_date",
      "signature_path",
    ]);
    const payload = req.body || {};
    const setClauses = [];
    const values = [];
    const changedScalar = [];
    for (const key of Object.keys(payload)) {
      if (!allowedScalar.has(key)) continue;
      if (
        key === "biennial_income" ||
        key === "assets" ||
        key === "liabilities"
      ) {
        setClauses.push(`${key} = ?`);
        values.push(JSON.stringify(payload[key] || []));
        changedScalar.push(key);
      } else if (key === "witness_signed") {
        setClauses.push("witness_signed = ?");
        values.push(payload[key] ? 1 : 0);
        changedScalar.push(key);
      } else if (key === "signature_path") {
        setClauses.push("signature_path = ?");
        values.push(payload[key] ? 1 : 0);
        changedScalar.push(key);
      } else {
        setClauses.push(`${key} = ?`);
        values.push(payload[key]);
        changedScalar.push(key);
      }
    }
    if (setClauses.length) {
      setClauses.push("updated_at = CURRENT_TIMESTAMP");
      await db.execute(
        `UPDATE declarations SET ${setClauses.join(
          ", "
        )} WHERE id = ? AND user_id = ?`,
        [...values, declarationId, userId]
      );
    }

    // Related collections: spouses, children
    // Only process if explicitly provided in payload (partial semantics)
    const replacedCollections = {};
    if (Array.isArray(payload.spouses)) {
      await db.execute("DELETE FROM spouses WHERE declaration_id = ?", [
        declarationId,
      ]);
      for (const spouse of payload.spouses) {
        const fullName = `${spouse.first_name || ""} ${
          spouse.other_names || ""
        } ${spouse.surname || ""}`.trim();
        // Ensure financial array fields are JSON serialized. Accept pre-stringified JSON to avoid double quoting.
        const incomeJson = Array.isArray(spouse.biennial_income)
          ? JSON.stringify(spouse.biennial_income)
          : typeof spouse.biennial_income === "string"
          ? spouse.biennial_income
          : "[]";
        const assetsJson = Array.isArray(spouse.assets)
          ? JSON.stringify(spouse.assets)
          : typeof spouse.assets === "string" &&
            spouse.assets.trim().startsWith("[")
          ? spouse.assets
          : "[]";
        const liabilitiesJson = Array.isArray(spouse.liabilities)
          ? JSON.stringify(spouse.liabilities)
          : typeof spouse.liabilities === "string" &&
            spouse.liabilities.trim().startsWith("[")
          ? spouse.liabilities
          : "[]";
        await db.execute(
          "INSERT INTO spouses (declaration_id, first_name, other_names, surname, full_name, biennial_income, assets, liabilities, other_financial_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            declarationId,
            spouse.first_name || "",
            spouse.other_names || "",
            spouse.surname || "",
            fullName,
            incomeJson,
            assetsJson,
            liabilitiesJson,
            spouse.other_financial_info || "",
          ]
        );
      }
      replacedCollections.spouses = true;
    }
    if (Array.isArray(payload.children)) {
      await db.execute("DELETE FROM children WHERE declaration_id = ?", [
        declarationId,
      ]);
      for (const child of payload.children) {
        const fullName = `${child.first_name || ""} ${
          child.other_names || ""
        } ${child.surname || ""}`.trim();
        const incomeJson = Array.isArray(child.biennial_income)
          ? JSON.stringify(child.biennial_income)
          : typeof child.biennial_income === "string"
          ? child.biennial_income
          : "[]";
        const assetsJson = Array.isArray(child.assets)
          ? JSON.stringify(child.assets)
          : typeof child.assets === "string" &&
            child.assets.trim().startsWith("[")
          ? child.assets
          : "[]";
        const liabilitiesJson = Array.isArray(child.liabilities)
          ? JSON.stringify(child.liabilities)
          : typeof child.liabilities === "string" &&
            child.liabilities.trim().startsWith("[")
          ? child.liabilities
          : "[]";
        await db.execute(
          "INSERT INTO children (declaration_id, first_name, other_names, surname, full_name, biennial_income, assets, liabilities, other_financial_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            declarationId,
            child.first_name || "",
            child.other_names || "",
            child.surname || "",
            fullName,
            incomeJson,
            assetsJson,
            liabilitiesJson,
            child.other_financial_info || "",
          ]
        );
      }
      replacedCollections.children = true;
    }
    // financial_declarations payload ignored (deprecated)
    // First, if applicable, increment user_edit_count and audit it
    try {
      if (existingRow.submitted_at && (existingRow.user_edit_count || 0) < 1) {
        await db.execute(
          "UPDATE declarations SET user_edit_count = user_edit_count + 1 WHERE id = ? AND user_id = ?",
          [declarationId, userId]
        );
        try {
          const { logDeclarationPatch } = require("../util/auditLogger");
          await logDeclarationPatch({
            declarationId,
            userId,
            changedScalar: ["user_edit_count"],
            replacedCollections: {},
          });
        } catch (auditIncErr) {
          console.warn(
            "Patch audit log for user_edit_count increment failed:",
            auditIncErr.message
          );
        }
      }
    } catch (e) {
      console.warn("Failed to increment user_edit_count (patch):", e.message);
    }
    // Basic audit log (create table if needed separately): declaration_patch_audit
    try {
      const { logDeclarationPatch } = require("../util/auditLogger");
      await logDeclarationPatch({
        declarationId,
        userId,
        changedScalar,
        replacedCollections,
      });
    } catch (e) {
      console.warn("Patch audit wrapper failed:", e.message);
    }
    return res.json({
      success: true,
      message: "Declaration patched successfully",
    });
  } catch (err) {
    console.error("patchDeclaration error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Server error applying patch" });
  }
};

// --- Edit Request & Retrieval Handlers ---
const db = require("../config/db");

// Record an edit request for a declaration
exports.requestEdit = async (req, res) => {
  try {
    const declarationId = req.params.id;
    const userId = req.user.id;
    const { reason, date } = req.body || {};
    if (!reason)
      return res
        .status(400)
        .json({ success: false, message: "Reason is required." });
    await db.execute(
      "INSERT INTO declaration_edit_requests (declarationId, userId, reason, requestedAt) VALUES (?, ?, ?, ?)",
      [declarationId, userId, reason, date || new Date()]
    );
    return res.json({ success: true, message: "Edit request submitted." });
  } catch (err) {
    console.error("Error submitting edit request:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit edit request" });
  }
};

// List all edit requests (admin usage)
exports.getAllEditRequests = async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM declaration_edit_requests ORDER BY requestedAt DESC"
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error fetching edit requests:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch edit requests" });
  }
};

// Get a single declaration (owner) with nested financial + unified structure INCLUDING freshest user profile data
exports.getDeclarationById = async (req, res) => {
  try {
    const userId = req.user.id;
    const declarationId = req.params.id;

    // Join users to fetch the latest profile info instead of relying solely on declaration snapshot
    const [declRows] = await db.execute(
      `
            SELECT d.*, 
                   u.payroll_number            AS user_payroll_number,
                   u.first_name                AS user_first_name,
                   u.other_names               AS user_other_names,
                   u.surname                   AS user_surname,
                   u.email                     AS user_email,
                   u.national_id               AS user_national_id,
                   DATE_FORMAT(u.birthdate, '%Y-%m-%d') AS user_birthdate,
                   u.place_of_birth            AS user_place_of_birth,
                   u.marital_status            AS user_marital_status,
                   u.postal_address            AS user_postal_address,
                   u.physical_address          AS user_physical_address,
                   u.designation               AS user_designation,
                   u.department                AS user_department,
                   u.nature_of_employment      AS user_nature_of_employment
            FROM declarations d
            JOIN users u ON d.user_id = u.id
            WHERE d.id = ? AND d.user_id = ?
        `,
      [declarationId, userId]
    );

    if (!declRows.length) {
      if (process.env.DECLARATION_DEBUG === "1") {
        console.warn(
          `[getDeclarationById] Declaration not found: id=${declarationId} user=${userId}`
        );
        try {
          const [userDecls] = await db.execute(
            "SELECT id, created_at FROM declarations WHERE user_id = ? ORDER BY created_at DESC LIMIT 15",
            [userId]
          );
          console.warn(
            `[getDeclarationById] Existing declarations for user ${userId}:`,
            userDecls.map((r) => r.id).join(", ") || "(none)"
          );
        } catch (dbgErr) {
          console.warn(
            "[getDeclarationById] Debug list fetch failed:",
            dbgErr.message
          );
        }
      }
      return res
        .status(404)
        .json({ success: false, message: "Declaration not found" });
    }

    const row = declRows[0];

    // Build a normalized user profile object
    const userProfile = {
      id: userId,
      payroll_number: row.user_payroll_number || null,
      first_name: row.user_first_name || "",
      other_names: row.user_other_names || "",
      surname: row.user_surname || "",
      email: row.user_email || "",
      national_id: row.user_national_id || null,
      birthdate: row.user_birthdate || "",
      place_of_birth: row.user_place_of_birth || "",
      marital_status: row.user_marital_status || "",
      postal_address: row.user_postal_address || "",
      physical_address: row.user_physical_address || "",
      designation: row.user_designation || "",
      department: row.user_department || "",
      nature_of_employment: row.user_nature_of_employment || "",
    };

    // Start with declaration record
    const rootDecl = { ...row };

    // Override declaration snapshot fields with freshest user profile values (preserve original via original_*)
    const overrideFields = [
      "first_name",
      "other_names",
      "surname",
      "marital_status",
      "birthdate",
      "place_of_birth",
      "postal_address",
      "physical_address",
      "designation",
      "department",
      "nature_of_employment",
      "email",
      "national_id",
      "payroll_number",
    ];
    overrideFields.forEach((f) => {
      const userVal = userProfile[f];
      if (rootDecl[f] !== undefined && rootDecl[f] !== userVal) {
        rootDecl[`original_${f}`] = rootDecl[f];
      }
      rootDecl[f] = userVal;
    });

    const [spouses] = await db.execute(
      "SELECT * FROM spouses WHERE declaration_id = ?",
      [declarationId]
    );
    const [children] = await db.execute(
      "SELECT * FROM children WHERE declaration_id = ?",
      [declarationId]
    );
    // Build unified financial view from root/spouses/children only (financial tables removed)
    const parseArr = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try {
        return JSON.parse(v) || [];
      } catch {
        return [];
      }
    };
    const financial_unified = [];
    const rootIncome = parseArr(rootDecl.biennial_income);
    const rootAssets = parseArr(rootDecl.assets);
    const rootLiabilities = parseArr(rootDecl.liabilities);
    if (rootIncome.length || rootAssets.length || rootLiabilities.length) {
      financial_unified.push({
        member_type: "user",
        member_name: rootDecl.first_name
          ? `${rootDecl.first_name} ${rootDecl.surname || ""}`.trim()
          : "User",
        scope: "root",
        data: {
          biennial_income: rootIncome,
          assets: rootAssets,
          liabilities: rootLiabilities,
          other_financial_info: rootDecl.other_financial_info || "",
        },
      });
    }
    spouses.forEach((s) => {
      const si = parseArr(s.biennial_income),
        sa = parseArr(s.assets),
        sl = parseArr(s.liabilities);
      if (si.length || sa.length || sl.length)
        financial_unified.push({
          member_type: "spouse",
          member_name:
            s.full_name || `${s.first_name || ""} ${s.surname || ""}`.trim(),
          scope: "spouses",
          data: {
            biennial_income: si,
            assets: sa,
            liabilities: sl,
            other_financial_info: s.other_financial_info || "",
          },
        });
    });
    children.forEach((c) => {
      const ci = parseArr(c.biennial_income),
        ca = parseArr(c.assets),
        cl = parseArr(c.liabilities);
      if (ci.length || ca.length || cl.length)
        financial_unified.push({
          member_type: "child",
          member_name:
            c.full_name || `${c.first_name || ""} ${c.surname || ""}`.trim(),
          scope: "children",
          data: {
            biennial_income: ci,
            assets: ca,
            liabilities: cl,
            other_financial_info: c.other_financial_info || "",
          },
        });
    });

    return res.json({
      success: true,
      declaration: {
        ...rootDecl,
        user: userProfile, // explicit user object for frontend
        spouses,
        children,
        financial_unified,
      },
    });
  } catch (err) {
    console.error("Error fetching declaration by ID:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error fetching declaration" });
  }
};

// On-demand PDF download (owner or super_admin)
exports.downloadDeclarationPDF = async (req, res) => {
  try {
    const declarationId = req.params.id;
    const userId = req.user.id;
    const [rows] = await db.query(
      "SELECT user_id FROM declarations WHERE id = ?",
      [declarationId]
    );
    if (!rows.length)
      return res
        .status(404)
        .json({ success: false, message: "Declaration not found" });
    if (rows[0].user_id !== userId && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to download this declaration",
      });
    }
    const { generateDeclarationPDF } = require("../util/pdfBuilder");
    const { buffer, base, password, encryptionApplied, passwordInstruction } =
      await generateDeclarationPDF(declarationId);
    const safeNatId = (base.national_id || "declaration")
      .toString()
      .replace(/[^A-Za-z0-9_-]/g, "_");
    const filename = `${safeNatId} DAILs Form.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (encryptionApplied && password) {
      res.setHeader("X-PDF-Password", password);
      if (passwordInstruction) {
        res.setHeader("X-PDF-Password-Instruction", passwordInstruction);
      }
    }
    return res.send(buffer);
  } catch (err) {
    console.error("On-demand PDF generation failed:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate PDF",
      error: err.message,
    });
  }
};

// --- Discard Declaration Draft ---
exports.discardDeclaration = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userKey } = req.params;

    if (!userKey) {
      return res.status(400).json({
        success: false,
        message: "A userKey for the draft is required to discard it.",
      });
    }

    const Progress = require("../models/progressModel");
    await Progress.remove(userId, userKey);

    return res.json({
      success: true,
      message: "Declaration draft discarded successfully.",
    });
  } catch (err) {
    console.error("Error discarding declaration draft:", err);
    res.status(500).json({
      success: false,
      message: "Server error while discarding draft.",
    });
  }
};

const Declaration = require("../models/declarationModel");

// Get all declarations for admin (with debug log)
exports.getAllDeclarations = async (req, res) => {
  try {
    const rows = await Declaration.findAll();
    // Debug log: print first row to verify all fields
    if (rows && rows.length > 0) {
      console.log("Admin Declarations API - First row:", rows[0]);
    } else {
      console.log("Admin Declarations API - No rows returned");
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching all admin declarations:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching admin declarations",
    });
  }
};

// Get single declaration with details for admin
exports.getAdminDeclarationById = async (req, res) => {
  try {
    const declarationId = req.params.id;
    const declaration = await Declaration.findByIdWithDetails(declarationId);
    if (!declaration) {
      return res
        .status(404)
        .json({ success: false, message: "Declaration not found" });
    }
    return res.json({ success: true, data: declaration });
  } catch (error) {
    console.error("Error fetching admin declaration details:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching declaration details",
    });
  }
};
// Get all declarations for a user
exports.getDeclarations = async (req, res) => {
  try {
    const userId = req.user.id;
    const db = require("../config/db");
    const [rows] = await db.execute(
      "SELECT * FROM declarations WHERE user_id = ?",
      [userId]
    );
    // For each declaration, fetch spouses and children
    for (const decl of rows) {
      const [spouses] = await db.execute(
        "SELECT * FROM spouses WHERE declaration_id = ?",
        [decl.id]
      );
      const [children] = await db.execute(
        "SELECT * FROM children WHERE declaration_id = ?",
        [decl.id]
      );
      decl.spouses = spouses;
      decl.children = children;
    }
    res.json({ success: true, declarations: rows });
  } catch (error) {
    console.error("Error fetching declarations:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error fetching declarations" });
  }
};
const pool = require("../config/db");
exports.submitDeclaration = async (req, res) => {
  try {
    const {
      marital_status,
      declaration_date,
      department,
      biennial_income,
      assets,
      liabilities,
      other_financial_info,
      signature_path,
      spouses,
      children,
      financialDeclarations, // legacy camelCase from older frontend
      spouse_financials,
      child_financials,
      witness,
      declaration_type,
      periodStart,
      periodEnd,
      period_start_date,
      period_end_date,
    } = req.body;
    // Legacy financial_declarations payload ignored (tables removed)
    // --- Declaration type logic ---
    // Normalize declaration_type spelling (accept legacy variants)
    const normalizeDeclType = require("../util/normalizeDeclarationType");
    const allowedTypes = ["First", "Biennial", "Final"];
    const normalizedType = normalizeDeclType(declaration_type);
    if (!normalizedType || !allowedTypes.includes(normalizedType)) {
      console.warn(
        "submitDeclaration reject: invalid declaration_type",
        declaration_type
      );
      return res.status(400).json({
        success: false,
        message: "Invalid or missing declaration type.",
      });
    }

    // Fetch user's previous declarations
    const previousDeclarations = await Declaration.findByUserId(req.user.id);

    // Check for existing 'First' or 'Final' declaration
    if (
      (declaration_type === "First" || declaration_type === "Final") &&
      previousDeclarations.some((d) => d.declaration_type === declaration_type)
    ) {
      return res.status(400).json({
        success: false,
        message: `You can only submit a ${declaration_type} declaration once.`,
      });
    }

    // Bienniel logic: only allowed every two years, Nov 1 - Dec 31, starting 2025
    if (normalizedType === "Biennial") {
      // Parse date
      let decDate = declaration_date;
      if (typeof decDate === "string" && decDate.includes("/")) {
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const [day, month, year] = decDate.split("/");
        decDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
      const dateObj = new Date(decDate);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth() + 1; // 1-based
      const day = dateObj.getDate();
      // Only allow odd years >= 2025
      if (year < 2025 || year % 2 === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Biennial declaration is only allowed every two years starting 2025.",
        });
      }
      // Only allow between Nov 1 and Dec 31
      const isAllowedWindow =
        (month === 11 && day >= 1) || (month === 12 && day <= 31);
      if (!isAllowedWindow) {
        return res.status(400).json({
          success: false,
          message:
            "Biennial declaration is only allowed between Nov 1 and Dec 31 of the allowed year.",
        });
      }
      // Only one biennial per allowed year (account for legacy spelling in DB)
      if (
        previousDeclarations.some(
          (d) =>
            ["Biennial", "Bienniel"].includes(d.declaration_type) &&
            d.declaration_date &&
            new Date(d.declaration_date).getFullYear() === year
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "You have already submitted a Biennial declaration for this period.",
        });
      }
    }
    // Use normalized type going forward
    req.body.declaration_type = normalizedType;

    // Merge spouse_financials into spouses
    let mergedSpouses = spouses;
    if (Array.isArray(spouses) && Array.isArray(spouse_financials)) {
      mergedSpouses = spouses.map((spouse, idx) => ({
        ...spouse,
        ...(spouse_financials[idx] || {}),
      }));
    }

    // Merge child_financials into children
    let mergedChildren = children;
    if (Array.isArray(children) && Array.isArray(child_financials)) {
      mergedChildren = children.map((child, idx) => ({
        ...child,
        ...(child_financials[idx] || {}),
      }));
    }
    const user_id = req.user.id;

    // Validate required field
    if (!marital_status) {
      console.warn("submitDeclaration reject: missing marital_status");
      return res.status(400).json({
        success: false,
        message: "Marital status is required.",
      });
    }

    // Helper to convert DD/MM/YYYY to YYYY-MM-DD
    function convertDateToISO(dateStr) {
      if (!dateStr) return "";
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(
          2,
          "0"
        )}`;
      }
      return dateStr;
    }

    // --- Financial Arrays Normalization (root) ---
    const normalizeFinArray = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };
    const filterRows = (arr) =>
      (arr || []).filter(
        (r) =>
          r &&
          (String(r.description || "").trim() || String(r.value || "").trim())
      );
    let validBiennialIncome = filterRows(normalizeFinArray(biennial_income));
    if (
      validBiennialIncome.length &&
      !validBiennialIncome.every(
        (item) =>
          item &&
          typeof item === "object" &&
          "description" in item &&
          "value" in item
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Biennial income entries must contain description and value.",
      });
    }
    const rootAssets = filterRows(normalizeFinArray(assets));
    const rootLiabilities = filterRows(normalizeFinArray(liabilities));

    // Convert date to ISO format for DB
    const isoDeclarationDate = convertDateToISO(declaration_date);
    // Support both camelCase and snake_case for period start/end
    const isoPeriodStart = convertDateToISO(
      periodStart || period_start_date || ""
    );
    const isoPeriodEnd = convertDateToISO(periodEnd || period_end_date || "");

    // Use model for declaration creation
    const declaration = await Declaration.create({
      user_id,
      department,
      marital_status,
      declaration_date: isoDeclarationDate,
      period_start_date: isoPeriodStart,
      period_end_date: isoPeriodEnd,
      biennial_income: validBiennialIncome,
      assets: rootAssets,
      liabilities: rootLiabilities,
      other_financial_info,
      signature_path:
        typeof signature_path === "number"
          ? signature_path
          : req.body.signature_path
          ? 1
          : 0,
      witness_signed: witness?.signed ? 1 : req.body.witness_signed ? 1 : 0,
      witness_name: witness?.name || req.body.witness_name || null,
      witness_address: witness?.address || req.body.witness_address || null,
      witness_phone: witness?.phone || req.body.witness_phone || null,
      declaration_type: normalizedType,
      status: req.body.status || "pending",
    });
    const declarationId = declaration.id;

    // Insert spouses
    if (
      mergedSpouses &&
      Array.isArray(mergedSpouses) &&
      mergedSpouses.length > 0
    ) {
      await Declaration.createSpouses(declarationId, mergedSpouses);
    }

    // Insert children
    if (
      mergedChildren &&
      Array.isArray(mergedChildren) &&
      mergedChildren.length > 0
    ) {
      await Declaration.createChildren(declarationId, mergedChildren);
    }

    // financial declarations & items removed – unified structures ignored

    // Save witness data if provided ONLY if not already set via create (legacy fallback)
    const fallbackWitness =
      witness ||
      (req.body.witness_name ||
      req.body.witness_phone ||
      req.body.witness_address
        ? {
            signed: !!req.body.witness_signed,
            name: req.body.witness_name,
            address: req.body.witness_address,
            phone: req.body.witness_phone,
          }
        : null);
    let witnessSmsSent = false;
    if (fallbackWitness && !declaration.witness_name && fallbackWitness.name) {
      await pool.query(
        "UPDATE declarations SET witness_signed = ?, witness_name = ?, witness_address = ?, witness_phone = ? WHERE id = ?",
        [
          fallbackWitness.signed ? 1 : 0,
          fallbackWitness.name,
          fallbackWitness.address,
          fallbackWitness.phone || "",
          declarationId,
        ]
      );
      // Notify witness via SMS
      try {
        if (fallbackWitness.phone) {
          const sendSMS = require("../util/sendSMS");
          // Fetch user name to personalize message
          const [urows] = await pool.query(
            "SELECT first_name, other_names, surname FROM users WHERE id = ?",
            [req.user.id]
          );
          const nameParts = [];
          if (urows && urows[0]) {
            if (urows[0].first_name) nameParts.push(urows[0].first_name);
            if (urows[0].other_names) nameParts.push(urows[0].other_names);
            if (urows[0].surname) nameParts.push(urows[0].surname);
          }
          const fullName = nameParts.join(" ") || "an employee";
          const { buildWitnessSmsBody } = require("../util/witnessSms");
          const smsType = "SMS";
          await sendSMS({
            to: fallbackWitness.phone,
            body: buildWitnessSmsBody(fullName),
            smsType,
          });
          witnessSmsSent = true;
        }
      } catch (e) {
        console.error("Witness SMS notify error:", e.message);
      }
    }
    // If witness was captured during initial create (not via fallback), still notify them
    try {
      const effectiveWitnessPhone =
        declaration.witness_phone ||
        (witness && witness.phone) ||
        req.body.witness_phone ||
        null;
      if (!witnessSmsSent && effectiveWitnessPhone) {
        const sendSMS = require("../util/sendSMS");
        const [urows] = await pool.query(
          "SELECT first_name, other_names, surname FROM users WHERE id = ?",
          [req.user.id]
        );
        const parts = [];
        if (urows && urows[0]) {
          if (urows[0].first_name) parts.push(urows[0].first_name);
          if (urows[0].other_names) parts.push(urows[0].other_names);
          if (urows[0].surname) parts.push(urows[0].surname);
        }
        const fullName = parts.join(" ") || "an employee";
        const { buildWitnessSmsBody } = require("../util/witnessSms");
        await sendSMS({
          to: effectiveWitnessPhone,
          body: buildWitnessSmsBody(fullName),
        });
        witnessSmsSent = true;
      }
    } catch (e) {
      console.error("Witness SMS (initial create) error:", e.message);
    }
    // Send confirmation email to user with PDF attachment via shared builder
    try {
      const sendEmail = require("../util/sendEmail");
      const sendSMS = require("../util/sendSMS");
      const { generateDeclarationPDF } = require("../util/pdfBuilder");
      const { buffer: pdfBuffer, base } = await generateDeclarationPDF(
        declarationId
      );

      // Ensure recipient email
      let recipientEmail = req.user?.email;
      if (!recipientEmail) {
        try {
          const getCurrentUser = require("../util/currentUser");
          const fullUser = await getCurrentUser(req.user.id, { refresh: true });
          recipientEmail = fullUser?.email;
        } catch (e) {
          console.warn(
            "Could not hydrate user email for PDF email:",
            e.message
          );
        }
      }
      if (!recipientEmail)
        throw new Error("User email not found for confirmation email");

      const safeNatId = (base.national_id || "declaration")
        .toString()
        .replace(/[^A-Za-z0-9_-]/g, "_");
      const filename = `${safeNatId} DAILs Form.pdf`;

      await sendEmail({
        to: recipientEmail,
        subject:
          "Declaration of Income, Assets and Liabilities Submitted Successfully",
        text: `Dear ${
          base.first_name || "Employee"
        },\n\nYour Declaration of Income, Assets and Liabilities form has been successfully submitted. A PDF summary is attached.\n\nThe password for the attached PDF is Your National ID number.\n\nThank you!`,
        html: `<p>Dear ${
          base.first_name || "Employee"
        },</p><p>Your <b>Declaration of Income, Assets and Liabilities</b> form has been <b>successfully submitted</b>. A PDF summary is attached.</p><p><strong>The password for the attached PDF is Your National ID number.</strong></p><p>Thank you!</p>`,
        attachments: [
          { filename, content: pdfBuffer, contentType: "application/pdf" },
        ],
      });

                    // SMS confirmation (best effort)
                    try {
                        const [u] = await pool.query('SELECT phone_number FROM users WHERE id = ?', [req.user.id]);
                        const phone = u[0]?.phone_number;
                        if (phone) {
                            await sendSMS({ to: phone, body: 'Your declaration was submitted successfully.' });
                        }
                    } catch (smsErr) {
                        console.error('SMS submit notify error:', smsErr.message);
                    }
                } catch (emailErr) {
                    console.error('Error sending confirmation email (PDF generation step):', emailErr);
                }
                return res.status(201).json({
                    success: true,
                    declaration_id: declarationId,
                    message: 'Declaration and related data submitted successfully',
                    created_at: declaration.created_at,
                    updated_at: declaration.updated_at
                });
    } catch (error) {
        console.error('Declaration submission error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during declaration submission',
            error: error.message,
        });
    }
}
