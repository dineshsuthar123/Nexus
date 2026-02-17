// Package main provides the entry point for the Auth Service
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
	"github.com/nexus-rtp/auth-service/internal/api"
	authpkg "github.com/nexus-rtp/auth-service/internal/auth"
	"github.com/nexus-rtp/auth-service/internal/config"
	"github.com/nexus-rtp/auth-service/internal/db"
	"github.com/nexus-rtp/auth-service/internal/observability"
	"github.com/nexus-rtp/auth-service/internal/service"
	"go.uber.org/zap"
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

	// Initialize JWT token service
	tokenService, err := authpkg.NewTokenService(
		cfg.JWT.PrivateKeyPath, cfg.JWT.PublicKeyPath,
		cfg.JWT.AccessTokenExpiry, cfg.JWT.RefreshTokenExpiry,
		cfg.JWT.Issuer,
	)
	if err != nil {
		logger.Fatal("Failed to initialize token service", zap.Error(err))
	}
	logger.Info("JWT token service initialized")

	// Initialize MFA service
	mfaService, err := authpkg.NewMFAService(cfg.MFA.Issuer, cfg.MFA.EncryptionKey)
	if err != nil {
		logger.Fatal("Failed to initialize MFA service", zap.Error(err))
	}
	logger.Info("MFA service initialized")

	// Initialize repositories
	userRepo := db.NewUserRepository(dbPool)
	refreshTokenRepo := db.NewRefreshTokenRepository(dbPool)
	mfaRepo := db.NewMFARepository(dbPool)
	auditRepo := db.NewAuditLogRepository(dbPool)
	resetRepo := db.NewPasswordResetRepository(dbPool)
	apiKeyRepo := db.NewAPIKeyRepository(dbPool)

	// Initialize auth service
	authService := service.NewAuthService(
		logger, userRepo, refreshTokenRepo, mfaRepo,
		auditRepo, resetRepo, apiKeyRepo, tokenService, mfaService,
	)

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(observability.GinLogger(logger))

	// CORS middleware for frontend integration
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key")
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

	// Register auth API routes
	api.RegisterRoutes(router, authService, tokenService, logger)

	// Register user/settings API routes (uses same handler for JWT middleware)
	h := api.NewHandler(authService, tokenService, logger)
	api.RegisterUserRoutes(router, h)

	// Start server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("Starting Auth Service",
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
	logger.Info("Auth Service exited gracefully")
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
