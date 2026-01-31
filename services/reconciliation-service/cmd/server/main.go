// Package main provides the entry point for the Reconciliation Service
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nexus-rtp/reconciliation-service/internal/api"
	"github.com/nexus-rtp/reconciliation-service/internal/config"
	"github.com/nexus-rtp/reconciliation-service/internal/db"
	"github.com/nexus-rtp/reconciliation-service/internal/observability"
	"github.com/nexus-rtp/reconciliation-service/internal/reconciler"
	"github.com/nexus-rtp/reconciliation-service/internal/scheduler"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		panic("Failed to load configuration: " + err.Error())
	}

	// Initialize observability
	logger, cleanup, err := observability.Initialize(cfg.ServiceName, cfg.Environment, cfg.Jaeger.Endpoint)
	if err != nil {
		panic("Failed to initialize observability: " + err.Error())
	}
	defer cleanup()

	logger.Info("Starting Reconciliation Service",
		zap.String("service", cfg.ServiceName),
		zap.String("environment", cfg.Environment),
	)

	// Initialize database pool
	pool, err := db.NewPool(context.Background(), cfg.Database.URL, &db.PoolConfig{
		MaxConns:        cfg.Database.MaxConnections,
		MinConns:        cfg.Database.MinConnections,
		MaxConnLifetime: cfg.Database.MaxConnLifetime,
	})
	if err != nil {
		logger.Fatal("Failed to create database pool", zap.Error(err))
	}
	defer pool.Close()

	// Initialize repositories
	reconRepo := db.NewReconciliationRepository(pool)
	txRepo := db.NewTransactionRepository(pool)
	accountRepo := db.NewAccountRepository(pool)

	// Initialize reconciler
	reconEngine := reconciler.NewEngine(
		logger,
		pool,
		reconRepo,
		txRepo,
		accountRepo,
		cfg.Reconciliation,
	)

	// Initialize scheduler
	reconScheduler := scheduler.NewScheduler(logger, reconEngine, cfg.Scheduler)
	reconScheduler.Start()
	defer reconScheduler.Stop()

	// Set Gin mode
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create router
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(observability.GinMiddleware())

	// Health check endpoints
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": cfg.ServiceName,
		})
	})

	router.GET("/ready", func(c *gin.Context) {
		if err := pool.Ping(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})

	// Metrics endpoint
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Register API routes
	api.RegisterRoutes(router, reconEngine, logger)

	// Create HTTP server
	server := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// Start server
	go func() {
		logger.Info("Server listening", zap.String("addr", server.Addr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed", zap.Error(err))
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited")
}
