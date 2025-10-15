# Wealth Declaration Portal – Frontend

React frontend for the Employee / Wealth Declaration Platform.

## Key Features

- User authentication & guided multi-step declaration workflow
- Dynamic forms: personal info, spouse, children, financial items, review, submission
- Admin dashboards by role (HR / Finance / IT / Super)
- Department-based data scoping (all non‑super admins restricted to their assigned department)
- Global error boundary & toast notifications
- Protected admin routes with JWT token stored in localStorage
- Unified financial data model: backend synthesizes a single `financial_unified` array (replaces legacy `financial_declarations`)

## Admin Roles & Visibility

| Role (DB) | Normalized (UI) | Department Required | Data Scope |
|-----------|-----------------|---------------------|------------|
| super_admin | super | No | All departments |
| hr_admin | hr | Yes | Own department only |
| finance_admin | finance | Yes | Own department only |
| it_admin | it | Yes | Own department only (plus IT-specific audit views) |

The legacy "departmental admin" dedicated routes/components have been removed—scoping now applies automatically per role.

## Project Structure (selected)

```text
my-app/
  src/
    components/        # UI components & dashboards
    context/           # React context (UserProvider)
    api.js             # Fetch helpers / API base
    App.js             # Routing
```

## Scripts

```bash
npm start      # Run development server (http://localhost:3000)
npm test       # Run tests (if any are defined)
npm run build  # Production build
```

## Environment / Configuration

The frontend expects the backend at the same origin or proxied via `/api/*` (configure proxy in `package.json` if needed). Ensure backend issues admin tokens with department & role claims.

### Financial Data Model Alignment

The backend no longer exposes or persists a `financial_declarations` table. Instead, financial data is embedded directly in the root `declarations`, `spouses`, and `children` tables using JSON columns (`biennial_income`, `assets`, `liabilities`, `other_financial_info`).

When you GET a declaration (`/api/declarations/:id`), the server returns a synthesized array:

```jsonc
"financial_unified": [
  {
    "member_type": "user|spouse|child",
    "member_name": "<display name>",
    "scope": "root|spouses|children",
    "data": {
      "biennial_income": [ ... ],
      "assets": [ ... ],
      "liabilities": [ ... ],
      "other_financial_info": "..."
    }
  }
]
```

The frontend no longer PATCHes a separate financial collection. Instead it sends:

- Root financial arrays (`biennial_income`, `assets`, `liabilities`, `other_financial_info`)
- Replaced spouse / child collections (each entry can include its own financial arrays)

Any legacy references to `financial_declarations` have been removed—if you still see them in a feature branch, migrate them to rely on `financial_unified` or the root arrays.

### Declaration Type Normalization

User input for `declaration_type` (e.g. "bienniel", "BIENNIAL") is normalized on the frontend (and again on the backend) to one of: `First`, `Biennial`, `Final`. See `src/util/normalizeDeclarationType.js`.

## Authentication Flow (Admin)

1. Admin logs in via shared admin login form (no separate departmental screen).
2. Backend returns JWT (localStorage: `adminToken`) + admin JSON (`adminUser`).
3. Protected routes check for token; dashboards render based on `adminUser.role` (`hr`, `finance`, `it`, `super`).
4. Non‑super admin API calls are automatically department-filtered server-side.

## Removing Deprecated Files

Deprecated departmental admin components have been neutralized and should be fully deleted in a future cleanup branch (Git history preserves them). No runtime references remain in routing.

## Development Tips

- Prefer functional components + hooks.
- Keep network calls centralized where practical (`api.js`).
- Use defensive UI: loading spinners, empty states, and error toasts.

## Future Enhancements (Suggestions)

- Add React Query or SWR for caching server data.
- Implement role-based menu trimming instead of conditional dashboard render only.
- Add Cypress or Playwright end-to-end tests for declaration submission.

## License

See repository root license (MIT if unchanged).
