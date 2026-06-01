// Package main provides the entry point for the Payment Service
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	idempotency "github.com/nexus-rtp/idempotency"
	"github.com/nexus-rtp/payment-service/internal/api"
	"github.com/nexus-rtp/payment-service/internal/config"
	"github.com/nexus-rtp/payment-service/internal/db"
	"github.com/nexus-rtp/payment-service/internal/kafka"
	"github.com/nexus-rtp/payment-service/internal/observability"
	"github.com/nexus-rtp/payment-service/internal/sanctions"
	"github.com/nexus-rtp/payment-service/internal/service"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Initialize logger
	logger, err := observability.NewLogger(cfg.LogLevel)
	if err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	// Initialize tracer
	shutdown, err := observability.InitTracer(cfg.JaegerEndpoint, "payment-service")
	if err != nil {
		logger.Fatal("Failed to initialize tracer", zap.Error(err))
	}
	defer shutdown(context.Background())

	// Initialize database connection pool
	dbPool, err := db.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer dbPool.Close()
	logger.Info("Connected to CockroachDB")

	// Initialize Kafka producer
	kafkaProducer, err := kafka.NewProducer(cfg.KafkaBrokers)
	if err != nil {
		logger.Fatal("Failed to create Kafka producer", zap.Error(err))
	}
	defer kafkaProducer.Close()
	logger.Info("Connected to Kafka")

	// Initialize sanctions client (Watchman)
	sanctionsClient := sanctions.NewClient(cfg.WatchmanURL, logger)
	logger.Info("Initialized sanctions screening client")

	// Initialize repositories
	accountRepo := db.NewAccountRepository(dbPool, logger)
	shardRepo := db.NewShardRepository(dbPool, logger)
	transactionRepo := db.NewTransactionRepository(dbPool, logger)
	outboxRepo := db.NewOutboxRepository(dbPool, logger)

	// Initialize services
	paymentService := service.NewPaymentService(
		logger,
		dbPool,
		accountRepo,
		shardRepo,
		transactionRepo,
		outboxRepo,
		sanctionsClient,
		kafkaProducer,
	)

	// Initialize Redis client for idempotency
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		logger.Fatal("Failed to parse Redis URL", zap.Error(err))
	}
	rdb := redis.NewClient(redisOpts)
	if pingErr := rdb.Ping(context.Background()).Err(); pingErr != nil {
		logger.Warn("Redis not available — idempotency disabled", zap.Error(pingErr))
		rdb = nil
	} else {
		logger.Info("Connected to Redis for idempotency")
	}
	if rdb != nil {
		defer rdb.Close()
	}

	// Initialize Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(observability.GinLogger(logger))
	router.Use(observability.TracingMiddleware())

	// Limit request body size to 10MB to prevent memory exhaustion attacks
	router.MaxMultipartMemory = 10 << 20 // 10 MB
	router.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 10<<20)
		c.Next()
	})

	// Idempotency middleware — applied to all POST routes
	if rdb != nil {
		idempCfg := idempotency.DefaultConfig("payment-service", logger)
		if cfg.IdempotencyTTL > 0 {
			idempCfg.TTL = time.Duration(cfg.IdempotencyTTL) * time.Second
		}
		router.Use(idempotency.Middleware(rdb, idempCfg))
	}

	// Register API routes
	api.RegisterRoutes(router, paymentService, logger)

	// Register health and metrics endpoints
	router.GET("/health", healthHandler)
	router.GET("/ready", readinessHandler(dbPool))
	observability.RegisterMetricsHandler(router)

	// Create HTTP server with hardened timeouts
	srv := &http.Server{
		Addr:           fmt.Sprintf(":%d", cfg.Port),
		Handler:        router,
		ReadTimeout:    15 * time.Second,
		WriteTimeout:   15 * time.Second,
		IdleTimeout:    60 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1 MB max header size
	}

	// Background: retry failed outbox events every 30 seconds
	outboxStop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				retryCtx, retryCancel := context.WithTimeout(context.Background(), 10*time.Second)
				n, err := outboxRepo.RetryFailed(retryCtx, 5)
				if err != nil {
					logger.Warn("outbox retry sweep failed", zap.Error(err))
				} else if n > 0 {
					logger.Info("outbox retry: reset failed events", zap.Int("count", n))
				}
				if pending, pErr := outboxRepo.CountPending(retryCtx); pErr == nil {
					observability.OutboxEventsPending.Set(float64(pending))
				}
				retryCancel()
			case <-outboxStop:
				return
			}
		}
	}()

	// Background: reconcile account.balance = SUM(shard.balance) every 5 minutes
	reconStop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				reconCtx, reconCancel := context.WithTimeout(context.Background(), 30*time.Second)
				// Wrap the check+fix in a single serializable TX so the drift count
				// and the UPDATE always see the same consistent shard snapshot.
				reconErr := dbPool.RetryTx(reconCtx, 3, func(tx pgx.Tx) error {
					var driftCount int
					if err := tx.QueryRow(reconCtx,
						`SELECT count(*) FROM account a
						 WHERE EXISTS (SELECT 1 FROM account_shard WHERE account_id = a.id)
						   AND a.balance != (SELECT COALESCE(SUM(balance), 0) FROM account_shard WHERE account_id = a.id)`,
					).Scan(&driftCount); err != nil {
						return fmt.Errorf("balance reconciliation check: %w", err)
					}
					observability.BalanceDriftCount.Set(float64(driftCount))
					if driftCount > 0 {
						logger.Warn("balance drift detected", zap.Int("driftedAccounts", driftCount))
						// Fix the drift: set master balance = SUM(shard balances).
						// Both the count query above and this UPDATE share the same TX
						// snapshot, so no concurrent payment can slip between them.
						_, fixErr := tx.Exec(reconCtx,
							`UPDATE account SET balance = sub.shard_sum, updated_at = current_timestamp()
							 FROM (SELECT account_id, SUM(balance) AS shard_sum FROM account_shard GROUP BY account_id) sub
							 WHERE account.id = sub.account_id AND account.balance != sub.shard_sum`)
						if fixErr != nil {
							return fmt.Errorf("balance reconciliation fix: %w", fixErr)
						}
						logger.Info("balance drift corrected", zap.Int("accounts", driftCount))
					}
					return nil
				})
				if reconErr != nil {
					logger.Error("balance reconciliation failed", zap.Error(reconErr))
				}
				reconCancel()
			case <-reconStop:
				return
			}
		}
	}()

	// Background: refresh sanctions lists every 6 hours
	sanctionsStop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				refreshCtx, refreshCancel := context.WithTimeout(context.Background(), 2*time.Minute)
				if err := sanctionsClient.DownloadLatestLists(refreshCtx); err != nil {
					logger.Error("sanctions list refresh failed", zap.Error(err))
				} else {
					logger.Info("sanctions lists refreshed successfully")
					observability.SanctionsLastRefresh.Set(float64(time.Now().Unix()))
				}
				refreshCancel()
			case <-sanctionsStop:
				return
			}
		}
	}()

	// Start server in goroutine
	go func() {
		logger.Info("Starting Payment Service", zap.Int("port", cfg.Port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Shutting down server...")

	// Stop background goroutines
	close(outboxStop)
	close(reconStop)
	close(sanctionsStop)

	// Give outstanding requests 30 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited gracefully")
}

func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "payment-service",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func readinessHandler(dbPool *db.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		if err := dbPool.Ping(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status": "not ready",
				"error":  "database connection failed",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":  "ready",
			"service": "payment-service",
		})
	}
}
