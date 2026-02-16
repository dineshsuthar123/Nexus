// Package main provides the entry point for the Account Service
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nexus-rtp/account-service/internal/api"
	"github.com/nexus-rtp/account-service/internal/cache"
	"github.com/nexus-rtp/account-service/internal/config"
	"github.com/nexus-rtp/account-service/internal/db"
	"github.com/nexus-rtp/account-service/internal/observability"
	"github.com/nexus-rtp/account-service/internal/service"
	idempotency "github.com/nexus-rtp/idempotency"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
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

	logger.Info("Starting Account Service",
		zap.String("service", cfg.ServiceName),
		zap.String("environment", cfg.Environment),
		zap.String("version", cfg.Version),
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

	// Initialize Redis cache
	cacheClient, err := cache.NewRedisClient(cfg.Redis.URL, cfg.Redis.Password, cfg.Redis.DB)
	if err != nil {
		logger.Warn("Failed to connect to Redis, caching disabled", zap.Error(err))
	}

	// Initialize repositories
	accountRepo := db.NewAccountRepository(pool)
	auditRepo := db.NewAuditRepository(pool)

	// Initialize services
	accountService := service.NewAccountService(
		logger,
		pool,
		accountRepo,
		auditRepo,
		cacheClient,
	)

	// Set Gin mode
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create router
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(observability.GinMiddleware())

	// Initialize Redis client for idempotency middleware
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.URL,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	if pingErr := rdb.Ping(context.Background()).Err(); pingErr != nil {
		logger.Warn("Redis not available — idempotency disabled", zap.Error(pingErr))
		rdb = nil
	} else {
		logger.Info("Connected to Redis for idempotency")
	}
	if rdb != nil {
		defer rdb.Close()
		idempCfg := idempotency.DefaultConfig("account-service", logger)
		if cfg.IdempotencyTTL > 0 {
			idempCfg.TTL = time.Duration(cfg.IdempotencyTTL) * time.Second
		}
		router.Use(idempotency.Middleware(rdb, idempCfg))
	}

	// Health check endpoints
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": cfg.ServiceName,
			"version": cfg.Version,
		})
	})

	router.GET("/ready", func(c *gin.Context) {
		// Check database connection
		if err := pool.Ping(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status": "not ready",
				"reason": "database not available",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	})

	// Metrics endpoint
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Register API routes
	api.RegisterRoutes(router, accountService, logger)

	// Create HTTP server
	server := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Start server in goroutine
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

	logger.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited properly")
}
