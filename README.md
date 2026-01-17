# A1 Diagnostics Automation Platform

A production-grade TypeScript/Node.js backend platform for automating diagnostics certificate generation and invoice processing for A1 Diagnostics (UK remote diagnostics).

## Purpose

This platform integrates with the Jifeline Networks Partner API to automate the generation of calibration/insurance certificates when diagnostics tickets are closed, and later handles invoice and payment processing.

## Current Scope (Phase 1)

This phase establishes the foundation of the project:

- ✅ **Project scaffolding**: Node.js + TypeScript setup with strict type checking
- ✅ **Code quality tools**: ESLint and Prettier configured with sensible defaults
- ✅ **Configuration management**: Environment variable validation using Zod
- ✅ **Domain models**: TypeScript interfaces matching Jifeline API schemas
- ✅ **Certificate data model**: Interface for certificate generation data
- ✅ **Database persistence**: PostgreSQL migration and repository for tracking processed tickets

**Note**: This phase does NOT include:
- HTTP handlers or serverless functions
- External API client implementations (Jifeline API client)
- Business logic or ticket processing
- PDF generation or third-party integrations

## Project Structure

```
migrations/
└── 001_create_processed_tickets.sql  # Database migration for processed_tickets table

src/
├── config/          # Environment configuration and validation
│   └── index.ts     # Config loader with Zod validation
├── models/          # TypeScript domain models/interfaces
│   ├── ticket.ts           # Ticket model (Jifeline schema)
│   ├── closed-ticket.ts    # ClosedTicket model (Jifeline schema)
│   ├── customer.ts         # Customer model (Jifeline schema subset)
│   ├── customer-location.ts # CustomerLocation model (Jifeline schema)
│   ├── employee.ts         # Employee model (Jifeline schema)
│   ├── vehicle-make.ts     # VehicleMake model (Jifeline schema)
│   ├── vehicle-model.ts    # VehicleModel model (Jifeline schema)
│   ├── certificate-data.ts # CertificateData interface (domain model)
│   └── index.ts            # Central export point
├── clients/         # External API clients and database access
│   └── database.ts         # PostgreSQL connection pool and query utilities
├── services/        # Business logic services
│   └── processed-tickets-repository.ts  # Repository for processed tickets persistence
└── handlers/        # Serverless function entrypoints (to be implemented)
```

## Environment Variables

Required environment variables (see `.env.example` for details):

- `JIFELINE_API_BASE_URL` - Base URL for Jifeline Networks Partner API
- `JIFELINE_CLIENT_ID` - OAuth2 client ID for API authentication
- `JIFELINE_CLIENT_SECRET` - OAuth2 client secret for API authentication
- `JIFELINE_TOKEN_URL` - OAuth2 token endpoint URL
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `DATABASE_URL` - PostgreSQL connection string

Copy `.env.example` to `.env` and fill in the values. The config module validates all required variables at startup.

## Development

### Prerequisites

- Node.js 20+ (ESM support required)
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your actual values
```

### Scripts

```bash
# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run dev

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting
npm run format:check

# Type check without building
npm run type-check
```

## Database

The project uses PostgreSQL via Supabase. The `processed_tickets` table tracks which Jifeline tickets have been processed to ensure idempotency and prevent duplicate certificate generation.

### Running Migrations

To apply the database migration:

```bash
# Using psql
psql $DATABASE_URL -f migrations/001_create_processed_tickets.sql

# Or using Supabase CLI (if configured)
supabase db push
```

The migration creates the `processed_tickets` table with:
- Unique constraint on `ticket_id` for idempotency
- Indexes on `ticket_id`, `customer_id`, `status`, and `processed_at`
- Status field with values: `'success'`, `'failed'`, `'needs_review'`

## Certificate Storage

- Certificate PDFs are stored in Supabase Storage in the `certificates` bucket.
- Files follow the path convention `certificates/{ticketNumber}-{ticketId}.pdf`.
- URLs are currently public via `getPublicUrl`; consider signed URLs or a custom domain in a future hardening pass.

### ProcessedTicketsRepository

The `ProcessedTicketsRepository` service provides methods to:
- `hasSuccessfulRecord(ticketId)`: Check if a ticket has been successfully processed
- `recordSuccess(params)`: Record a successful ticket processing
- `recordFailure(params)`: Record a failed ticket processing with error details

All methods throw `DatabaseError` on failure, which can be caught and handled by higher layers.

## Future Phases

Future development will add:

1. ✅ **Processed tickets tracking**: Database schema and service to track which tickets have been processed
2. **Jifeline API client**: HTTP client for interacting with the Jifeline Networks Partner API
3. **CertificateData builder**: Service to transform Jifeline API data into `CertificateData` format
4. **PDF generation**: Service to generate calibration/insurance certificates from `CertificateData`
5. **Xero integration**: Invoice generation and syncing with Xero
6. **GoCardless integration**: Payment processing via GoCardless
7. **Serverless handlers**: Vercel function handlers for webhooks and scheduled jobs

## TypeScript Configuration

The project uses strict TypeScript with the following key settings:

- `strict: true` - Enables all strict type checking options
- `noUnusedLocals: true` - Error on unused local variables
- `noUnusedParameters: true` - Error on unused function parameters
- `noImplicitReturns: true` - Error on functions with missing return statements
- `noUncheckedIndexedAccess: true` - Requires explicit checks for array/object access
- `exactOptionalPropertyTypes: true` - Distinguishes between `T` and `T | undefined`

## Code Quality

- **ESLint**: Configured with TypeScript-specific rules and Prettier integration
- **Prettier**: Consistent code formatting with sensible defaults
- **Type Safety**: Strict TypeScript configuration prevents common errors
- **No `any` types**: The project enforces strict typing throughout

## License

ISC

