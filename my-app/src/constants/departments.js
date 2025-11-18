// Centralized department and sub-department mappings
// Keep in sync with backend/models/enums.js
export const DEPARTMENTS = [
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

export const SUB_DEPARTMENT_MAP = {
  'Executive': ['Office of the Governor','Office of the Deputy Governor','Office of the County Secretary','Office of the County Attorney'],
  'Department of Public Service Administration, Youth, Gender and Sports': ['Public Service Administration','Youth, gender, sports and social services'],
  'Department of Blue Economy, Cooperatives, Agriculture and Livestock': ['Department of Blue Economy, Cooperatives, Agriculture and Livestock'],
  'Department of Environment and Water': ['Environment and Solid Waste Management','Water and Sanitation'],
  'Department of Transport, Infrastructure and Governance': ['Transport and Infrastructure','Governance'],
  'Department of Climate Change, Energy and Natural Resources': ['Department of Climate Change, Energy and Natural Resources'],
  'Department of Lands, Urban Planning, Housing and Serikali Mtaani': ['Lands, Urban Planning and Housing','Serikali Mtaani', 'Ardi Fund'],
  'Department of Education and Vocational Training': ['Department of Education and Vocational Training','Elimu Scheme',],
  'Department of Finance, Economic Planning and Digital Transformation': ['Finance and Investment','Economic Planning and Digital Transformation'],
  'Department of Health': ['Clinical Services','Public Health and Disease Prevention','Coast General Teaching and Referral Hospital (CGTRH)'],
  'Department of Trade, Tourism and Culture': ['Department of Trade, Tourism and Culture'],
  'Mombasa County Public Service Board': ['Mombasa County Public Service Board']
  ,
  'Corporations': ['Mombasa Water Supply & Sanitation Company Limited (MOWASSCO)','Mombasa Investment Cooporation (MIC)']
};

// Flattened list
export const SUB_DEPARTMENTS = Array.from(new Set(Object.values(SUB_DEPARTMENT_MAP).flat()));

// Reverse lookup: sub -> parent department
export const SUB_DEPARTMENT_PARENT = Object.fromEntries(
  Object.entries(SUB_DEPARTMENT_MAP).flatMap(([dept, subs]) => subs.map(sd => [sd, dept]))
);
