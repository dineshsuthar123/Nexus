// Package config provides configuration management
package config

import (
	"time"

	"github.com/spf13/viper"
)

// Config holds all application configuration
type Config struct {
	ServiceName    string         `mapstructure:"SERVICE_NAME"`
	Version        string         `mapstructure:"VERSION"`
	Environment    string         `mapstructure:"ENVIRONMENT"`
	Server         ServerConfig   `mapstructure:"server"`
	Database       DatabaseConfig `mapstructure:"database"`
	Redis          RedisConfig    `mapstructure:"redis"`
	Jaeger         JaegerConfig   `mapstructure:"jaeger"`
	IdempotencyTTL int            `mapstructure:"IDEMPOTENCY_TTL_SECONDS"`
}

// ServerConfig holds server-related configuration
type ServerConfig struct {
	Port         string        `mapstructure:"PORT"`
	ReadTimeout  time.Duration `mapstructure:"READ_TIMEOUT"`
	WriteTimeout time.Duration `mapstructure:"WRITE_TIMEOUT"`
	IdleTimeout  time.Duration `mapstructure:"IDLE_TIMEOUT"`
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	URL             string        `mapstructure:"URL"`
	MaxConnections  int32         `mapstructure:"MAX_CONNECTIONS"`
	MinConnections  int32         `mapstructure:"MIN_CONNECTIONS"`
	MaxConnLifetime time.Duration `mapstructure:"MAX_CONN_LIFETIME"`
}

// RedisConfig holds Redis configuration
type RedisConfig struct {
	URL      string `mapstructure:"URL"`
	Password string `mapstructure:"PASSWORD"`
	DB       int    `mapstructure:"DB"`
}

// JaegerConfig holds Jaeger tracing configuration
type JaegerConfig struct {
	Endpoint string `mapstructure:"ENDPOINT"`
}

// Load loads configuration from environment and files
func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	// Set defaults
	viper.SetDefault("SERVICE_NAME", "account-service")
	viper.SetDefault("VERSION", "1.0.0")
	viper.SetDefault("ENVIRONMENT", "development")
	viper.SetDefault("server.PORT", "8081")
	viper.SetDefault("server.READ_TIMEOUT", 30*time.Second)
	viper.SetDefault("server.WRITE_TIMEOUT", 30*time.Second)
	viper.SetDefault("server.IDLE_TIMEOUT", 120*time.Second)
	viper.SetDefault("database.URL", "postgres://root@localhost:26257/nexus?sslmode=disable")
	viper.SetDefault("database.MAX_CONNECTIONS", 50)
	viper.SetDefault("database.MIN_CONNECTIONS", 5)
	viper.SetDefault("database.MAX_CONN_LIFETIME", time.Hour)
	viper.SetDefault("redis.URL", "localhost:6379")
	viper.SetDefault("redis.PASSWORD", "")
	viper.SetDefault("redis.DB", 0)
	viper.SetDefault("IDEMPOTENCY_TTL_SECONDS", 86400)
	viper.SetDefault("jaeger.ENDPOINT", "http://localhost:14268/api/traces")

	// Bind environment variables
	viper.AutomaticEnv()

	// Try to read config file
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
