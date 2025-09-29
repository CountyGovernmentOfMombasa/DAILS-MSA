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

### Admin

- `GET /api/admin/declarations` - Get all declarations (scoped to department unless super admin)

### Health Check

- `GET /api/health` - Service health check

## Security Features

- JWT authentication
- Password hashing with bcrypt
- Input validation with express-validator
- CORS protection
- Helmet security headers
- Request logging with Morgan
- SQL injection protection

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
