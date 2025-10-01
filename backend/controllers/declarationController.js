// --- Update Declaration (PUT) ---
exports.updateDeclaration = async (req, res) => {
    try {
        const declarationId = req.params.id;
        const userId = req.user.id;
        const {
            // Personal/user profile fields may be sent but declaration table does not store them; ignore or optionally update users table separately.
            marital_status,
            spouses,
            children,
            financial_declarations,
            witness_signed,
            witness_name,
            witness_address,
            witness_phone,
            biennial_income,
            assets,
            liabilities,
            other_financial_info,
            declaration_date,
            period_start_date,
            period_end_date
        } = req.body;

        // Fetch existing witness info to detect changes
        let oldWitnessPhone = null;
        try {
            const [oldRows] = await db.execute('SELECT witness_phone FROM declarations WHERE id = ? AND user_id = ?', [declarationId, userId]);
            if (oldRows && oldRows[0]) oldWitnessPhone = oldRows[0].witness_phone || null;
        } catch (e) {
            console.warn('Could not fetch previous witness info for change detection:', e.message);
        }

        // Fetch previous state for audit
        let prevDeclaration = null;
        let prevFinDecls = [];
        try {
            const [drows] = await db.execute('SELECT id, marital_status, declaration_date, biennial_income, assets, liabilities, other_financial_info, witness_signed, witness_name, witness_address, witness_phone FROM declarations WHERE id = ? AND user_id = ?', [declarationId, userId]);
            if (drows && drows[0]) prevDeclaration = drows[0];
            const [finRows] = await db.execute('SELECT id, member_type, member_name, declaration_date, period_start_date, period_end_date, other_financial_info FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
            prevFinDecls = finRows;
        } catch (e) {
            console.warn('Audit prefetch failed:', e.message);
        }

        // Update declaration table (limited to existing columns in schema)
        await db.execute(
            `UPDATE declarations SET 
                marital_status=?, 
                witness_signed=?, witness_name=?, witness_address=?, witness_phone=?, 
                biennial_income=?, assets=?, liabilities=?, other_financial_info=?, 
                declaration_date=?, updated_at=CURRENT_TIMESTAMP 
             WHERE id=? AND user_id=?`,
            [
                marital_status,
                witness_signed ? 1 : 0,
                witness_name,
                witness_address,
                witness_phone,
                JSON.stringify(biennial_income || []),
                typeof assets === 'string' ? assets : JSON.stringify(assets || []),
                typeof liabilities === 'string' ? liabilities : JSON.stringify(liabilities || []),
                other_financial_info || '',
                declaration_date,
                declarationId,
                userId
            ]
        );

        // Note: period_start_date / period_end_date not in current schema (cannot update). If needed, add columns first.

        // If witness phone changed or newly added, notify the (new) witness
        try {
            if (witness_phone && witness_phone !== oldWitnessPhone) {
                const [urows] = await db.execute('SELECT first_name, other_names, surname FROM users WHERE id = ?', [userId]);
                const parts = [];
                if (urows && urows[0]) {
                    if (urows[0].first_name) parts.push(urows[0].first_name);
                    if (urows[0].other_names) parts.push(urows[0].other_names);
                    if (urows[0].surname) parts.push(urows[0].surname);
                }
                const fullName = parts.join(' ') || 'an employee';
                const sendSMS = require('../util/sendSMS');
                await sendSMS({ to: witness_phone, body: `You have been selected as a witness by ${fullName} in their DIALs.` });
            }
        } catch (e) {
            console.error('Witness change SMS notify error:', e.message);
        }

    // Update spouses
        await db.execute('DELETE FROM spouses WHERE declaration_id = ?', [declarationId]);
        if (Array.isArray(spouses) && spouses.length > 0) {
            for (const spouse of spouses) {
                const fullName = `${spouse.first_name || ''} ${spouse.other_names || ''} ${spouse.surname || ''}`.trim();
                await db.execute(
                    'INSERT INTO spouses (declaration_id, first_name, other_names, surname, full_name, biennial_income, assets, liabilities, other_financial_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        declarationId, 
                        spouse.first_name || '', 
                        spouse.other_names || '', 
                        spouse.surname || '',
                        fullName,
                        JSON.stringify(spouse.biennial_income || []),
                        spouse.assets || '',
                        spouse.liabilities || '',
                        spouse.other_financial_info || ''
                    ]
                );
            }
        }

    // Update children
    await db.execute('DELETE FROM children WHERE declaration_id = ?', [declarationId]);
        if (Array.isArray(children) && children.length > 0) {
            for (const child of children) {
                const fullName = `${child.first_name || ''} ${child.other_names || ''} ${child.surname || ''}`.trim();
                await db.execute(
                    'INSERT INTO children (declaration_id, first_name, other_names, surname, full_name, biennial_income, assets, liabilities, other_financial_info) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        declarationId, 
                        child.first_name || '', 
                        child.other_names || '', 
                        child.surname || '',
                        fullName,
                        JSON.stringify(child.biennial_income || []),
                        child.assets || '',
                        child.liabilities || '',
                        child.other_financial_info || ''
                    ]
                );
            }
        }

        // Update financial declarations and financial items
        // First, delete existing financial items (cascade will handle this, but be explicit)
        const [existingFinDecls] = await db.execute('SELECT id FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
        if (existingFinDecls.length > 0) {
            const finDeclIds = existingFinDecls.map(fd => fd.id);
            await db.execute(`DELETE FROM financial_items WHERE financial_declaration_id IN (${finDeclIds.map(() => '?').join(',')})`, finDeclIds);
        }
        
        // Delete existing financial declarations
        await db.execute('DELETE FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
        
        // Insert new financial declarations and items
        if (Array.isArray(financial_declarations) && financial_declarations.length > 0) {
            // Filter out obviously invalid placeholder objects
            const cleanedFinancialDecls = financial_declarations.filter(fd => fd && (fd.member_type || fd.member_name || fd.biennial_income || fd.assets || fd.liabilities));
            const FinancialDeclaration = require('../models/financialDeclaration');
            const FinancialItem = require('../models/financialItem');
            
            for (const finDecl of cleanedFinancialDecls) {
                // Validate member_type
                const allowedTypes = ['user', 'spouse', 'child'];
                const validType = allowedTypes.includes(finDecl.member_type?.toLowerCase()) ? finDecl.member_type.toLowerCase() : 'user';

                // Create the financial declaration
                const financialDeclaration = await FinancialDeclaration.create({
                    declaration_id: declarationId,
                    member_type: validType,
                    member_name: finDecl.member_name || 'Unknown',
                    declaration_date: finDecl.declaration_date || new Date().toISOString().split('T')[0],
                    period_start_date: finDecl.period_start_date || '',
                    period_end_date: finDecl.period_end_date || '',
                    other_financial_info: finDecl.other_financial_info || ''
                });

                // Insert financial items for biennial_income
                if (Array.isArray(finDecl.biennial_income) && finDecl.biennial_income.length > 0) {
                    for (const item of finDecl.biennial_income) {
                        await FinancialItem.create({
                            financial_declaration_id: financialDeclaration.id,
                            item_type: 'income',
                            type: item.type || 'income',
                            description: item.description || '',
                            value: item.value || 0
                        });
                    }
                }

                // Insert financial items for assets
                if (Array.isArray(finDecl.assets) && finDecl.assets.length > 0) {
                    for (const item of finDecl.assets) {
                        await FinancialItem.create({
                            financial_declaration_id: financialDeclaration.id,
                            item_type: 'asset',
                            type: item.type || 'asset',
                            description: item.description || '',
                            value: item.value || 0
                        });
                    }
                }

                // Insert financial items for liabilities
                if (Array.isArray(finDecl.liabilities) && finDecl.liabilities.length > 0) {
                    for (const item of finDecl.liabilities) {
                        await FinancialItem.create({
                            financial_declaration_id: financialDeclaration.id,
                            item_type: 'liability',
                            type: item.type || 'liability',
                            description: item.description || '',
                            value: item.value || 0
                        });
                    }
                }
            }
        }

        // Fetch new fin declarations for audit diff
        let newFinDecls = [];
        try {
            const [finRowsNew] = await db.execute('SELECT id, member_type, member_name, declaration_date, period_start_date, period_end_date, other_financial_info FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
            newFinDecls = finRowsNew;
        } catch (e) {
            console.warn('Audit postfetch failed:', e.message);
        }

        // Compute diff (shallow) for declaration root
        const computeShallowDiff = (beforeObj, afterObj) => {
            const diff = { changed: {}, removed: [], added: {} };
            if (!beforeObj) return { changed: afterObj || {}, removed: [], added: afterObj || {} };
            const before = beforeObj || {};
            const after = afterObj || {};
            const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
            keys.forEach(k => {
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
            const [drowsNew] = await db.execute('SELECT id, marital_status, declaration_date, biennial_income, assets, liabilities, other_financial_info, witness_signed, witness_name, witness_address, witness_phone FROM declarations WHERE id = ? AND user_id = ?', [declarationId, userId]);
            if (drowsNew && drowsNew[0]) newDeclarationRow = drowsNew[0];
        } catch (e) {
            console.warn('Audit new declaration fetch failed:', e.message);
        }
        // Insert declaration audit log
        try {
            const diff = computeShallowDiff(prevDeclaration, newDeclarationRow);
            await db.execute('INSERT INTO declaration_audit_logs (declaration_id, user_id, action, diff) VALUES (?, ?, ?, ?)', [declarationId, userId, 'UPDATE', JSON.stringify(diff)]);
        } catch (e) {
            console.warn('Audit log insert (declaration) failed:', e.message);
        }

        // Insert financial audit logs per member (match by member_type+member_name)
        try {
            const indexByKey = (arr) => {
                const map = new Map();
                (arr || []).forEach(r => map.set(`${r.member_type}|${r.member_name}`, r));
                return map;
            };
            const beforeMap = indexByKey(prevFinDecls);
            const afterMap = indexByKey(newFinDecls);
            const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
            for (const key of keys) {
                const before = beforeMap.get(key) || null;
                const after = afterMap.get(key) || null;
                if (JSON.stringify(before) !== JSON.stringify(after)) {
                    await db.execute(
                        'INSERT INTO financial_audit_logs (declaration_id, user_id, action, member_type, member_name, before_state, after_state) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [
                            declarationId,
                            userId,
                            'REPLACE',
                            after?.member_type || before?.member_type || null,
                            after?.member_name || before?.member_name || null,
                            before ? JSON.stringify(before) : null,
                            after ? JSON.stringify(after) : null
                        ]
                    );
                }
            }
        } catch (e) {
            console.warn('Audit log insert (financial) failed:', e.message);
        }

        res.json({ success: true, message: 'Declaration updated successfully.' });
    } catch (err) {
        console.error('Error updating declaration:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update declaration.', 
            error: err.message 
        });
    }
};

// --- Batch Update Unified Financial Structure ---
// Endpoint will accept: { financial_unified: [ { member_type, member_name, data: { biennial_income, assets, liabilities, other_financial_info, declaration_date?, period_start_date?, period_end_date? } } ] }
// Behavior:
// 1. Wipes existing financial_declarations + items for the declaration
// 2. Recreates them from the unified array
// 3. Updates spouses/children JSON financial blobs if member_type spouse/child present
// 4. Updates root declaration JSON (biennial_income/assets/liabilities) if member_type user & scope root or user entry present
exports.updateUnifiedFinancial = async (req, res) => {
    const db = require('../config/db');
    const declarationId = req.params.id;
    const userId = req.user.id;
    const { financial_unified } = req.body || {};
    if (!Array.isArray(financial_unified)) {
        return res.status(400).json({ success: false, message: 'financial_unified array required' });
    }
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        // Ensure declaration belongs to user
        const [declRows] = await conn.execute('SELECT id FROM declarations WHERE id = ? AND user_id = ?', [declarationId, userId]);
        if (declRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Declaration not found' });
        }
        // Delete existing financial items and declarations
        const [oldFin] = await conn.execute('SELECT id FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
        if (oldFin.length > 0) {
            const ids = oldFin.map(r => r.id);
            await conn.execute(`DELETE FROM financial_items WHERE financial_declaration_id IN (${ids.map(()=>'?').join(',')})`, ids);
            await conn.execute('DELETE FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
        }
        // We'll rebuild spouse/children sets of JSON data for merging
        const spouseMap = new Map();
        const childMap = new Map();
        let rootUser = null;
        // Insert new financial_declarations + items
        const insertFinDecl = async (fd) => {
            const member_type = ['user','spouse','child'].includes(fd.member_type) ? fd.member_type : 'user';
            const member_name = fd.member_name || 'Unknown';
            const data = fd.data || {};
            const finDeclInsert = await conn.execute(
                'INSERT INTO financial_declarations (declaration_id, member_type, member_name, declaration_date, period_start_date, period_end_date, other_financial_info) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    declarationId,
                    member_type,
                    member_name,
                    data.declaration_date || new Date().toISOString().slice(0,10),
                    data.period_start_date || null,
                    data.period_end_date || null,
                    data.other_financial_info || ''
                ]
            );
            const finDeclId = finDeclInsert[0].insertId;
            const insertItems = async (items, item_type) => {
                if (!Array.isArray(items)) return;
                for (const item of items) {
                    await conn.execute(
                        'INSERT INTO financial_items (financial_declaration_id, item_type, type, description, value) VALUES (?, ?, ?, ?, ?)',
                        [finDeclId, item_type, item.type || item_type, item.description || '', item.value || 0]
                    );
                }
            };
            await insertItems(data.biennial_income, 'income');
            await insertItems(data.assets, 'asset');
            await insertItems(data.liabilities, 'liability');
            // Capture for spouse/child/root sync
            if (member_type === 'spouse') {
                if (!spouseMap.has(member_name)) spouseMap.set(member_name, { biennial_income: [], assets: [], liabilities: [], other_financial_info: '' });
                const agg = spouseMap.get(member_name);
                agg.biennial_income = data.biennial_income || [];
                agg.assets = data.assets || [];
                agg.liabilities = data.liabilities || [];
                agg.other_financial_info = data.other_financial_info || '';
            } else if (member_type === 'child') {
                if (!childMap.has(member_name)) childMap.set(member_name, { biennial_income: [], assets: [], liabilities: [], other_financial_info: '' });
                const agg = childMap.get(member_name);
                agg.biennial_income = data.biennial_income || [];
                agg.assets = data.assets || [];
                agg.liabilities = data.liabilities || [];
                agg.other_financial_info = data.other_financial_info || '';
            } else if (member_type === 'user') {
                rootUser = data;
            }
        };
        for (const entry of financial_unified) {
            await insertFinDecl(entry);
        }
        // Update root declaration JSON fields if user data provided
        if (rootUser) {
            await conn.execute('UPDATE declarations SET biennial_income = ?, assets = ?, liabilities = ?, other_financial_info = ? WHERE id = ?', [
                JSON.stringify(rootUser.biennial_income || []),
                JSON.stringify(rootUser.assets || []),
                JSON.stringify(rootUser.liabilities || []),
                rootUser.other_financial_info || '',
                declarationId
            ]);
        }
        // Sync spouses (match by full_name)
        if (spouseMap.size > 0) {
            const [existingSpouses] = await conn.execute('SELECT id, full_name FROM spouses WHERE declaration_id = ?', [declarationId]);
            for (const sp of existingSpouses) {
                if (spouseMap.has(sp.full_name)) {
                    const data = spouseMap.get(sp.full_name);
                    await conn.execute('UPDATE spouses SET biennial_income = ?, assets = ?, liabilities = ?, other_financial_info = ? WHERE id = ?', [
                        JSON.stringify(data.biennial_income || []),
                        JSON.stringify(data.assets || []),
                        JSON.stringify(data.liabilities || []),
                        data.other_financial_info || '',
                        sp.id
                    ]);
                }
            }
        }
        // Sync children (match by full_name)
        if (childMap.size > 0) {
            const [existingChildren] = await conn.execute('SELECT id, full_name FROM children WHERE declaration_id = ?', [declarationId]);
            for (const ch of existingChildren) {
                if (childMap.has(ch.full_name)) {
                    const data = childMap.get(ch.full_name);
                    await conn.execute('UPDATE children SET biennial_income = ?, assets = ?, liabilities = ?, other_financial_info = ? WHERE id = ?', [
                        JSON.stringify(data.biennial_income || []),
                        JSON.stringify(data.assets || []),
                        JSON.stringify(data.liabilities || []),
                        data.other_financial_info || '',
                        ch.id
                    ]);
                }
            }
        }
        await conn.commit();
        res.json({ success: true, message: 'Unified financial data updated.' });
    } catch (err) {
        await conn.rollback();
        console.error('Error updating unified financial data:', err);
        res.status(500).json({ success: false, message: 'Failed to update unified financial data', error: err.message });
    } finally {
        conn.release();
    }
};
// --- Edit Request & Retrieval Handlers ---
const db = require('../config/db');

// Record an edit request for a declaration
exports.requestEdit = async (req, res) => {
    try {
        const declarationId = req.params.id;
        const userId = req.user.id;
        const { reason, date } = req.body || {};
        if (!reason) return res.status(400).json({ success: false, message: 'Reason is required.' });
        await db.execute(
            'INSERT INTO declaration_edit_requests (declarationId, userId, reason, requestedAt) VALUES (?, ?, ?, ?)',
            [declarationId, userId, reason, date || new Date()]
        );
        return res.json({ success: true, message: 'Edit request submitted.' });
    } catch (err) {
        console.error('Error submitting edit request:', err);
        return res.status(500).json({ success: false, message: 'Failed to submit edit request' });
    }
};

// List all edit requests (admin usage)
exports.getAllEditRequests = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM declaration_edit_requests ORDER BY requestedAt DESC');
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Error fetching edit requests:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch edit requests' });
    }
};

