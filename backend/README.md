# Employee Declaration System - Backend

A Node.js/Express backend API for managing employee financial declarations.

## Features

- User authentication with JWT
- Employee registration and login
- Declaration management (CRUD operations)
- Admin panel for viewing all declarations
- Department-based data scoping: all non-super admins only see users & declarations within their assigned department
- Super admin has unrestricted visibility across all departments
- Input validation and security middleware
- MySQL database integration

## Removed / Deprecated Features

- The separate "departmental admin" login & dashboard flow has been removed. Department filtering is now applied automatically for every non-super admin role (HR, Finance, IT). Any existing references to deprecated departmental components should be cleaned up; placeholder files may remain temporarily for build stability until fully pruned.

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

## Installation

1. Clone the repository
2. Navigate to the backend directory
3. Install dependencies:

```bash
npm install
```

1. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update the values in `.env` with your configuration

2. Set up the database:
   - Create a MySQL database
   - Run the schema from `database/schema.sql`

3. Start the server:

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DB_HOST | Database host | localhost |
| DB_USER | Database username | root |
| DB_PASSWORD | Database password | |
| DB_NAME | Database name | employee_declarations |
| JWT_SECRET | JWT secret key | |
| JWT_EXPIRES_IN | JWT expiration time | 7d |
| PORT | Server port | 5000 |
| NODE_ENV | Environment | development |
| FRONTEND_URL | Frontend URL for CORS | <http://localhost:3000> |
| SMS_ENABLED | Enable/disable SMS sending | true |
| TOLCLIN_BASE_URL | Tolclin BulkSms URL | <https://tolclin.com/tolclin/sms/BulkSms> |
| TOLCLIN_CLIENT_ID | Tolclin client id (integer) | 254 |
| TOLCLIN_SENDER_ID | SMS Sender ID | COUNTY-MSA |
| TOLCLIN_CALLBACK_URL | SMS callback URL | |
| PDF_PERMIT_PRINTING | Printing permission: accepts values none, low, high | high |
| PDF_ALLOW_MODIFY | Allow document modification (true/false) | false |
| PDF_ALLOW_COPY | Allow copying text/images (true/false) | false |
| PDF_ALLOW_ANNOTATE | Allow adding/removing annotations (true/false) | false |
| PDF_ALLOW_FILL_FORMS | Allow form filling (true/false) | false |
| PDF_ALLOW_CONTENT_ACCESS | Enable accessibility extraction (true/false) | false |
| PDF_ALLOW_DOC_ASSEMBLY | Allow document assembly (true/false) | false |
| PDF_OWNER_PASSWORD | Owner password override (optional) | (defaults to National ID) |

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/resend-otp` - Resend first-time login OTP (requires nationalId and default password)
- `POST /api/auth/verify-otp` - Verify OTP (Authorization: Bearer otp token)
- `PUT /api/auth/change-password` - Change password
- `GET /api/auth/me` - Get user profile

### Declarations

- `POST /api/declarations` - Submit declaration
- `GET /api/declarations` - Get user declarations

## Validation

Input validation has been centralized in `middleware/requestValidators.js` to ensure consistent constraints, error formatting and to reduce duplication.

Key exports:

- `handleValidation` – terminal middleware that converts express-validator errors into a standardized `{ message, code, details[] }` response (HTTP 400)
- `listQuery(options)` – factory for paginated list endpoints (page, limit, search + optional department). Used by finance & HR admin and user declaration list.
- `adminUserList`, `statusAudit`, `bulkEmail`, `updateMe`, `declarationStatusUpdate`, `consentSubmit` – purpose‑specific validator arrays.
- `dateRange` – reusable from/to ISO date validators with logical ordering check.

Standard error schema example:

```json
{
   "message": "Validation failed",
   "code": "VALIDATION_FAILED",
   "details": [
      { "field": "page", "message": "page must be between 1 and 500", "code": "VALIDATION_PAGE" }
   ]
}
```

Refactoring notes:

- Avoid inline uses of `validationResult` in routes; rely on the shared helpers.
- New validators should follow the established pattern and end with `handleValidation`.
- When adding a new list endpoint, prefer `listQuery({ includeDepartment: true, extra: [...] })` instead of duplicating pagination/search logic.

Generated declaration PDFs are automatically password-protected (if the dependency `pdfkit-encrypt` is installed) using the employee's National ID as the user password. Owner password defaults to the same value unless overridden via `PDF_OWNER_PASSWORD`.
Generated declaration PDFs are automatically password-protected (if the dependency `pdfkit-encrypt` is installed) using the employee's National ID as the user password. Owner password defaults to the same value unless overridden via `PDF_OWNER_PASSWORD`.

You can control fine‑grained permissions via environment variables:

- `PDF_PERMIT_PRINTING`: `none`, `low` (lowResolution), or `high` (highResolution). Defaults to `high`.
- `PDF_ALLOW_MODIFY`, `PDF_ALLOW_COPY`, `PDF_ALLOW_ANNOTATE`, `PDF_ALLOW_FILL_FORMS`, `PDF_ALLOW_CONTENT_ACCESS`, `PDF_ALLOW_DOC_ASSEMBLY`: each boolean-like (true/false, 1/0, yes/no). Default `false`.

If the encryption plugin is not available, the PDF is still generated but without password protection; the controller does not fail—log output can indicate the absence of encryption.

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error (development only)"
}
```

## Database Schema

The application uses the following main tables:

- `users` - User information and credentials
- `declarations` - Financial declarations
- `spouses` - Spouse information
- `children` - Children information

See `database/schema.sql` for the complete schema.

## Development

### Code Structure

```text
backend/
├── config/         # Database configuration
├── controllers/    # Route controllers
├── middleware/     # Custom middleware
├── models/         # Database models
├── routes/         # API routes
├── database/       # Database schema
└── app.js         # Main application file
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
