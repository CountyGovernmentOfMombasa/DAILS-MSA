# Employee Declaration System - Backend

A Node.js/Express backend API for managing employee financial declarations.

## Features

- User authentication with JWT
- Employee registration and login
- Declaration management (CRUD operations)
- Admin panel for viewing all declarations
- Department-based data scoping: HR admins only see users & declarations within their assigned department
- IT and Super admins have unrestricted visibility across all departments
- Input validation and security middleware
- MySQL database integration

## Removed / Deprecated Features

- The separate "departmental admin" login & dashboard flow has been removed. Department filtering is now applied automatically for HR admins. IT and Super admins are not department-scoped. Any existing references to deprecated departmental components should be cleaned up; placeholder files may remain temporarily for build stability until fully pruned.
- Admin password reset request queue (endpoints: `/api/admin/forgot-password-request`, `/api/admin/password-reset-requests`, `/api/admin/password-reset-requests/:id/resolve`) was removed on 2025-10-08. Rationale: simplified security model; direct privileged admins can perform a secure password change instead. The table `admin_password_reset_requests` is dropped via migration `20251008_drop_admin_password_reset_requests.sql`. If you still have build artifacts referencing these endpoints, rebuild the frontend.

## Admin Linking Workflow (New)

From 2025-10-08, newly created admin accounts can optionally be linked to an existing employee `users` record to unify identity (single source of truth for name, department, national ID, email) and allow future SSO or privilege elevation flows.

### How Linking Works

1. Frontend admin creation form exposes a toggle (linkExistingUser). When enabled the creator provides either:
   - `userId` (primary key of `users` table), OR
   - `nationalId` (unique national identifier in `users.national_id`).
2. Backend validates the target user exists and that no other admin is already linked to that same user (`UNIQUE user_id` in `admin_users`).
3. Missing admin profile fields (first_name, surname, email, department) are auto‑populated from the user record (department only for non `super_admin` roles).
4. A placeholder random password is generated because linked admins authenticate via the underlying user account (future enhancement: token/SSO). For non‑linked admins a password is mandatory.
5. Creation success triggers two audit trails:
   - Existing `admin_creation_audit` (legacy) still captures the base creation event (when invoked through older IT admin route).
   - New `admin_user_link_audit` captures linkage specifics (admin_id, user_id, linkage method (user_id or national_id), national_id & department snapshot, creator admin, IP, user agent).

### Database Changes

- `admin_users.user_id` (nullable) with `UNIQUE` constraint ensures one-to-one mapping when used.
- Foreign key `fk_admin_users_user` enforces referential integrity.
- New table `admin_user_link_audit` (see migration `20251008_create_admin_user_link_audit.sql`).

### API Contract (POST /api/admin/admins)

Request (linked via national ID example):

```json
{
  "username": "jane.admin",
  "role": "hr_admin",
  "linkExistingUser": true,
  "nationalId": "12345678"
}
```

Request (linked via userId example):

```json
{
  "username": "john.admin",
  "role": "it_admin",
  "linkExistingUser": true,
  "userId": 42
}
```

Request (non‑linked legacy style):

```json
{
  "username": "ext.contractor",
  "role": "it_admin",
  "password": "Str0ng!Pass",
  "first_name": "Ext",
  "surname": "Contractor",
  "department": "IT"
}
```

Response snippet (linked):

```json
{
  "success": true,
  "data": {
    "id": 7,
    "username": "jane.admin",
    "role": "hr_admin",
    "user_id": 15,
    "linked_national_id": "12345678",
    "linked_user_email": "jane.doe@org.test",
    "link_method": "national_id"
  }
}
```

### Listing Enrichment

`GET /api/admin/admins` now includes (when schema supports):

- `user_id` – linked user PK (nullable)
- `linked_national_id` – national ID from joined user (nullable)
- `linked_user_email` – user email snapshot (nullable)

Backwards compatibility: If older nodes or migrations haven't run, the API gracefully falls back to legacy SELECTs without these fields.

### Operational Notes

- Run migrations in order so the foreign key and audit table exist before heavy usage.
- To audit link events: query `admin_user_link_audit` (add simple viewer endpoint in future if needed).
- Unlinking is currently unsupported (would require policy & additional audit trail). To change linkage, create a new admin and deactivate the old one.

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

