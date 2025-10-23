const { generateDeclarationPDF } = require('../util/pdfBuilder');
const pool = require('../config/db');

// Mock the database pool to avoid actual DB calls
jest.mock('../config/db', () => ({
  query: jest.fn(),
}));

describe('PDF Builder Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should generate PDF without errors for a valid declaration ID', async () => {
    // Mock database responses
    pool.query
      .mockResolvedValueOnce([{ id: 1, user_id: 1, declaration_date: '2023-01-01', biennial_income: '[]', assets: '[]', liabilities: '[]', surname: 'Doe', first_name: 'John', other_names: '', national_id: '12345678' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await generateDeclarationPDF(1);

    expect(result).toHaveProperty('buffer');
    expect(result).toHaveProperty('base');
    expect(result).toHaveProperty('password');
    expect(result).toHaveProperty('encryptionApplied');
    expect(result).toHaveProperty('passwordInstruction');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  test('should handle empty data gracefully', async () => {
    pool.query
      .mockResolvedValueOnce([{ id: 1, user_id: 1, declaration_date: '2023-01-01', biennial_income: '[]', assets: '[]', liabilities: '[]', surname: 'Doe', first_name: 'John', other_names: '', national_id: '12345678' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await generateDeclarationPDF(1);

    expect(result.buffer.length).toBeGreaterThan(0);
  });

  test('should include page numbers correctly', async () => {
    // This test checks if the PDF buffer contains page number text
    pool.query
      .mockResolvedValueOnce([{ id: 1, user_id: 1, declaration_date: '2023-01-01', biennial_income: '[]', assets: '[]', liabilities: '[]', surname: 'Doe', first_name: 'John', other_names: '', national_id: '12345678' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await generateDeclarationPDF(1);

    // Convert buffer to string to check for page numbers
    const pdfContent = result.buffer.toString('latin1');
    expect(pdfContent).toMatch(/Page \d+/);
  });
});
