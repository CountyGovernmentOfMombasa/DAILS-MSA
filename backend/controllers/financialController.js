const Declaration = require('../models/declarationModel');
const FinancialDeclaration = require('../models/financialDeclaration');

// Get latest declaration's financial data for current user
exports.getFinancialData = async (req, res) => {
  try {
    const userId = req.user.id;
    // Get latest declaration for user
    const declarations = await Declaration.findByUserId(userId);
    if (!declarations || declarations.length === 0) {
      return res.json({ financialDeclarations: [] });
    }
    // Sort by declaration_date descending, get latest
    const latest = declarations.sort((a, b) => new Date(b.declaration_date) - new Date(a.declaration_date))[0];
    if (!latest || !latest.id) {
      return res.json({ financialDeclarations: [] });
    }

    // Get financial declarations for latest declaration
    const financialDeclarations = await FinancialDeclaration.findByDeclarationId(latest.id);

    // Get spouses and children for latest declaration (with financial fields)
    const [spouses] = await require('../config/db').query(
  `SELECT id, first_name, other_names, surname, full_name, biennial_income, assets, liabilities, other_financial_info FROM spouses WHERE declaration_id = ?`,
      [latest.id]
    );
    const [children] = await require('../config/db').query(
  `SELECT id, first_name, other_names, surname, full_name, biennial_income, assets, liabilities, other_financial_info FROM children WHERE declaration_id = ?`,
      [latest.id]
    );
    // Exclude children with empty names (all name fields empty or whitespace)
    const filteredChildren = children.filter(c => {
      const name = `${c.first_name || ''}${c.other_names || ''}${c.surname || ''}${c.full_name || ''}`.replace(/\s+/g, '');
      return name.length > 0;
    });

    // Helper to build member name
    const buildName = (obj) => (obj.full_name || `${obj.first_name || ''} ${obj.other_names || ''} ${obj.surname || ''}`).replace(/\s+/g, ' ').trim();

    // Build user entry
    const userName = buildName({
      first_name: req.user.first_name,
      other_names: req.user.other_names,
      surname: req.user.surname,
      full_name: req.user.full_name
    }) || 'User';
    const members = [
      { type: 'user', name: userName, data: latest },
      ...spouses.map(s => ({ type: 'spouse', name: buildName(s), data: s })),
      ...filteredChildren.map(c => ({ type: 'child', name: buildName(c), data: c }))
    ];

    // For each member, find their financial declaration or fallback to declaration/spouse/child table
    const result = members.map(member => {
      const found = financialDeclarations.find(fd =>
        (fd.member_type === member.type) &&
        (fd.member_name && member.name && fd.member_name.replace(/\s+/g, ' ').trim().toLowerCase() === member.name.toLowerCase())
      );
      if (found) {
        // Parse JSON fields if present
        return {
          ...found,
          annual_income: found.annual_income ? JSON.parse(found.annual_income) : [],
          assets: found.assets ? JSON.parse(found.assets) : [],
          liabilities: found.liabilities ? JSON.parse(found.liabilities) : [],
        };
      }
      // Fallback: use data from declaration, spouse, or child table
      let biennial_income = [];
      let assets = [];
      let liabilities = [];
      let other_financial_info = '';
      if (member.type === 'user') {
        try { biennial_income = member.data.biennial_income ? JSON.parse(member.data.biennial_income) : []; } catch { biennial_income = []; }
        try { assets = member.data.assets ? JSON.parse(member.data.assets) : []; } catch { assets = []; }
        try { liabilities = member.data.liabilities ? JSON.parse(member.data.liabilities) : []; } catch { liabilities = []; }
        other_financial_info = member.data.other_financial_info || '';
      } else {
        try { biennial_income = member.data.biennial_income ? JSON.parse(member.data.biennial_income) : []; } catch { biennial_income = []; }
        try { assets = member.data.assets ? JSON.parse(member.data.assets) : []; } catch { assets = []; }
        try { liabilities = member.data.liabilities ? JSON.parse(member.data.liabilities) : []; } catch { liabilities = []; }
        other_financial_info = member.data.other_financial_info || '';
      }
      return {
        member_type: member.type,
        member_name: member.name,
        declaration_date: latest.declaration_date,
        period_start_date: latest.period_start_date || latest.declaration_date,
        period_end_date: latest.period_end_date || latest.declaration_date,
        annual_income,
        assets,
        liabilities,
        other_financial_info
      };
    });
  console.log('DEBUG financialDeclarations result:', JSON.stringify(result, null, 2));
  res.json({ financialDeclarations: result });
  } catch (err) {
    console.error('Error fetching financial data:', err);
    res.status(500).json({ message: 'Server error fetching financial data' });
  }
};
