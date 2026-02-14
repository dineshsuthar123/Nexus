package analytics

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// Summary represents overall platform analytics.
type Summary struct {
	TotalTransactions   int64   `json:"total_transactions"`
	TotalVolume         float64 `json:"total_volume"`
	TotalAccounts       int64   `json:"total_accounts"`
	ActiveAccounts      int64   `json:"active_accounts"`
	AvgTransactionValue float64 `json:"avg_transaction_value"`
	SuccessRate         float64 `json:"success_rate"`
	PendingTransactions int64   `json:"pending_transactions"`
	FailedTransactions  int64   `json:"failed_transactions"`
	TotalSettled        float64 `json:"total_settled"`
	Last24hTransactions int64   `json:"last_24h_transactions"`
	Last24hVolume       float64 `json:"last_24h_volume"`
}

// VolumePoint represents a data point in the volume time series.
type VolumePoint struct {
	Timestamp   time.Time `json:"timestamp"`
	Count       int64     `json:"count"`
	TotalAmount float64   `json:"total_amount"`
	Currency    string    `json:"currency"`
}

// PerformanceMetrics represents system performance.
type PerformanceMetrics struct {
	AvgProcessingTimeMs float64            `json:"avg_processing_time_ms"`
	P95ProcessingTimeMs float64            `json:"p95_processing_time_ms"`
	P99ProcessingTimeMs float64            `json:"p99_processing_time_ms"`
	ThroughputPerMin    float64            `json:"throughput_per_min"`
	ErrorRate           float64            `json:"error_rate"`
	StatusBreakdown     map[string]int64   `json:"status_breakdown"`
	CurrencyBreakdown   map[string]float64 `json:"currency_breakdown"`
}

// TrendData represents trend information.
type TrendData struct {
	Period     string  `json:"period"`
	Current    float64 `json:"current"`
	Previous   float64 `json:"previous"`
	ChangeRate float64 `json:"change_rate"`
	Direction  string  `json:"direction"` // "up", "down", "flat"
}

// Service provides analytics queries.
type Service struct {
	pool   *pgxpool.Pool
	logger *zap.Logger
}

// NewService creates a new analytics service.
func NewService(pool *pgxpool.Pool, logger *zap.Logger) *Service {
	return &Service{pool: pool, logger: logger}
}

