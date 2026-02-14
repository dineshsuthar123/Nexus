# Database Migrations

## Overview
This directory contains SQL migration files for the Nexus RTP Platform's CockroachDB databases.

## Migration Files

| File | Database | Description |
|------|----------|-------------|
| `001_auth_schema.sql` | `nexus_auth` | Auth service: users, MFA, tokens, audit logs |
| `002_core_schema.sql` | `nexus_ledger` | Core platform: accounts, transactions, outbox, reconciliation |

## Running Migrations

### Local Development (Docker Compose)
Migrations are applied automatically via the `cockroachdb-init` service in `docker-compose.yml`.

### Manual Application
```bash
# Connect to CockroachDB
cockroach sql --insecure --host=localhost:26257

# Apply migrations in order
\i migrations/001_auth_schema.sql
\i migrations/002_core_schema.sql
```

### Production
In production, use `golang-migrate` or a similar tool with version tracking:
```bash
migrate -path ./migrations -database "cockroachdb://root@cockroachdb:26257/nexus_auth?sslmode=disable" up
```

## Seed Data
`002_core_schema.sql` includes seed accounts for development. Do not apply seed data to production.

## Notes
- All tables use CockroachDB-compatible types (UUID, TIMESTAMPTZ, STRING, DECIMAL)
- Serializable isolation is enforced at the application level, not schema level
- Indexes are designed for the most common query patterns
