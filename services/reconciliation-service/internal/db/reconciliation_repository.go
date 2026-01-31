// Package db provides database repositories
package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

// ReconciliationCycle represents a reconciliation cycle
type ReconciliationCycle struct {
	ID                uuid.UUID
	CycleDate         time.Time
	Status            string
	StartTime         time.Time
	EndTime           *time.Time
	TotalRecords      int
	MatchedRecords    int
	DiscrepantRecords int
	AutoResolved      int
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// ReconciliationRecord represents a reconciliation result for a transaction
type ReconciliationRecord struct {
	ID                uuid.UUID
	CycleID           uuid.UUID
	TransactionID     uuid.UUID
	MatchStatus       string
	MatchScore        decimal.Decimal
	DiscrepancyType   string
	DiscrepancyAmount decimal.Decimal
	Details           json.RawMessage
	ResolutionType    string
	ResolvedBy        string
	ResolvedAt        *time.Time
	ResolutionNotes   string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// ReconciliationRepository handles reconciliation data access
type ReconciliationRepository struct {
	pool *Pool
}

// NewReconciliationRepository creates a new repository
func NewReconciliationRepository(pool *Pool) *ReconciliationRepository {
	return &ReconciliationRepository{pool: pool}
}

// CreateCycle creates a new reconciliation cycle
func (r *ReconciliationRepository) CreateCycle(ctx context.Context, cycle *ReconciliationCycle) error {
	query := `
		INSERT INTO reconciliation_cycle (
			id, cycle_date, status, start_time, total_records,
			matched_records, discrepant_records, auto_resolved
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.pool.Exec(ctx, query,
		cycle.ID, cycle.CycleDate, cycle.Status, cycle.StartTime,
		cycle.TotalRecords, cycle.MatchedRecords, cycle.DiscrepantRecords, cycle.AutoResolved,
	)
	return err
}

// UpdateCycle updates a reconciliation cycle
func (r *ReconciliationRepository) UpdateCycle(ctx context.Context, cycle *ReconciliationCycle) error {
	query := `
		UPDATE reconciliation_cycle SET
			status = $2, end_time = $3, total_records = $4,
			matched_records = $5, discrepant_records = $6, auto_resolved = $7,
			updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query,
		cycle.ID, cycle.Status, cycle.EndTime, cycle.TotalRecords,
		cycle.MatchedRecords, cycle.DiscrepantRecords, cycle.AutoResolved,
	)
	return err
}

// GetCycle retrieves a reconciliation cycle
func (r *ReconciliationRepository) GetCycle(ctx context.Context, id uuid.UUID) (*ReconciliationCycle, error) {
	query := `
		SELECT id, cycle_date, status, start_time, end_time,
			total_records, matched_records, discrepant_records, auto_resolved,
			created_at, updated_at
		FROM reconciliation_cycle WHERE id = $1
	`
	row := r.pool.QueryRow(ctx, query, id)

	var cycle ReconciliationCycle
	err := row.Scan(
		&cycle.ID, &cycle.CycleDate, &cycle.Status, &cycle.StartTime, &cycle.EndTime,
		&cycle.TotalRecords, &cycle.MatchedRecords, &cycle.DiscrepantRecords, &cycle.AutoResolved,
		&cycle.CreatedAt, &cycle.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &cycle, nil
}

// CreateRecord creates a new reconciliation record
func (r *ReconciliationRepository) CreateRecord(ctx context.Context, record *ReconciliationRecord) error {
	query := `
		INSERT INTO reconciliation_record (
			id, cycle_id, transaction_id, match_status, match_score,
			discrepancy_type, discrepancy_amount, details, resolution_type
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.pool.Exec(ctx, query,
		record.ID, record.CycleID, record.TransactionID, record.MatchStatus, record.MatchScore,
		record.DiscrepancyType, record.DiscrepancyAmount, record.Details, record.ResolutionType,
	)
	return err
}

// UpdateRecord updates a reconciliation record
func (r *ReconciliationRepository) UpdateRecord(ctx context.Context, record *ReconciliationRecord) error {
	query := `
		UPDATE reconciliation_record SET
			match_status = $2, resolution_type = $3, resolved_by = $4,
			resolved_at = $5, resolution_notes = $6, updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query,
		record.ID, record.MatchStatus, record.ResolutionType,
		record.ResolvedBy, record.ResolvedAt, record.ResolutionNotes,
	)
	return err
}

// GetRecord retrieves a reconciliation record
func (r *ReconciliationRepository) GetRecord(ctx context.Context, id uuid.UUID) (*ReconciliationRecord, error) {
	query := `
		SELECT id, cycle_id, transaction_id, match_status, match_score,
			discrepancy_type, discrepancy_amount, details, resolution_type,
			resolved_by, resolved_at, resolution_notes, created_at, updated_at
		FROM reconciliation_record WHERE id = $1
	`
	row := r.pool.QueryRow(ctx, query, id)

	var record ReconciliationRecord
	err := row.Scan(
		&record.ID, &record.CycleID, &record.TransactionID, &record.MatchStatus, &record.MatchScore,
		&record.DiscrepancyType, &record.DiscrepancyAmount, &record.Details, &record.ResolutionType,
		&record.ResolvedBy, &record.ResolvedAt, &record.ResolutionNotes, &record.CreatedAt, &record.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &record, nil
}

// GetDiscrepantRecords retrieves discrepant records for a cycle
func (r *ReconciliationRepository) GetDiscrepantRecords(ctx context.Context, cycleID uuid.UUID) ([]*ReconciliationRecord, error) {
	query := `
		SELECT id, cycle_id, transaction_id, match_status, match_score,
			discrepancy_type, discrepancy_amount, details, resolution_type,
			resolved_by, resolved_at, resolution_notes, created_at, updated_at
		FROM reconciliation_record
		WHERE cycle_id = $1 AND match_status IN ('DISCREPANT', 'MANUAL_REVIEW')
		ORDER BY created_at
	`
	rows, err := r.pool.Query(ctx, query, cycleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []*ReconciliationRecord
	for rows.Next() {
		var record ReconciliationRecord
		err := rows.Scan(
			&record.ID, &record.CycleID, &record.TransactionID, &record.MatchStatus, &record.MatchScore,
			&record.DiscrepancyType, &record.DiscrepancyAmount, &record.Details, &record.ResolutionType,
			&record.ResolvedBy, &record.ResolvedAt, &record.ResolutionNotes, &record.CreatedAt, &record.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		records = append(records, &record)
	}
	return records, nil
}

// GetCyclesByDateRange retrieves cycles within a date range
func (r *ReconciliationRepository) GetCyclesByDateRange(ctx context.Context, start, end time.Time) ([]*ReconciliationCycle, error) {
	query := `
		SELECT id, cycle_date, status, start_time, end_time,
			total_records, matched_records, discrepant_records, auto_resolved,
			created_at, updated_at
		FROM reconciliation_cycle
		WHERE cycle_date >= $1 AND cycle_date < $2
		ORDER BY cycle_date DESC
	`
	rows, err := r.pool.Query(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cycles []*ReconciliationCycle
	for rows.Next() {
		var cycle ReconciliationCycle
		err := rows.Scan(
			&cycle.ID, &cycle.CycleDate, &cycle.Status, &cycle.StartTime, &cycle.EndTime,
			&cycle.TotalRecords, &cycle.MatchedRecords, &cycle.DiscrepantRecords, &cycle.AutoResolved,
			&cycle.CreatedAt, &cycle.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		cycles = append(cycles, &cycle)
	}
	return cycles, nil
}