// GetSummary returns overall platform summary.
func (s *Service) GetSummary(ctx context.Context) (*Summary, error) {
	summary := &Summary{}

	// Total transactions and volume
	err := s.pool.QueryRow(ctx, `
		SELECT 
			COALESCE(COUNT(*), 0),
			COALESCE(SUM(amount), 0),
			COALESCE(AVG(amount), 0)
		FROM transactions
	`).Scan(&summary.TotalTransactions, &summary.TotalVolume, &summary.AvgTransactionValue)
	if err != nil {
		return nil, err
	}

	// Status breakdown
	rows, err := s.pool.Query(ctx, `
		SELECT status, COUNT(*) FROM transactions GROUP BY status
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var status string
		var count int64
		if err := rows.Scan(&status, &count); err != nil {
			continue
		}
		switch status {
		case "SETTLED", "COMPLETED":
			summary.TotalSettled += float64(count)
		case "PENDING", "PROCESSING":
			summary.PendingTransactions += count
		case "FAILED", "REJECTED":
			summary.FailedTransactions += count
		}
	}

	if summary.TotalTransactions > 0 {
		summary.SuccessRate = float64(summary.TotalTransactions-summary.FailedTransactions) / float64(summary.TotalTransactions) * 100
	}

	// Total accounts
	s.pool.QueryRow(ctx, `SELECT COALESCE(COUNT(*), 0) FROM accounts`).Scan(&summary.TotalAccounts)
	s.pool.QueryRow(ctx, `SELECT COALESCE(COUNT(*), 0) FROM accounts WHERE status = 'ACTIVE'`).Scan(&summary.ActiveAccounts)

	// Last 24h
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(amount), 0) 
		FROM transactions 
		WHERE created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&summary.Last24hTransactions, &summary.Last24hVolume)

	return summary, nil
}

// GetVolume returns transaction volume over time.
func (s *Service) GetVolume(ctx context.Context, interval string, from, to time.Time) ([]VolumePoint, error) {
	// Map interval to time_bucket
	bucket := "1 hour"
	switch interval {
	case "5m":
		bucket = "5 minutes"
	case "15m":
		bucket = "15 minutes"
	case "1h":
		bucket = "1 hour"
	case "6h":
		bucket = "6 hours"
	case "1d":
		bucket = "1 day"
	case "1w":
		bucket = "1 week"
	}

	if from.IsZero() {
		from = time.Now().Add(-24 * time.Hour)
	}
	if to.IsZero() {
		to = time.Now()
	}

	rows, err := s.pool.Query(ctx, `
		SELECT 
			date_trunc($1, created_at) AS bucket,
			COUNT(*) AS count,
			COALESCE(SUM(amount), 0) AS total_amount,
			currency
		FROM transactions
		WHERE created_at BETWEEN $2 AND $3
		GROUP BY bucket, currency
		ORDER BY bucket ASC
	`, bucket, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []VolumePoint
	for rows.Next() {
		var p VolumePoint
		if err := rows.Scan(&p.Timestamp, &p.Count, &p.TotalAmount, &p.Currency); err != nil {
			continue
		}
		points = append(points, p)
	}

	if points == nil {
		points = []VolumePoint{}
	}
	return points, nil
}

// GetPerformance returns performance metrics.
func (s *Service) GetPerformance(ctx context.Context) (*PerformanceMetrics, error) {
	metrics := &PerformanceMetrics{
		StatusBreakdown:   make(map[string]int64),
		CurrencyBreakdown: make(map[string]float64),
	}

	// Processing time stats (using difference between created_at and updated_at)
	s.pool.QueryRow(ctx, `
		SELECT 
			COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000), 0),
			COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000), 0),
			COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000), 0)
		FROM transactions
		WHERE updated_at IS NOT NULL AND updated_at > created_at
	`).Scan(&metrics.AvgProcessingTimeMs, &metrics.P95ProcessingTimeMs, &metrics.P99ProcessingTimeMs)

	// Throughput (last hour)
	var lastHourCount int64
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM transactions
		WHERE created_at > NOW() - INTERVAL '1 hour'
	`).Scan(&lastHourCount)
	metrics.ThroughputPerMin = float64(lastHourCount) / 60.0

	// Error rate
	var totalCount, failedCount int64
	s.pool.QueryRow(ctx, `SELECT COALESCE(COUNT(*), 0) FROM transactions`).Scan(&totalCount)
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM transactions 
		WHERE status IN ('FAILED', 'REJECTED')
	`).Scan(&failedCount)
	if totalCount > 0 {
		metrics.ErrorRate = float64(failedCount) / float64(totalCount) * 100
	}

	// Status breakdown
	rows, err := s.pool.Query(ctx, `SELECT status, COUNT(*) FROM transactions GROUP BY status`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var status string
			var count int64
			if err := rows.Scan(&status, &count); err == nil {
				metrics.StatusBreakdown[status] = count
			}
		}
	}

	// Currency breakdown
	rows2, err := s.pool.Query(ctx, `SELECT currency, COALESCE(SUM(amount), 0) FROM transactions GROUP BY currency`)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var currency string
			var total float64
			if err := rows2.Scan(&currency, &total); err == nil {
				metrics.CurrencyBreakdown[currency] = total
			}
		}
	}

	return metrics, nil
}

// GetTrends returns trend comparisons.
func (s *Service) GetTrends(ctx context.Context) ([]TrendData, error) {
	trends := []TrendData{}

	// Daily trend (today vs yesterday)
	var todayCount, yesterdayCount float64
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM transactions 
		WHERE created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&todayCount)
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM transactions 
		WHERE created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours'
	`).Scan(&yesterdayCount)
	trends = append(trends, buildTrend("daily_transactions", todayCount, yesterdayCount))

	// Daily volume
	var todayVol, yesterdayVol float64
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM transactions 
		WHERE created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&todayVol)
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM transactions 
		WHERE created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours'
	`).Scan(&yesterdayVol)
	trends = append(trends, buildTrend("daily_volume", todayVol, yesterdayVol))

	// Weekly trend
	var thisWeek, lastWeek float64
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM transactions 
		WHERE created_at > NOW() - INTERVAL '7 days'
	`).Scan(&thisWeek)
	s.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM transactions 
		WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
	`).Scan(&lastWeek)
	trends = append(trends, buildTrend("weekly_transactions", thisWeek, lastWeek))

	return trends, nil
}

func buildTrend(period string, current, previous float64) TrendData {
	t := TrendData{
		Period:   period,
		Current:  current,
		Previous: previous,
	}

	if previous == 0 {
		if current > 0 {
			t.ChangeRate = 100
			t.Direction = "up"
		} else {
			t.ChangeRate = 0
			t.Direction = "flat"
		}
	} else {
		t.ChangeRate = ((current - previous) / previous) * 100
		if t.ChangeRate > 1 {
			t.Direction = "up"
		} else if t.ChangeRate < -1 {
			t.Direction = "down"
		} else {
			t.Direction = "flat"
		}
	}

	return t
}
