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
	"github.com/nexus-rtp/ws-gateway/internal/api"
	"github.com/nexus-rtp/ws-gateway/internal/config"
	"github.com/nexus-rtp/ws-gateway/internal/hub"
	"github.com/nexus-rtp/ws-gateway/internal/kafka"
	"go.uber.org/zap"
)

func main() {
	// Logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Config
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("failed to load config", zap.Error(err))
	}

	logger.Info("starting ws-gateway",
		zap.String("port", cfg.Port),
		zap.Strings("kafka_topics", cfg.KafkaTopics),
		zap.Int("ping_interval", cfg.PingInterval),
	)

	// Hub
	wsHub := hub.NewHub(logger)
	go wsHub.Run()

	// Kafka consumer
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	consumer := kafka.NewConsumer(cfg.KafkaBrokers, cfg.KafkaTopics, cfg.KafkaGroupID, wsHub, logger)
	go consumer.Start(ctx)

	// HTTP server with Gin
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	handler := api.NewHandler(wsHub, cfg, logger)
	handler.RegisterRoutes(router)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server failed", zap.Error(err))
		}
	}()

	logger.Info("ws-gateway started", zap.String("addr", srv.Addr))

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down ws-gateway...")
	cancel() // Stop Kafka consumers

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("server shutdown error", zap.Error(err))
	}

	consumer.Close()
	logger.Info("ws-gateway stopped")
}