// Get a single declaration (owner) with nested financial + unified structure INCLUDING freshest user profile data
exports.getDeclarationById = async (req, res) => {
    try {
        const userId = req.user.id;
        const declarationId = req.params.id;

        // Join users to fetch the latest profile info instead of relying solely on declaration snapshot
        const [declRows] = await db.execute(`
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
        `, [declarationId, userId]);

        if (!declRows.length) {
            return res.status(404).json({ success: false, message: 'Declaration not found' });
        }

        const row = declRows[0];

        // Build a normalized user profile object
        const userProfile = {
            id: userId,
            payroll_number: row.user_payroll_number || null,
            first_name: row.user_first_name || '',
            other_names: row.user_other_names || '',
            surname: row.user_surname || '',
            email: row.user_email || '',
            national_id: row.user_national_id || null,
            birthdate: row.user_birthdate || '',
            place_of_birth: row.user_place_of_birth || '',
            marital_status: row.user_marital_status || '',
            postal_address: row.user_postal_address || '',
            physical_address: row.user_physical_address || '',
            designation: row.user_designation || '',
            department: row.user_department || '',
            nature_of_employment: row.user_nature_of_employment || ''
        };

        // Start with declaration record
        const rootDecl = { ...row };

        // Override declaration snapshot fields with freshest user profile values (preserve original via original_*)
        const overrideFields = ['first_name', 'other_names', 'surname', 'marital_status', 'birthdate', 'place_of_birth', 'postal_address', 'physical_address', 'designation', 'department', 'nature_of_employment', 'email', 'national_id', 'payroll_number'];
        overrideFields.forEach(f => {
            const userVal = userProfile[f];
            if (rootDecl[f] !== undefined && rootDecl[f] !== userVal) {
                rootDecl[`original_${f}`] = rootDecl[f];
            }
            rootDecl[f] = userVal;
        });

        const [spouses] = await db.execute('SELECT * FROM spouses WHERE declaration_id = ?', [declarationId]);
        const [children] = await db.execute('SELECT * FROM children WHERE declaration_id = ?', [declarationId]);
        const [financialDeclarations] = await db.execute('SELECT * FROM financial_declarations WHERE declaration_id = ?', [declarationId]);

        let financialItems = [];
        if (financialDeclarations.length) {
            const ids = financialDeclarations.map(fd => fd.id);
            const placeholders = ids.map(() => '?').join(',');
            const [items] = await db.execute(`SELECT * FROM financial_items WHERE financial_declaration_id IN (${placeholders})`, ids);
            financialItems = items;
        }

        const shapeItem = (i) => ({ ...i, type: i.type || i.item_type || i.description || '' });
        const financialsWithItems = financialDeclarations.map(fd => {
            const items = financialItems.filter(it => it.financial_declaration_id === fd.id);
            return {
                ...fd,
                member_name: fd.member_name || (fd.member_type === 'user' ? 'User' : (fd.member_type || 'member') + '_' + fd.id),
                biennial_income: items.filter(i => i.item_type === 'income').map(shapeItem),
                assets: items.filter(i => i.item_type === 'asset').map(shapeItem),
                liabilities: items.filter(i => i.item_type === 'liability').map(shapeItem)
            };
        });

        const financial_unified = buildUnifiedFinancial(rootDecl, financialsWithItems, spouses, children);

        return res.json({
            success: true,
            declaration: {
                ...rootDecl,
                user: userProfile, // explicit user object for frontend
                spouses,
                children,
                financial_declarations: financialsWithItems,
                financial_unified
            }
        });
    } catch (err) {
        console.error('Error fetching declaration by ID:', err);
        return res.status(500).json({ success: false, message: 'Server error fetching declaration' });
    }
};

