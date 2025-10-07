// Deprecated stub: financial_items table removed along with financial_declarations.
// Financial line items now live inside consolidated JSON arrays (biennial_income, assets, liabilities).
module.exports = {
  async create() { throw new Error('financial_items deprecated: use declaration embedded JSON fields instead'); },
  async findByFinancialDeclarationId() { return []; }
};
