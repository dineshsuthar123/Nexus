package e2e

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v4/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestDatabaseSchemaAlignment verifies the migration correctly created
// all required tables and columns in CockroachDB to match the Go services.
func TestDatabaseSchemaAlignment(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://root@127.0.0.1:26257/nexus_ledger?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.Connect(ctx, dbURL)
	require.NoError(t, err, "Failed to connect to database. Is docker-compose running?")
	defer pool.Close()

	// Wait for DB to be entirely ready (migrations finish)
	time.Sleep(2 * time.Second)

	// Define our expected schema — matches migration 007 + init schema
	expectedSchema := map[string][]string{
		"customer": {
			"id", "external_id", "customer_type", "legal_name", "display_name",
			"kyc_status", "kyc_verified_at", "risk_rating", "country_code",
			"address_line1", "address_line2", "city", "postal_code",
			"metadata", "created_at", "updated_at",
		},
		"account": {
			"id", "customer_id", "external_id", "account_number", "account_name",
			"account_type", "currency", "iban", "bic",
			"balance", "available_balance", "pending_credits", "pending_debits",
			"daily_limit", "transaction_limit", "daily_used", "allow_negative", "minimum_balance",
			"status", "kyc_status", "risk_score", "region",
			"description", "holder_name", "holder_type", "metadata",
			"created_at", "updated_at", "version",
		},
		"transaction": {
			"id", "uetr", "message_id", "instruction_id", "end_to_end_id",
			"transaction_type", "payment_type", "amount", "currency",
			"settlement_amount", "settlement_currency", "exchange_rate",
			"fee_amount", "fee_currency", "charge_bearer",
			"debtor_account_id", "creditor_account_id",
			"debtor_name", "debtor_iban", "creditor_name", "creditor_iban",
			"status", "status_reason", "settlement_method",
			"sanctions_status", "sanctions_score", "fraud_status", "fraud_score",
			"requested_execution_date", "booking_date", "value_date",
			"settlement_date", "settled_at",
			"remittance_info", "original_message",
			"external_rail", "external_reference",
			"created_at", "updated_at", "created_by",
		},
		"transaction_leg": {
			"id", "transaction_id", "account_id", "leg_type", "amount", "currency",
			"balance_before", "balance_after", "description", "sequence_number",
			"created_at",
		},
		"outbox": {
			"id", "aggregate_type", "aggregate_id", "event_type", "payload",
			"topic", "partition_key", "status", "error_message", "retry_count",
			"published_at", "created_at",
		},
		"pending_credit": {
			"id", "account_id", "transaction_id", "amount", "currency",
			"aggregated", "aggregated_at", "batch_id", "created_at",
		},
		"reconciliation_cycle": {
			"id", "cycle_date", "status", "start_time", "end_time", "total_records",
			"matched_records", "discrepant_records", "auto_resolved", "created_at", "updated_at",
		},
		"reconciliation_record": {
			"id", "cycle_id", "transaction_id", "match_status", "match_score",
			"discrepancy_type", "discrepancy_amount", "details", "resolution_type",
			"resolved_by", "resolved_at", "resolution_notes",
			"created_at", "updated_at",
		},
	}

	for table, expectedCols := range expectedSchema {
		t.Run(table, func(t *testing.T) {
			// Query the information schema for this table
			query := `
				SELECT column_name
				FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = $1
			`
			rows, err := pool.Query(ctx, query, table)
			require.NoError(t, err, "Failed to query information_schema for table %s", table)
			defer rows.Close()

			var actualCols []string
			for rows.Next() {
				var col string
				err := rows.Scan(&col)
				require.NoError(t, err)
				actualCols = append(actualCols, col)
			}
			require.NoError(t, rows.Err())

			// Assert length is not 0 (table exists)
			assert.NotEmpty(t, actualCols, "Table '%s' does not exist or has no columns", table)

			// Convert to map for easy lookup
			actualColMap := make(map[string]bool)
			for _, col := range actualCols {
				actualColMap[strings.ToLower(col)] = true
			}

			// Validate all expected columns exist
			for _, expectedCol := range expectedCols {
				assert.True(t, actualColMap[expectedCol], "Missing expected column '%s' in table '%s'", expectedCol, table)
			}
		})
	}
}
