// Deprecated stub: financial_declarations table removed (2025-10 migration).
// Any code still requiring this module should transition to using embedded JSON fields
// on the declarations / spouses / children tables (see declarationController financial_unified logic).
module.exports = {
  async create() {
    throw new Error('financial_declarations deprecated: use embedded JSON fields instead');
  },
  async findByDeclarationId() {
    return []; // graceful fallback
  }
};
