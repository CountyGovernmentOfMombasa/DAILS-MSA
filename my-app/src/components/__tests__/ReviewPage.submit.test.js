import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReviewPage from '../../components/ReviewPage';
import axios from 'axios';

jest.mock('axios');

// Minimal mocks for helpers used inside ReviewPage that rely on window location/state
jest.mock('../../utilis/editContext', () => ({
  getEditContext: () => ({ declarationId: undefined }),
  appendDeclarationIdToPath: (p) => p
}));

jest.mock('../../models/submissionTransformer', () => ({
  modelToSubmissionPayload: jest.fn(() => ({
    marital_status: 'married',
    declaration_type: 'First',
    declaration_date: '2025-10-03',
    period_start_date: '2025-01-01',
    period_end_date: '2025-12-31',
    spouses: [],
    children: [],
    biennial_income: [],
    assets: [],
    liabilities: [],
    other_financial_info: '',
    witness_signed: true,
    witness_name: 'Witness Name',
    witness_address: 'Address',
    witness_phone: '+254700000000'
  }))
}));

// Mock dynamic declarationMapper import used inside ReviewPage
jest.mock('../../utilis/declarationMapper', () => ({
  mapDeclarationToUserForm: (profile) => ({
    first_name: 'John', other_names: 'Q', surname: 'Public',
    marital_status: 'married', birthdate: '1990-01-01', place_of_birth: 'City',
    payroll_number: '123', department: 'Dept', declaration_type: 'First'
  }),
  mapDeclarationToSpousesChildren: () => ({ spouses: [], children: [] }),
  mapDeclarationToFinancial: () => []
}));

// Stub provider internals to avoid network calls for fetching model
jest.mock('../../context/DeclarationSessionContext', () => ({
  DeclarationSessionProvider: ({ children }) => <div data-testid="session-wrapper">{children}</div>,
  useDeclarationSession: () => ({ model: { profile: { marital_status: 'married', first_name: 'John', other_names: 'Q', surname: 'Public' }, members: { spouses: [], children: [] }, financial: { members: [] }, witness: { signed: false, name: 'Witness Name', address: 'Address', phone: '+254700000000' }, type: 'First' }, savingState: { busy: false } }),
  useDebouncedPatch: () => {}
}));

// Mock date util to return stable ISO
jest.mock('../../util/date', () => ({
  toISODate: (d) => d
}));

// Simple localStorage polyfill for this test environment
if (typeof global.localStorage === 'undefined') {
  const store = new Map();
  global.localStorage = {
    setItem: (k,v)=>{ store.set(String(k), String(v)); },
    getItem: (k)=> (store.has(String(k)) ? store.get(String(k)) : null),
    removeItem: (k)=> { store.delete(String(k)); },
    clear: ()=> { store.clear(); }
  };
}

describe('ReviewPage submission', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'fake-token');
    axios.post.mockResolvedValue({ data: { success: true, declaration_id: 123 } });
  });
  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('POST /api/declarations is called for new declaration', async () => {
    render(
      <MemoryRouter initialEntries={['/review']}>
        <ReviewPage />
      </MemoryRouter>
    );

  // Wait for declaration checkbox presence via test id
  const declarationCheckbox = await screen.findByTestId('declaration-checkbox');
  fireEvent.click(declarationCheckbox);
  const witnessCheckbox = await screen.findByTestId('witness-checkbox');
  fireEvent.click(witnessCheckbox);

  const submitBtn = screen.getByTestId('submit-declaration');
  fireEvent.click(submitBtn);
  // Wait for possible loading state toggle
  await waitFor(() => expect(submitBtn).toBeEnabled());
  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    const [url, payload] = axios.post.mock.calls[0];
    expect(url).toBe('/api/declarations');
    expect(payload.marital_status).toBe('married');
    expect(payload.declaration_type).toBe('First');
  });
});
