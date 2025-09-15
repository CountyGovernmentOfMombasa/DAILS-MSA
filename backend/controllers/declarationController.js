const Declaration = require('../models/declarationModel');
// Get all declarations for a user
exports.getDeclarations = async (req, res) => {
    try {
        const userId = req.user.id;
        const db = require('../config/db');
        const [rows] = await db.execute('SELECT * FROM declarations WHERE user_id = ?', [userId]);
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
            annual_income,
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
            declaration_type // <-- new field
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

                // Validate annual_income: must be a positive number
                let validAnnualIncome = Number(annual_income);
                if (isNaN(validAnnualIncome) || validAnnualIncome <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Annual income must be a positive number."
                    });
                }

                // Convert date to ISO format for DB
                const isoDeclarationDate = convertDateToISO(declaration_date);

                // Use model for declaration creation
                const declaration = await Declaration.create({
                    user_id,
                    department,
                    marital_status,
                    declaration_date: isoDeclarationDate,
                    annual_income: validAnnualIncome,
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
                            period_start_date: finDecl.period_start_date || declaration_date || '',
                            period_end_date: finDecl.period_end_date || declaration_date || '',
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
                        'UPDATE declarations SET witness_signed = ?, witness_name = ?, witness_address = ? WHERE id = ?',
                        [witness.signed ? 1 : 0, witness.name, witness.address, declarationId]
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