// Helper to build unified financial records
function buildUnifiedFinancial(rootDecl, financialsWithItems, spouses, children) {
    const parseJsonArray = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
            try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
        }
        return [];
    };
    const normalizeItems = (arr, defType) => parseJsonArray(arr).map(o => ({
        type: o.type || defType || o.description || '',
        description: o.description || '',
        value: o.value || '',
        ...o
    }));
    const unified = [];
    const rootIncome = normalizeItems(rootDecl.biennial_income, 'Income');
    const rootAssets = normalizeItems(rootDecl.assets, 'Asset');
    const rootLiabilities = normalizeItems(rootDecl.liabilities, 'Liability');
    if (rootIncome.length || rootAssets.length || rootLiabilities.length) {
        unified.push({
            member_type: 'user',
            member_name: rootDecl.first_name ? `${rootDecl.first_name} ${rootDecl.surname || ''}`.trim() : 'User',
            scope: 'root',
            data: { biennial_income: rootIncome, assets: rootAssets, liabilities: rootLiabilities, other_financial_info: rootDecl.other_financial_info || '' }
        });
    }
    financialsWithItems.forEach(fd => unified.push({
        member_type: fd.member_type || 'user',
        member_name: fd.member_name,
        scope: 'financial_declarations',
        data: {
            declaration_date: fd.declaration_date,
            period_start_date: fd.period_start_date,
            period_end_date: fd.period_end_date,
            biennial_income: fd.biennial_income,
            assets: fd.assets,
            liabilities: fd.liabilities,
            other_financial_info: fd.other_financial_info || ''
        }
    }));
    spouses.forEach(s => {
        const sIncome = normalizeItems(s.biennial_income, 'Income');
        const sAssets = normalizeItems(s.assets, 'Asset');
        const sLiabilities = normalizeItems(s.liabilities, 'Liability');
        if (sIncome.length || sAssets.length || sLiabilities.length) unified.push({
            member_type: 'spouse',
            member_name: s.full_name || `${s.first_name || ''} ${s.surname || ''}`.trim(),
            scope: 'spouses',
            data: { biennial_income: sIncome, assets: sAssets, liabilities: sLiabilities, other_financial_info: s.other_financial_info || '' }
        });
    });
    children.forEach(c => {
        const cIncome = normalizeItems(c.biennial_income, 'Income');
        const cAssets = normalizeItems(c.assets, 'Asset');
        const cLiabilities = normalizeItems(c.liabilities, 'Liability');
        if (cIncome.length || cAssets.length || cLiabilities.length) unified.push({
            member_type: 'child',
            member_name: c.full_name || `${c.first_name || ''} ${c.surname || ''}`.trim(),
            scope: 'children',
            data: { biennial_income: cIncome, assets: cAssets, liabilities: cLiabilities, other_financial_info: c.other_financial_info || '' }
        });
    });
    const dedupMap = new Map();
    unified.forEach(entry => {
        const key = entry.member_type + '::' + entry.member_name;
        if (!dedupMap.has(key)) dedupMap.set(key, entry); else {
            const existing = dedupMap.get(key);
            if (existing.scope !== 'financial_declarations' && entry.scope === 'financial_declarations') dedupMap.set(key, entry);
        }
    });
    return Array.from(dedupMap.values());
}

