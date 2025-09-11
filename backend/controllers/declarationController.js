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
            witness
        } = req.body;

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
                const Declaration = require('../models/declarationModel');
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
