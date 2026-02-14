package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

// Config holds all notification-service configuration.
type Config struct {
	ServiceName string `mapstructure:"SERVICE_NAME"`
	Version     string `mapstructure:"VERSION"`
	Environment string `mapstructure:"ENVIRONMENT"`
	Port        int    `mapstructure:"PORT"`
	LogLevel    string `mapstructure:"LOG_LEVEL"`

	DatabaseURL    string `mapstructure:"DATABASE_URL"`
	RedisURL       string `mapstructure:"REDIS_URL"`
	JaegerEndpoint string `mapstructure:"JAEGER_ENDPOINT"`

	KafkaBrokers string `mapstructure:"KAFKA_BROKERS"`
	KafkaTopic   string `mapstructure:"KAFKA_TOPIC"`

	SMTP SMTPConfig `mapstructure:"SMTP"`
}

// SMTPConfig holds email dispatch configuration.
type SMTPConfig struct {
	Host     string `mapstructure:"HOST"`
	Port     int    `mapstructure:"PORT"`
	Username string `mapstructure:"USERNAME"`
	Password string `mapstructure:"PASSWORD"`
	From     string `mapstructure:"FROM"`
	Enabled  bool   `mapstructure:"ENABLED"`
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	v := viper.New()

	v.SetDefault("SERVICE_NAME", "notification-service")
	v.SetDefault("VERSION", "1.0.0")
	v.SetDefault("ENVIRONMENT", "development")
	v.SetDefault("PORT", 8080)
	v.SetDefault("LOG_LEVEL", "info")

	v.SetDefault("DATABASE_URL", "postgresql://root@localhost:26257/nexus_ledger?sslmode=disable")
	v.SetDefault("REDIS_URL", "redis://localhost:6379")
	v.SetDefault("JAEGER_ENDPOINT", "http://localhost:14268/api/traces")

	v.SetDefault("KAFKA_BROKERS", "localhost:9092")
	v.SetDefault("KAFKA_TOPIC", "nexus.notifications")

	// SMTP defaults (disabled by default — stub sender used)
	v.SetDefault("SMTP_HOST", "localhost")
	v.SetDefault("SMTP_PORT", 587)
	v.SetDefault("SMTP_USERNAME", "")
	v.SetDefault("SMTP_PASSWORD", "")
	v.SetDefault("SMTP_FROM", "noreply@nexus-rtp.dev")
	v.SetDefault("SMTP_ENABLED", false)

	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// Map flat env vars to nested struct fields
	cfg.SMTP.Host = v.GetString("SMTP_HOST")
	cfg.SMTP.Port = v.GetInt("SMTP_PORT")
	cfg.SMTP.Username = v.GetString("SMTP_USERNAME")
	cfg.SMTP.Password = v.GetString("SMTP_PASSWORD")
	cfg.SMTP.From = v.GetString("SMTP_FROM")
	cfg.SMTP.Enabled = v.GetBool("SMTP_ENABLED")

	return &cfg, nil
}
