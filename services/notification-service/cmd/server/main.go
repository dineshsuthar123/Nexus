// Package main provides the entry point for the Notification Service
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
	"go.uber.org/zap"

	"github.com/nexus-rtp/notification-service/internal/api"
	"github.com/nexus-rtp/notification-service/internal/config"
	"github.com/nexus-rtp/notification-service/internal/db"
	"github.com/nexus-rtp/notification-service/internal/email"
	"github.com/nexus-rtp/notification-service/internal/kafka"
	"github.com/nexus-rtp/notification-service/internal/observability"
	"github.com/nexus-rtp/notification-service/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	logger, err := observability.NewLogger(cfg.LogLevel)
	if err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	shutdown, err := observability.InitTracer(cfg.JaegerEndpoint, cfg.ServiceName)
	if err != nil {
		logger.Warn("Failed to initialize tracer — continuing without tracing", zap.Error(err))
	} else {
		defer shutdown(context.Background())
	}

	// Connect to CockroachDB
	dbPool, err := db.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer dbPool.Close()
	logger.Info("Connected to CockroachDB")

	// Auto-create schema
	if err := db.EnsureSchema(context.Background(), dbPool); err != nil {
		logger.Fatal("Failed to ensure database schema", zap.Error(err))
	}
	logger.Info("Database schema ensured")

	// Initialize Kafka producer
	producer := kafka.NewProducer(cfg.KafkaBrokers, cfg.KafkaTopic, logger)
	defer producer.Close()
	logger.Info("Kafka producer initialized", zap.String("topic", cfg.KafkaTopic))

	// Initialize email sender
	var emailSender email.Sender
	if cfg.SMTP.Enabled {
		emailSender = email.NewSMTPSender(
			cfg.SMTP.Host, cfg.SMTP.Port,
			cfg.SMTP.Username, cfg.SMTP.Password, cfg.SMTP.From, logger,
		)
		logger.Info("SMTP email sender initialized")
	} else {
		emailSender = email.NewStubSender(logger)
		logger.Info("Using stub email sender (SMTP disabled)")
	}

	// Initialize repositories
	notifRepo := db.NewNotificationRepository(dbPool)
	prefRepo := db.NewPreferenceRepository(dbPool)

	// Initialize notification service
	notifService := service.NewNotificationService(logger, notifRepo, prefRepo, producer, emailSender)

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(observability.GinLogger(logger))

	// CORS middleware
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID, X-Idempotency-Key")
		c.Header("Access-Control-Max-Age", "86400")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// Health & metrics endpoints
	router.GET("/health", healthHandler(cfg.ServiceName, cfg.Version))
	router.GET("/healthz", healthHandler(cfg.ServiceName, cfg.Version))
	router.GET("/ready", readinessHandler(dbPool, cfg.ServiceName))
	observability.RegisterMetricsHandler(router)

	// Register notification API routes
	api.RegisterRoutes(router, notifService, logger)

	// Start server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("Starting Notification Service",
			zap.String("service", cfg.ServiceName),
			zap.Int("port", cfg.Port),
			zap.String("environment", cfg.Environment),
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}
	logger.Info("Notification Service exited gracefully")
}

func healthHandler(serviceName, version string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": serviceName,
			"version": version,
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func readinessHandler(dbPool *db.Pool, serviceName string) gin.HandlerFunc {
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
			"service": serviceName,
		})
	}
}
