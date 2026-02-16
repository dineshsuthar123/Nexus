// Package config provides configuration management for the Payment Service
package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

// Config holds all configuration for the service
type Config struct {
	// Server
	Port        int    `mapstructure:"PORT"`
	Environment string `mapstructure:"ENVIRONMENT"`
	LogLevel    string `mapstructure:"LOG_LEVEL"`

	// Database
	DatabaseURL string `mapstructure:"DATABASE_URL"`

	// Kafka
	KafkaBrokers []string `mapstructure:"KAFKA_BROKERS"`

	// Redis
	RedisURL string `mapstructure:"REDIS_URL"`

	// Watchman (Sanctions Screening)
	WatchmanURL string `mapstructure:"WATCHMAN_URL"`

	// Observability
	JaegerEndpoint string `mapstructure:"JAEGER_ENDPOINT"`

	// Latency Budget (in milliseconds)
	LatencyBudget LatencyBudgetConfig `mapstructure:"LATENCY_BUDGET"`

	// Rate Limiting
	RateLimit RateLimitConfig `mapstructure:"RATE_LIMIT"`

	// Idempotency
	IdempotencyTTL int `mapstructure:"IDEMPOTENCY_TTL_SECONDS"`
}

// LatencyBudgetConfig defines the latency budget for each stage
type LatencyBudgetConfig struct {
	IngressValidation int `mapstructure:"INGRESS_VALIDATION_MS"`
	SanctionsCheck    int `mapstructure:"SANCTIONS_CHECK_MS"`
	LedgerReservation int `mapstructure:"LEDGER_RESERVATION_MS"`
	RiskAnalysis      int `mapstructure:"RISK_ANALYSIS_MS"`
	RailTransmission  int `mapstructure:"RAIL_TRANSMISSION_MS"`
	ResponseFinality  int `mapstructure:"RESPONSE_FINALITY_MS"`
}

// RateLimitConfig defines rate limiting parameters
type RateLimitConfig struct {
	RequestsPerSecond int `mapstructure:"REQUESTS_PER_SECOND"`
	BurstSize         int `mapstructure:"BURST_SIZE"`
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	v := viper.New()

	// Set defaults
	v.SetDefault("PORT", 8080)
	v.SetDefault("ENVIRONMENT", "development")
	v.SetDefault("LOG_LEVEL", "info")
	v.SetDefault("DATABASE_URL", "postgresql://root@localhost:26257/nexus_ledger?sslmode=disable")
	v.SetDefault("KAFKA_BROKERS", "localhost:9092")
	v.SetDefault("REDIS_URL", "redis://localhost:6379")
	v.SetDefault("IDEMPOTENCY_TTL_SECONDS", 86400)
	v.SetDefault("WATCHMAN_URL", "http://localhost:8084")
	v.SetDefault("JAEGER_ENDPOINT", "http://localhost:14268/api/traces")

	// Latency budget defaults (in ms)
	v.SetDefault("LATENCY_BUDGET.INGRESS_VALIDATION_MS", 50)
	v.SetDefault("LATENCY_BUDGET.SANCTIONS_CHECK_MS", 100)
	v.SetDefault("LATENCY_BUDGET.LEDGER_RESERVATION_MS", 250)
	v.SetDefault("LATENCY_BUDGET.RISK_ANALYSIS_MS", 100)
	v.SetDefault("LATENCY_BUDGET.RAIL_TRANSMISSION_MS", 400)
	v.SetDefault("LATENCY_BUDGET.RESPONSE_FINALITY_MS", 100)

	// Rate limiting defaults
	v.SetDefault("RATE_LIMIT.REQUESTS_PER_SECOND", 10000)
	v.SetDefault("RATE_LIMIT.BURST_SIZE", 20000)

	// Read from environment
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// Parse Kafka brokers (comma-separated)
	if brokers := v.GetString("KAFKA_BROKERS"); brokers != "" {
		cfg.KafkaBrokers = strings.Split(brokers, ",")
	}

	return &cfg, nil
}
