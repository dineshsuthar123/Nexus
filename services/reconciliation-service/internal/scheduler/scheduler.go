// Package scheduler handles scheduled reconciliation jobs
package scheduler

import (
	"context"
	"time"

	"github.com/nexus-rtp/reconciliation-service/internal/config"
	"github.com/nexus-rtp/reconciliation-service/internal/reconciler"
	"github.com/robfig/cron/v3"
	"go.uber.org/zap"
)

// Scheduler manages scheduled reconciliation jobs
type Scheduler struct {
	logger *zap.Logger
	engine *reconciler.Engine
	cron   *cron.Cron
	config config.SchedulerConfig
}

// NewScheduler creates a new scheduler
func NewScheduler(logger *zap.Logger, engine *reconciler.Engine, cfg config.SchedulerConfig) *Scheduler {
	return &Scheduler{
		logger: logger,
		engine: engine,
		cron:   cron.New(cron.WithSeconds()),
		config: cfg,
	}
}

// Start starts the scheduler
func (s *Scheduler) Start() {
	s.logger.Info("Starting reconciliation scheduler",
		zap.String("schedule", s.config.ReconciliationCron),
	)

	// Schedule daily reconciliation
	_, err := s.cron.AddFunc(s.config.ReconciliationCron, func() {
		s.runDailyReconciliation()
	})
	if err != nil {
		s.logger.Error("Failed to schedule reconciliation", zap.Error(err))
		return
	}

	// Schedule real-time reconciliation (every 5 minutes for recent transactions)
	if s.config.RealTimeEnabled {
		_, err = s.cron.AddFunc(s.config.RealTimeCron, func() {
			s.runRealTimeReconciliation()
		})
		if err != nil {
			s.logger.Error("Failed to schedule real-time reconciliation", zap.Error(err))
		}
	}

	s.cron.Start()
}

// Stop stops the scheduler
func (s *Scheduler) Stop() {
	s.logger.Info("Stopping reconciliation scheduler")
	ctx := s.cron.Stop()
	<-ctx.Done()
}

// runDailyReconciliation performs end-of-day reconciliation
func (s *Scheduler) runDailyReconciliation() {
	// Reconcile previous day
	cycleDate := time.Now().AddDate(0, 0, -1)
	cycleDate = time.Date(cycleDate.Year(), cycleDate.Month(), cycleDate.Day(), 0, 0, 0, 0, time.UTC)

	s.logger.Info("Running daily reconciliation", zap.Time("cycleDate", cycleDate))

	ctx, cancel := context.WithTimeout(context.Background(), s.config.JobTimeout)
	defer cancel()

	result, err := s.engine.RunReconciliation(ctx, cycleDate)
	if err != nil {
		s.logger.Error("Daily reconciliation failed",
			zap.Error(err),
			zap.Time("cycleDate", cycleDate),
		)
		return
	}

	s.logger.Info("Daily reconciliation completed",
		zap.String("cycleId", result.CycleID.String()),
		zap.String("status", result.Status),
		zap.Int("total", result.TotalRecords),
		zap.Int("matched", result.MatchedRecords),
		zap.Int("discrepant", result.DiscrepantCount),
	)
}

// runRealTimeReconciliation performs near-real-time reconciliation
func (s *Scheduler) runRealTimeReconciliation() {
	s.logger.Debug("Running real-time reconciliation check")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Check transactions from last 15 minutes
	endTime := time.Now()
	startTime := endTime.Add(-15 * time.Minute)

	_ = ctx
	_ = startTime
	_ = endTime

	// In production, this would check recent transactions for immediate issues
	// and trigger alerts for critical discrepancies
}

// RunManualReconciliation triggers a manual reconciliation for a specific date
func (s *Scheduler) RunManualReconciliation(ctx context.Context, date time.Time) (*reconciler.ReconciliationResult, error) {
	s.logger.Info("Running manual reconciliation", zap.Time("date", date))
	return s.engine.RunReconciliation(ctx, date)
}
