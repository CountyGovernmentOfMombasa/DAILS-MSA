const pool = require('../config/db');

exports.submitDeclaration = async (req, res) => {
    try {
        const { marital_status, declaration_date, annual_income, assets, liabilities, other_financial_info, signature_path } = req.body;
        const user_id = req.user.id; // Get user_id from authenticated user
        
        const [result] = await pool.query(
            'INSERT INTO declarations (user_id, marital_status, declaration_date, annual_income, assets, liabilities, other_financial_info, signature_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
            [user_id, marital_status, declaration_date, annual_income, assets, liabilities, other_financial_info, signature_path]
        );
        
        return res.status(201).json({ 
            success: true,
            declaration_id: result.insertId,
            message: 'Declaration submitted successfully'
        });
    } catch (error) {
        console.error('Declaration submission error:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Server error during declaration submission',
            error: error.message 
        });
    }
};

exports.getDeclarations = async (req, res) => {
    try {
        const [declarations] = await pool.query(
            'SELECT * FROM declarations WHERE user_id = ? ORDER BY declaration_date DESC', 
            [req.user.id]
        );
        
        return res.json({
            success: true,
            declarations
        });
    } catch (error) {
        console.error('Get declarations error:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Server error while fetching declarations',
            error: error.message 
        });
    }
};
