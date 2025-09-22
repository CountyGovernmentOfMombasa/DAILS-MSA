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
        const [rows] = await db.execute('SELECT * FROM declarations WHERE id = ? AND user_id = ?', [declarationId, userId]);
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
        const financialsWithItems = financialDeclarations.map(fd => {
            const items = financialItems.filter(item => item.financial_declaration_id === fd.id);
            return {
                ...fd,
                biennial_income: items.filter(i => i.item_type === 'income'),
                assets: items.filter(i => i.item_type === 'asset'),
                liabilities: items.filter(i => i.item_type === 'liability'),
            };
        });
        res.json({
            success: true,
            declaration: {
                ...rows[0],
                spouses,
                children,
                financial_declarations: financialsWithItems
            }
        });
    } catch (error) {
        console.error('Error fetching declaration by ID:', error);
        res.status(500).json({ success: false, message: 'Server error fetching declaration' });
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
                }
                // Send confirmation email to user
                try {
                    const sendEmail = require('../util/sendEmail');
                    await sendEmail({
                        to: req.user.email,
                        subject: 'Declaration Submitted Successfully',
                        text: `Dear ${req.user.first_name},\n\nYour declaration form has been successfully submitted.\n\nThank you!`,
                        html: `<p>Dear ${req.user.first_name},</p><p>Your declaration form has been <b>successfully submitted</b>.</p><p>Thank you!</p>`
                    });
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