| Variable                 | Description                                         | Default                                   |
| ------------------------ | --------------------------------------------------- | ----------------------------------------- |
| DB_HOST                  | Database host                                       | localhost                                 |
| DB_USER                  | Database username                                   | root                                      |
| DB_PASSWORD              | Database password                                   |                                           |
| DB_NAME                  | Database name                                       | employee_declarations                     |
| JWT_SECRET               | JWT secret key                                      |                                           |
| JWT_EXPIRES_IN           | JWT expiration time                                 | 7d                                        |
| PORT                     | Server port                                         | 5000                                      |
| NODE_ENV                 | Environment                                         | development                               |
| FRONTEND_URL             | Frontend URL for CORS                               | <http://localhost:3000>                   |
| SMS_ENABLED              | Enable/disable SMS sending                          | true                                      |
| TOLCLIN_BASE_URL         | Tolclin BulkSms URL                                 | <https://tolclin.com/tolclin/sms/BulkSms> |
| TOLCLIN_CLIENT_ID        | Tolclin client id (integer)                         | 254                                       |
| TOLCLIN_SENDER_ID        | SMS Sender ID                                       | COUNTY-MSA                                |
| TOLCLIN_CALLBACK_URL     | SMS callback URL                                    |                                           |
| PDF_PERMIT_PRINTING      | Printing permission: accepts values none, low, high | high                                      |
| PDF_ALLOW_MODIFY         | Allow document modification (true/false)            | false                                     |
| PDF_ALLOW_COPY           | Allow copying text/images (true/false)              | false                                     |
| PDF_ALLOW_ANNOTATE       | Allow adding/removing annotations (true/false)      | false                                     |
| PDF_ALLOW_FILL_FORMS     | Allow form filling (true/false)                     | false                                     |
| PDF_ALLOW_CONTENT_ACCESS | Enable accessibility extraction (true/false)        | false                                     |
| PDF_ALLOW_DOC_ASSEMBLY   | Allow document assembly (true/false)                | false                                     |
| PDF_OWNER_PASSWORD       | Owner password override (optional)                  | (defaults to National ID)                 |
| OTP_TTL_MINUTES          | First-time login OTP validity window (minutes)      | 360 (6 hours)                             |
| OTP_TOKEN_EXPIRES_IN     | JWT lifetime for OTP verification token             | 6h                                        |
| OTP_CLEANUP_INTERVAL_MS  | Interval to clear expired OTPs from DB (ms)         | 60000                                     |

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

### HR Admin

HR admins are department-scoped. The following endpoint lists all employees (users) within the HR admin's assigned `sub_department` (and, if present, restricted to the same `department`). Requires an admin JWT with role `hr_admin`.

- `GET /api/hr/sub-department/users` – Returns an array of user records with basic profile fields (id, payroll_number, name parts, email, designation, department, sub_department, nature_of_employment). This is intended for HR overview screens (no financial declaration data). Response shape:

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "payroll_number": "PN00123",
      "first_name": "Jane",
      "other_names": null,
      "surname": "Doe",
      "email": "jane.doe@example.com",
      "designation": "Officer",
      "department": "Department of Health",
      "sub_department": "Public Health",
      "nature_of_employment": "Permanent"
    }
  ]
}
```

## Validation

Input validation has been centralized in `middleware/requestValidators.js` to ensure consistent constraints, error formatting and to reduce duplication.

Key exports:

- `handleValidation` – terminal middleware that converts express-validator errors into a standardized `{ message, code, details[] }` response (HTTP 400)
- `listQuery(options)` – factory for paginated list endpoints (page, limit, search + optional department). Used by HR admin and user declaration list.
- `adminUserList`, `statusAudit`, `bulkEmail`, `updateMe`, `declarationStatusUpdate`, `consentSubmit` – purpose‑specific validator arrays.
- `dateRange` – reusable from/to ISO date validators with logical ordering check.

Standard error schema example:

```json
{
  "message": "Validation failed",
  "code": "VALIDATION_FAILED",
  "details": [
    {
      "field": "page",
      "message": "page must be between 1 and 500",
      "code": "VALIDATION_PAGE"
    }
  ]
}
```

Refactoring notes:

- Avoid inline uses of `validationResult` in routes; rely on the shared helpers.
- New validators should follow the established pattern and end with `handleValidation`.
- When adding a new list endpoint, prefer `listQuery({ includeDepartment: true, extra: [...] })` instead of duplicating pagination/search logic.

Generated declaration PDFs are automatically password-protected (if the dependency `pdfkit-encrypt` is installed) using the employee's National ID as the user password. Owner password defaults to the same value unless overridden via `PDF_OWNER_PASSWORD`.
Generated declaration PDFs are automatically password-protected using the employee's National ID as the user password. This requires the `muhammara` (successor to `hummus`) library for encryption. Owner password defaults to the same value unless overridden via `PDF_OWNER_PASSWORD`.
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
