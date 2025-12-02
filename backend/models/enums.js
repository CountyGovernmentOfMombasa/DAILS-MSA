// Centralized enums for departments and sub-departments (2025-10-02)
// Added 'Executive' department and initial generic sub-departments list.
// Keep this in sync with frontend constants (e.g., DepartmentOverview) and validation logic.

const DEPARTMENTS = [
  'Executive',
  'Department of Public Service Administration, Youth, Gender and Sports',
  'Department of Blue Economy, Cooperatives, Agriculture and Livestock',
  'Department of Environment and Water',
  'Department of Transport, Infrastructure and Governance',
  'Department of Climate Change, Energy and Natural Resources',
  'Department of Lands, Urban Planning, Housing and Serikali Mtaani',
  'Department of Education and Vocational Training',
  'Department of Finance, Economic Planning and Digital Transformation',
  'Department of Health',
  'Department of Trade, Tourism and Culture',
  'Mombasa County Public Service Board',
  'Corporations'
];

// Hierarchical mapping: Department -> Array of sub-departments
// Where a department has no provided breakdown, we repeat the department name as its sole sub-department.
const SUB_DEPARTMENT_MAP = {
  'Executive': [
    'Office of the Governor',
    'Office of the Deputy Governor',
    'Office of the County Secretary',
    'Office of the County Attorney'
  ],
  'Department of Public Service Administration, Youth, Gender and Sports': [
    'Public Service Administration',
    'Youth, gender, sports and social services'
  ],
  'Department of Blue Economy, Cooperatives, Agriculture and Livestock': [
    'Department of Blue Economy, Cooperatives, Agriculture and Livestock'
  ],
  'Department of Environment and Water': [
    'Environment and Solid Waste Management',
    'Water and Sanitation'
  ],
  'Department of Transport, Infrastructure and Governance': [
    'Transport and Infrastructure',
    'Governance'
  ],
  'Department of Climate Change, Energy and Natural Resources': [
    'Department of Climate Change, Energy and Natural Resources'
  ],
  'Department of Lands, Urban Planning, Housing and Serikali Mtaani': [
    'Lands, Urban Planning and Housing', 'Serikali Mtaani', 'Ardi Fund'
  ],
  'Department of Education and Vocational Training': [
    'Department of Education and Vocational Training', 'Elimu Scheme'
  ],
  'Department of Finance, Economic Planning and Digital Transformation': [
    'Finance and Investment',
    'Economic Planning and Digital Transformation'
  ],
  'Department of Health': [
    'Clinical Services', 'Public Health and Disease Prevention', 'Coast General Teaching and Referral Hospital (CGTRH)'
  ],
  'Department of Trade, Tourism and Culture': [
    'Department of Trade, Tourism and Culture'
  ],
  'Mombasa County Public Service Board': [
    'Mombasa County Public Service Board'
  ],
  'Corporations': [
    'Mombasa Water Supply & Sanitation Company Limited (MOWASSCO)', 'Mombasa Investment Cooporation (MIC)'
  ]
};

// Flattened list for simple validation scenarios
const SUB_DEPARTMENTS = Array.from(new Set(Object.values(SUB_DEPARTMENT_MAP).flat()));

module.exports = { DEPARTMENTS, SUB_DEPARTMENTS, SUB_DEPARTMENT_MAP };