// On-demand PDF download (owner or super_admin)
exports.downloadDeclarationPDF = async (req, res) => {
    try {
        const declarationId = req.params.id;
        const userId = req.user.id;
        const [rows] = await db.query('SELECT user_id FROM declarations WHERE id = ?', [declarationId]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Declaration not found' });
        if (rows[0].user_id !== userId && req.user.role !== 'super_admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to download this declaration' });
        }
        const { generateDeclarationPDF } = require('../util/pdfBuilder');
        const { buffer, base, password, encryptionApplied } = await generateDeclarationPDF(declarationId);
        const safeNatId = (base.national_id || 'declaration').toString().replace(/[^A-Za-z0-9_-]/g, '_');
        const filename = `${safeNatId} DAILs Form.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        if (encryptionApplied && password) {
            res.setHeader('X-PDF-Password', password);
        }
        return res.send(buffer);
    } catch (err) {
        console.error('On-demand PDF generation failed:', err);
        return res.status(500).json({ success: false, message: 'Failed to generate PDF', error: err.message });
    }
};

// New endpoint: only unified financial data (rebuilds fresh)
exports.getDeclarationFinancialUnified = async (req, res) => {
    try {
        const userId = req.user.id;
        const declarationId = req.params.id;
        const db = require('../config/db');
        const [declRows] = await db.execute('SELECT * FROM declarations WHERE id = ? AND user_id = ?', [declarationId, userId]);
        if (declRows.length === 0) return res.status(404).json({ success: false, message: 'Declaration not found' });
        const rootDecl = declRows[0];
        const [spouses] = await db.execute('SELECT * FROM spouses WHERE declaration_id = ?', [declarationId]);
        const [children] = await db.execute('SELECT * FROM children WHERE declaration_id = ?', [declarationId]);
        const [financialDeclarations] = await db.execute('SELECT * FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
        const [financialItems] = await db.execute('SELECT * FROM financial_items WHERE financial_declaration_id IN (' + (financialDeclarations.map(fd => fd.id).join(',') || '0') + ')');
        const shapeItem = (i) => ({ ...i, type: i.type || i.item_type || i.description || '' });
        const financialsWithItems = financialDeclarations.map(fd => {
            const items = financialItems.filter(item => item.financial_declaration_id === fd.id);
            let member_name = fd.member_name || (fd.member_type === 'user' ? 'User' : (fd.member_type || 'member') + '_' + fd.id);
            return {
                ...fd,
                member_name,
                biennial_income: items.filter(i => i.item_type === 'income').map(shapeItem),
                assets: items.filter(i => i.item_type === 'asset').map(shapeItem),
                liabilities: items.filter(i => i.item_type === 'liability').map(shapeItem)
            };
        });
        const financial_unified = buildUnifiedFinancial(rootDecl, financialsWithItems, spouses, children);
        res.json({ success: true, financial_unified });
    } catch (err) {
        console.error('Error fetching unified financial data:', err);
        res.status(500).json({ success: false, message: 'Server error fetching unified financial data' });
    }
};
const Declaration = require('../models/declarationModel');

// Get all declarations for admin (with debug log)
exports.getAllDeclarations = async (req, res) => {
    try {
        const rows = await Declaration.findAll();
        // Debug log: print first row to verify all fields
        if (rows && rows.length > 0) {
            console.log('Admin Declarations API - First row:', rows[0]);
        } else {
            console.log('Admin Declarations API - No rows returned');
        }
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching all admin declarations:', error);
        res.status(500).json({ success: false, message: 'Server error fetching admin declarations' });
    }
};

// Get single declaration with details for admin
exports.getAdminDeclarationById = async (req, res) => {
    try {
        const declarationId = req.params.id;
        const declaration = await Declaration.findByIdWithDetails(declarationId);
        if (!declaration) {
            return res.status(404).json({ success: false, message: 'Declaration not found' });
        }
        return res.json({ success: true, data: declaration });
    } catch (error) {
        console.error('Error fetching admin declaration details:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching declaration details' });
    }
};
// Get all declarations for a user
exports.getDeclarations = async (req, res) => {
    try {
        const userId = req.user.id;
        const db = require('../config/db');
        const [rows] = await db.execute('SELECT * FROM declarations WHERE user_id = ?', [userId]);
        // For each declaration, fetch spouses and children
        for (const decl of rows) {
            const [spouses] = await db.execute('SELECT * FROM spouses WHERE declaration_id = ?', [decl.id]);
            const [children] = await db.execute('SELECT * FROM children WHERE declaration_id = ?', [decl.id]);
            decl.spouses = spouses;
            decl.children = children;
        }
        res.json({ success: true, declarations: rows });
    } catch (error) {
        console.error('Error fetching declarations:', error);
        res.status(500).json({ success: false, message: 'Server error fetching declarations' });
    }
};
const pool = require('../config/db');
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
            financialDeclarations,
            spouse_financials,
            child_financials,
            witness,
            declaration_type,
            periodStart,
            periodEnd,
            period_start_date,
            period_end_date
        } = req.body;
        // --- Declaration type logic ---
        const allowedTypes = ['First', 'Bienniel', 'Final'];
        if (!declaration_type || !allowedTypes.includes(declaration_type)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing declaration type.' });
        }

    // Fetch user's previous declarations
    const previousDeclarations = await Declaration.findByUserId(req.user.id);

        // Check for existing 'First' or 'Final' declaration
        if ((declaration_type === 'First' || declaration_type === 'Final') && previousDeclarations.some(d => d.declaration_type === declaration_type)) {
            return res.status(400).json({ success: false, message: `You can only submit a ${declaration_type} declaration once.` });
        }

        // Bienniel logic: only allowed every two years, Nov 1 - Dec 31, starting 2025
        if (declaration_type === 'Bienniel') {
            // Parse date
            let decDate = declaration_date;
            if (typeof decDate === 'string' && decDate.includes('/')) {
                // Convert DD/MM/YYYY to YYYY-MM-DD
                const [day, month, year] = decDate.split('/');
                decDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            const dateObj = new Date(decDate);
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth() + 1; // 1-based
            const day = dateObj.getDate();
            // Only allow odd years >= 2025
            if (year < 2025 || year % 2 === 0) {
                return res.status(400).json({ success: false, message: 'Bienniel declaration is only allowed every two years starting 2025.' });
            }
            // Only allow between Nov 1 and Dec 31
            const isAllowedWindow = (month === 11 && day >= 1) || (month === 12 && day <= 31);
            if (!isAllowedWindow) {
                return res.status(400).json({ success: false, message: 'Bienniel declaration is only allowed between Nov 1 and Dec 31 of the allowed year.' });
            }
            // Only one bienniel per allowed year
            if (previousDeclarations.some(d => d.declaration_type === 'Bienniel' && d.declaration_date && new Date(d.declaration_date).getFullYear() === year)) {
                return res.status(400).json({ success: false, message: 'You have already submitted a Bienniel declaration for this period.' });
            }
        }

                // Merge spouse_financials into spouses
                let mergedSpouses = spouses;
                if (Array.isArray(spouses) && Array.isArray(spouse_financials)) {
                    mergedSpouses = spouses.map((spouse, idx) => ({
                        ...spouse,
                        ...(spouse_financials[idx] || {})
                    }));
                }

                // Merge child_financials into children
                let mergedChildren = children;
                if (Array.isArray(children) && Array.isArray(child_financials)) {
                    mergedChildren = children.map((child, idx) => ({
                        ...child,
                        ...(child_financials[idx] || {})
                    }));
                }
                const user_id = req.user.id;

                // Validate required field
                if (!marital_status) {
                    return res.status(400).json({
                        success: false,
                        message: "Marital status is required."
                    });
                }

                // Helper to convert DD/MM/YYYY to YYYY-MM-DD
                function convertDateToISO(dateStr) {
                    if (!dateStr) return '';
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    }
                    return dateStr;
                }

                // Validate biennial_income: must be an array of objects with type, description, value
                let validBiennialIncome = biennial_income;
                if (!Array.isArray(validBiennialIncome) || !validBiennialIncome.every(item => item && typeof item === 'object' && 'type' in item && 'description' in item && 'value' in item)) {
                    return res.status(400).json({
                        success: false,
                        message: "Biennial income must be an array of objects with type, description, and value."
                    });
                }


                // Convert date to ISO format for DB
                const isoDeclarationDate = convertDateToISO(declaration_date);
                // Support both camelCase and snake_case for period start/end
                const isoPeriodStart = convertDateToISO(periodStart || period_start_date || '');
                const isoPeriodEnd = convertDateToISO(periodEnd || period_end_date || '');

                // Use model for declaration creation
                const declaration = await Declaration.create({
                    user_id,
                    department,
                    marital_status,
                    declaration_date: isoDeclarationDate,
                    period_start_date: isoPeriodStart,
                    period_end_date: isoPeriodEnd,
                    biennial_income: validBiennialIncome,
                    assets,
                    liabilities,
                    other_financial_info,
                    signature_path,
                    declaration_type,
                    status: req.body.status || 'pending'
                });
                const declarationId = declaration.id;

                // Insert spouses
                if (mergedSpouses && Array.isArray(mergedSpouses) && mergedSpouses.length > 0) {
                    await Declaration.createSpouses(declarationId, mergedSpouses);
                }

                // Insert children
                if (mergedChildren && Array.isArray(mergedChildren) && mergedChildren.length > 0) {
                    await Declaration.createChildren(declarationId, mergedChildren);
                }

                // Insert financial declarations and items
                if (financialDeclarations && Array.isArray(financialDeclarations) && financialDeclarations.length > 0) {
                    const FinancialDeclaration = require('../models/financialDeclaration');
                    const FinancialItem = require('../models/financialItem');
                    for (const finDecl of financialDeclarations) {
                        // Validate member_type
                        const allowedTypes = ['user', 'spouse', 'child'];
                        const validType = allowedTypes.includes(finDecl.member_type?.toLowerCase()) ? finDecl.member_type.toLowerCase() : 'user';

                        // Skip spouse/child financial declarations if no spouse/child provided
                        if ((validType === 'spouse' && (!req.body.spouses || req.body.spouses.length === 0)) ||
                            (validType === 'child' && (!req.body.children || req.body.children.length === 0))) {
                            continue;
                        }

                        // Fallback for member_name
                        let memberName = finDecl.member_name;
                        if (!memberName) {
                            if (validType === 'user' && req.user) {
                                memberName = req.user.surname ? `${req.user.surname} ${req.user.first_name} ${req.user.other_names || ''}`.trim() : 'User';
                            } else if (validType === 'spouse' && req.body.spouses && req.body.spouses.length > 0) {
                                memberName = req.body.spouses[0].surname ? `${req.body.spouses[0].first_name} ${req.body.spouses[0].other_names || ''} ${req.body.spouses[0].surname}`.trim() : 'Spouse';
                            } else if (validType === 'child' && req.body.children && req.body.children.length > 0) {
                                memberName = req.body.children[0].surname ? `${req.body.children[0].first_name} ${req.body.children[0].other_names || ''} ${req.body.children[0].surname}`.trim() : 'Child';
                            } else {
                                memberName = 'Unknown';
                            }
                        }
                        const financialDeclaration = await FinancialDeclaration.create({
                            declaration_id: declarationId,
                            member_type: validType,
                            member_name: memberName,
                            declaration_date: finDecl.declaration_date || declaration_date,
                            period_start_date: finDecl.period_start_date || isoPeriodStart || declaration_date || '',
                            period_end_date: finDecl.period_end_date || isoPeriodEnd || declaration_date || '',
                            other_financial_info: finDecl.other_financial_info || '',
                            status: finDecl.status || undefined
                        });
                        // Insert financial items
                        if (finDecl.items && Array.isArray(finDecl.items)) {
                            for (const item of finDecl.items) {
                                // Validate item_type
                                const allowedItemTypes = ['income', 'asset', 'liability'];
                                const validItemType = allowedItemTypes.includes(item.item_type?.toLowerCase()) ? item.item_type.toLowerCase() : 'income';
                                await FinancialItem.create({
                                    financial_declaration_id: financialDeclaration.id,
                                    item_type: validItemType,
                                    description: item.description,
                                    value: item.value,
                                    status: item.status || undefined
                                });
                            }
                        }
                    }
                }

                // Save witness data if provided
                if (witness) {
                    await pool.query(
                        'UPDATE declarations SET witness_signed = ?, witness_name = ?, witness_address = ?, witness_phone = ? WHERE id = ?',
                        [witness.signed ? 1 : 0, witness.name, witness.address, witness.phone || '', declarationId]
                    );
                    // Notify witness via SMS
                    try {
                        if (witness.phone) {
                            const sendSMS = require('../util/sendSMS');
                            // Fetch user name to personalize message
                            const [urows] = await pool.query('SELECT first_name, other_names, surname FROM users WHERE id = ?', [req.user.id]);
                            const nameParts = [];
                            if (urows && urows[0]) {
                                if (urows[0].first_name) nameParts.push(urows[0].first_name);
                                if (urows[0].other_names) nameParts.push(urows[0].other_names);
                                if (urows[0].surname) nameParts.push(urows[0].surname);
                            }
                            const fullName = nameParts.join(' ') || 'an employee';
                            await sendSMS({
                                to: witness.phone,
                                body: `You have been selected as a witness by ${fullName} in their DIALs.`
                            });
                        }
                    } catch (e) {
                        console.error('Witness SMS notify error:', e.message);
                    }
                }
                // Send confirmation email to user with PDF attachment via shared builder
                try {
                    const sendEmail = require('../util/sendEmail');
                    const sendSMS = require('../util/sendSMS');
                    const { generateDeclarationPDF } = require('../util/pdfBuilder');
                    const { buffer: pdfBuffer, base } = await generateDeclarationPDF(declarationId);

                    // Ensure recipient email
                    let recipientEmail = req.user?.email;
                    if (!recipientEmail) {
                        try {
                            const getCurrentUser = require('../util/currentUser');
                            const fullUser = await getCurrentUser(req.user.id, { refresh: true });
                            recipientEmail = fullUser?.email;
                        } catch (e) {
                            console.warn('Could not hydrate user email for PDF email:', e.message);
                        }
                    }
                    if (!recipientEmail) throw new Error('User email not found for confirmation email');

                    const safeNatId = (base.national_id || 'declaration').toString().replace(/[^A-Za-z0-9_-]/g,'_');
                    const filename = `${safeNatId} DAILs Form.pdf`;

                    await sendEmail({
                        to: recipientEmail,
                        subject: 'Declaration Submitted Successfully',
                        text: `Dear ${base.first_name || 'Employee'},\n\nYour declaration form has been successfully submitted. A PDF summary is attached.\n\nThank you!`,
                        html: `<p>Dear ${base.first_name || 'Employee'},</p><p>Your declaration form has been <b>successfully submitted</b>. A PDF summary is attached.</p><p>Thank you!</p>`,
                        attachments: [
                            { filename, content: pdfBuffer, contentType: 'application/pdf' }
                        ]
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
