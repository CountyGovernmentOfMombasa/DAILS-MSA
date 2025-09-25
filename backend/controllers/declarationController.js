// --- Update Declaration (PUT) ---
exports.updateDeclaration = async (req, res) => {
    try {
        const declarationId = req.params.id;
        const userId = req.user.id;
        const {
            surname, first_name, other_names, email, marital_status, payroll_number, birthdate, place_of_birth, department,
            spouses, children, financial_declarations, witness_signed, witness_name, witness_address, witness_phone, declaration_checked,
            biennial_income, assets, liabilities, other_financial_info, declaration_date, period_start_date, period_end_date
        } = req.body;

        // Fetch existing witness info to detect changes
        let oldWitnessPhone = null;
        try {
            const [oldRows] = await db.execute('SELECT witness_phone FROM declarations WHERE id = ? AND user_id = ?', [declarationId, userId]);
            if (oldRows && oldRows[0]) oldWitnessPhone = oldRows[0].witness_phone || null;
        } catch (e) {
            console.warn('Could not fetch previous witness info for change detection:', e.message);
        }

        // Update main declaration fields including financial data
        await db.execute(
            `UPDATE declarations SET 
                surname=?, first_name=?, other_names=?, email=?, marital_status=?, payroll_number=?, 
                birthdate=?, place_of_birth=?, department=?, witness_signed=?, witness_name=?, 
                witness_address=?, witness_phone=?, declaration_checked=?, biennial_income=?, 
                assets=?, liabilities=?, other_financial_info=?, declaration_date=?, 
                period_start_date=?, period_end_date=?, updated_at=CURRENT_TIMESTAMP 
             WHERE id=? AND user_id=?`,
            [
                surname, first_name, other_names, email, marital_status, payroll_number, 
                birthdate, place_of_birth, department, witness_signed ? 1 : 0, witness_name, 
                witness_address, witness_phone, declaration_checked ? 1 : 0, 
                JSON.stringify(biennial_income || []), assets || '', liabilities || '', 
                other_financial_info || '', declaration_date, period_start_date, period_end_date,
                declarationId, userId
            ]
        );

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
                await sendSMS({ to: witness_phone, body: `WDP: You have been selected as a witness by ${fullName} for a declaration.` });
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
            const FinancialDeclaration = require('../models/financialDeclaration');
            const FinancialItem = require('../models/financialItem');
            
            for (const finDecl of financial_declarations) {
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
// --- Edit Request Handler (Direct SQL) ---
const db = require('../config/db');
exports.requestEdit = async (req, res) => {
    try {
        const declarationId = req.params.id;
        const userId = req.user.id;
        const { reason, date } = req.body;
        if (!reason) return res.status(400).json({ message: 'Reason is required.' });
        await db.execute(
            'INSERT INTO declaration_edit_requests (declarationId, userId, reason, requestedAt) VALUES (?, ?, ?, ?)',
            [declarationId, userId, reason, date || new Date()]
        );
        res.json({ message: 'Edit request recorded.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to record edit request.' });
    }
};

// --- View All Edit Requests (Admin, Direct SQL) ---
exports.getAllEditRequests = async (req, res) => {
    try {
        const [requests] = await db.execute(
            'SELECT * FROM declaration_edit_requests ORDER BY requestedAt DESC'
        );
        res.json({ success: true, data: requests });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch edit requests.' });
    }
};
// Get a single declaration by ID for the logged-in user (with full financial data)
exports.getDeclarationById = async (req, res) => {
    try {
        const userId = req.user.id;
        const declarationId = req.params.id;
        const db = require('../config/db');
        // Join with users table so frontend edit forms can auto-populate personal details
        const [rows] = await db.execute(`
            SELECT d.*,
                   u.surname,
                   u.first_name,
                   u.other_names,
                   u.birthdate,
                   u.place_of_birth,
                   u.postal_address,
                   u.physical_address,
                   u.email,
                   u.national_id,
                   u.payroll_number,
                   u.designation,
                   u.department,
                   u.nature_of_employment AS nature_of_employment
            FROM declarations d
            INNER JOIN users u ON d.user_id = u.id
            WHERE d.id = ? AND d.user_id = ?
        `, [declarationId, userId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Declaration not found' });
        }
        // Fetch related spouses and children
        const [spouses] = await db.execute('SELECT * FROM spouses WHERE declaration_id = ?', [declarationId]);
        const [children] = await db.execute('SELECT * FROM children WHERE declaration_id = ?', [declarationId]);
        // Fetch related financial_declarations
        const [financialDeclarations] = await db.execute('SELECT * FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
        // Fetch financial items for each declaration
        const [financialItems] = await db.execute('SELECT * FROM financial_items WHERE financial_declaration_id IN (' + (financialDeclarations.map(fd => fd.id).join(',') || '0') + ')');
        // Attach items to each financial declaration
        const shapeItem = (i) => ({
            ...i,
            type: i.type || i.item_type || i.description || ''
        });
        const financialsWithItems = financialDeclarations.map(fd => {
            const items = financialItems.filter(item => item.financial_declaration_id === fd.id);
            // Ensure member_name present for frontend mapping (fallback using member_type + index)
            let member_name = fd.member_name;
            if (!member_name || !member_name.trim()) {
                if (fd.member_type === 'user') {
                    member_name = rows[0].first_name ? `${rows[0].first_name} ${rows[0].surname || ''}`.trim() : 'User';
                } else {
                    member_name = (fd.member_type || 'member') + '_' + fd.id;
                }
            }
            return {
                ...fd,
                member_name,
                biennial_income: items.filter(i => i.item_type === 'income').map(shapeItem),
                assets: items.filter(i => i.item_type === 'asset').map(shapeItem),
                liabilities: items.filter(i => i.item_type === 'liability').map(shapeItem),
            };
        });

        const financial_unified = buildUnifiedFinancial(rows[0], financialsWithItems, spouses, children);
        res.json({
            success: true,
            declaration: {
                ...rows[0],
                spouses,
                children,
                financial_declarations: financialsWithItems,
                financial_unified
            }
        });
    } catch (error) {
        console.error('Error fetching declaration by ID:', error);
        res.status(500).json({ success: false, message: 'Server error fetching declaration' });
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
                                body: `WDP: You have been selected as a witness by ${fullName} for a declaration.`
                            });
                        }
                    } catch (e) {
                        console.error('Witness SMS notify error:', e.message);
                    }
                }
                // Send confirmation email to user with PDF attachment
                try {
                    const sendEmail = require('../util/sendEmail');
                    const sendSMS = require('../util/sendSMS');
                    // Fetch a snapshot of the declaration with related entities for PDF
                    let snapshot = {};
                    try {
                        const [declRows] = await pool.query('SELECT * FROM declarations WHERE id = ?', [declarationId]);
                        snapshot = declRows[0] || {};
                        const [spousesRows] = await pool.query('SELECT first_name, other_names, surname FROM spouses WHERE declaration_id = ?', [declarationId]);
                        const [childrenRows] = await pool.query('SELECT first_name, other_names, surname FROM children WHERE declaration_id = ?', [declarationId]);
                        const [finDecls] = await pool.query('SELECT id, member_type, member_name, period_start_date, period_end_date FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
                        let items = [];
                        if (finDecls.length > 0) {
                            const finIds = finDecls.map(f=>f.id);
                            const placeholders = finIds.map(()=>'?').join(',');
                            const [itRows] = await pool.query(`SELECT financial_declaration_id, item_type, description, value FROM financial_items WHERE financial_declaration_id IN (${placeholders}) LIMIT 300`, finIds);
                            items = itRows;
                        }
                        snapshot._spouses = spousesRows;
                        snapshot._children = childrenRows;
                        snapshot._finDecls = finDecls;
                        snapshot._finItems = items;
                    } catch (snapErr) {
                        console.error('PDF snapshot fetch error:', snapErr.message);
                    }

                    // Generate PDF buffer with pdfkit (full itemization + pagination + logo)
                    const PDFDocument = require('pdfkit');
                    const fs = require('fs');
                    const path = require('path');
                    const pdfBuffers = [];
                    const doc = new PDFDocument({ margin: 40 });
                    doc.on('data', chunk => pdfBuffers.push(chunk));
                    const pdfPromise = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(pdfBuffers))));

                    // Helper: safe page break before writing a block
                    const ensureSpace = (required = 20) => {
                        if (doc.y + required > doc.page.height - doc.page.margins.bottom) {
                            doc.addPage();
                        }
                    };
                    const heading = (text) => { ensureSpace(30); doc.moveDown(0.5); doc.fontSize(13).fillColor('#0a0a0a').text(text); doc.moveDown(0.2); doc.fontSize(10).fillColor('#000'); };
                    const field = (label, value) => { ensureSpace(14); doc.font('Helvetica-Bold').text(label + ': ', { continued: true }); doc.font('Helvetica').text(value || ''); };

                    // Try to embed logo (frontend logo path reused)
                    try {
                        const logoPath = path.resolve(__dirname, '../../my-app/public/logo192.png');
                        if (fs.existsSync(logoPath)) {
                            const img = fs.readFileSync(logoPath);
                            doc.image(img, (doc.page.width/2) - 40, 20, { width: 80 });
                            doc.moveDown(5);
                        }
                    } catch (logoErr) {
                        console.warn('Logo embed failed:', logoErr.message);
                        doc.moveDown(2);
                    }

                    // Title
                    doc.fontSize(16).text('DECLARATION OF INCOME, ASSETS AND LIABILITIES', { align: 'center' });
                    doc.moveDown(0.3).fontSize(12).text('County Government of Mombasa', { align: 'center' });
                    doc.moveDown();
                    doc.fontSize(10).fillColor('#555');
                    field('Declaration ID', String(declarationId));
                    field('Submitted At', snapshot.submitted_at || snapshot.created_at || '');
                    field('Declaration Type', snapshot.declaration_type || '');
                    doc.moveDown(0.5);

                    heading('Employee Details');
                    const nameLine = `${snapshot.surname || ''}, ${snapshot.first_name || ''} ${snapshot.other_names || ''}`.trim();
                    field('Name', nameLine);
                    field('National ID', snapshot.national_id || '');
                    field('Payroll Number', snapshot.payroll_number || '');
                    field('Department', snapshot.department || '');
                    field('Designation', snapshot.designation || '');
                    field('Marital Status', snapshot.marital_status || '');
                    field('Birthdate', snapshot.birthdate || '');
                    field('Place of Birth', snapshot.place_of_birth || '');
                    field('Email', snapshot.email || req.user.email || '');

                    heading('Financial Period');
                    field('Period Start Date', snapshot.period_start_date || '');
                    field('Period End Date', snapshot.period_end_date || '');

                    heading('Family');
                    field('Spouses', (snapshot._spouses||[]).map(s=>[s.first_name,s.other_names,s.surname].filter(Boolean).join(' ')).join('; ') || 'None');
                    field('Children', (snapshot._children||[]).map(c=>[c.first_name,c.other_names,c.surname].filter(Boolean).join(' ')).join('; ') || 'None');

                    heading('Financial Declarations');
                    if ((snapshot._finDecls||[]).length === 0) {
                        field('Info', 'No financial declarations');
                    } else {
                        snapshot._finDecls.forEach(fd => {
                            ensureSpace(40);
                            doc.font('Helvetica-Bold').text(`• ${fd.member_type.toUpperCase()} - ${fd.member_name}`);
                            doc.font('Helvetica').text(`  Period: ${(fd.period_start_date || '')} -> ${(fd.period_end_date || '')}`);
                        });
                    }

                    heading('Financial Items (Full Listing)');
                    const items = snapshot._finItems || [];
                    if (items.length === 0) {
                        field('Info', 'No financial items recorded');
                    } else {
                        // Group by declaration id then list
                        const itemsByDecl = items.reduce((acc,it)=>{ (acc[it.financial_declaration_id] = acc[it.financial_declaration_id] || []).push(it); return acc; },{});
                        Object.entries(itemsByDecl).forEach(([finId, list]) => {
                            ensureSpace(24);
                            doc.font('Helvetica-Bold').text(`Declaration #${finId}`);
                            list.forEach(it => {
                                ensureSpace(14);
                                doc.font('Helvetica').text(`  - [${it.item_type}] ${it.description || 'No description'} : ${it.value || 0}`);
                            });
                        });
                    }

                    doc.moveDown();
                    // Signatures / Witness Block
                    heading('Signatures');
                    ensureSpace(80);
                    // Declarant signature placeholders
                    doc.font('Helvetica-Bold').text('Declarant Acknowledgement');
                    doc.font('Helvetica').moveDown(0.3).text('I hereby declare that the information provided herein is true, complete and accurate to the best of my knowledge.', { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
                    doc.moveDown(0.8);
                    const startY = doc.y;
                    const col1X = doc.x;
                    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;
                    // Declarant signature line
                    doc.text('Signature: _______________________________', col1X, startY);
                    doc.text('Date: ___________________', col1X, startY + 18);
                    // Witness block (if any data) on right side
                    const witnessX = col1X + colWidth + 20;
                    if (snapshot.witness_name || snapshot.witness_address || snapshot.witness_phone) {
                        doc.font('Helvetica-Bold').text('Witness', witnessX, startY);
                        doc.font('Helvetica').text(`Name: ${snapshot.witness_name || ''}`, witnessX, startY + 14);
                        doc.text(`Phone: ${snapshot.witness_phone || ''}`, witnessX, startY + 28);
                        doc.text(`Address: ${snapshot.witness_address || ''}`, witnessX, startY + 42, { width: colWidth });
                        doc.text('Signature: ___________________', witnessX, startY + 60);
                        doc.text('Date: ___________________', witnessX, startY + 78);
                        if (snapshot.witness_signed) {
                            doc.font('Helvetica-Oblique').fillColor('#0a0').text('(Witness marked as signed in system)', witnessX, startY + 96);
                            doc.fillColor('#000');
                        }
                        doc.moveDown(6);
                    } else {
                        doc.font('Helvetica-Oblique').fillColor('#555').text('No witness information provided.', col1X, startY + 40);
                        doc.fillColor('#000');
                        doc.moveDown(4);
                    }

                    // Optional digital signature placeholder (system could embed image later)
                    ensureSpace(40);
                    doc.font('Helvetica-Bold').text('Digital Signature (System Use)');
                    doc.font('Helvetica').moveDown(0.3).text('If this document was signed electronically, a hash or signature reference may appear below:');
                    doc.moveDown(0.5);
                    doc.font('Courier').fontSize(8).text('[ Signature Hash Placeholder ]', { align: 'center' });
                    doc.fontSize(10).font('Helvetica');

                    doc.fontSize(9).fillColor('#666').text('Automatically generated PDF – retain for your records.', { align: 'center' });
                    doc.end();
                    const pdfBuffer = await pdfPromise;

                    // Ensure we have recipient email (JWT payload may not include it)
                    let recipientEmail = req.user && req.user.email;
                    if (!recipientEmail && req.user && req.user.id) {
                        try {
                            const getCurrentUser = require('../util/currentUser');
                            const fullUser = await getCurrentUser(req.user.id, { refresh: true });
                            recipientEmail = fullUser?.email;
                        } catch (e) {
                            console.warn('Fallback user fetch for email failed:', e.message);
                        }
                    }
                    if (!recipientEmail) throw new Error('User email not found for confirmation email');
                    await sendEmail({
                        to: recipientEmail,
                        subject: 'Declaration Submitted Successfully',
                        text: `Dear ${req.user.first_name || 'Employee'},\n\nYour declaration form has been successfully submitted. A PDF summary is attached.\n\nThank you!`,
                        html: `<p>Dear ${req.user.first_name || 'Employee'},</p><p>Your declaration form has been <b>successfully submitted</b>. A PDF summary is attached.</p><p>Thank you!</p>`,
                        attachments: [
                            {
                                filename: `declaration_${declarationId}.pdf`,
                                content: pdfBuffer,
                                contentType: 'application/pdf'
                            }
                        ]
                    });
                    // SMS confirmation (best effort)
                    if (req.user && req.user.id) {
                        try {
                            const [u] = await pool.query('SELECT phone_number FROM users WHERE id = ?', [req.user.id]);
                            const phone = u[0]?.phone_number;
                            if (phone) {
                                await sendSMS({ to: phone, body: 'WDP: Your declaration was submitted successfully.' });
                            }
                        } catch (e) {
                            console.error('SMS submit notify error:', e.message);
                        }
                    }
                } catch (emailErr) {
                    console.error('Error sending confirmation email:', emailErr);
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
