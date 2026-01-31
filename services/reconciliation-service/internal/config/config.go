// Package config provides configuration management
package config

import (
	"time"

	"github.com/spf13/viper"
)

// Config holds all configuration
type Config struct {
	ServiceName    string               `mapstructure:"SERVICE_NAME"`
	Version        string               `mapstructure:"VERSION"`
	Environment    string               `mapstructure:"ENVIRONMENT"`
	Server         ServerConfig         `mapstructure:"server"`
	Database       DatabaseConfig       `mapstructure:"database"`
	Jaeger         JaegerConfig         `mapstructure:"jaeger"`
	Reconciliation ReconciliationConfig `mapstructure:"reconciliation"`
	Scheduler      SchedulerConfig      `mapstructure:"scheduler"`
}

type ServerConfig struct {
	Port         string        `mapstructure:"PORT"`
	ReadTimeout  time.Duration `mapstructure:"READ_TIMEOUT"`
	WriteTimeout time.Duration `mapstructure:"WRITE_TIMEOUT"`
}

type DatabaseConfig struct {
	URL             string        `mapstructure:"URL"`
	MaxConnections  int32         `mapstructure:"MAX_CONNECTIONS"`
	MinConnections  int32         `mapstructure:"MIN_CONNECTIONS"`
	MaxConnLifetime time.Duration `mapstructure:"MAX_CONN_LIFETIME"`
}

type JaegerConfig struct {
	Endpoint string `mapstructure:"ENDPOINT"`
}

type ReconciliationConfig struct {
	AutoResolveEnabled     bool          `mapstructure:"AUTO_RESOLVE_ENABLED"`
	MaxAutoResolveAmount   float64       `mapstructure:"MAX_AUTO_RESOLVE_AMOUNT"`
	RoundingThreshold      float64       `mapstructure:"ROUNDING_THRESHOLD"`
	BalanceToleranceAmount float64       `mapstructure:"BALANCE_TOLERANCE_AMOUNT"`
	RetentionDays          int           `mapstructure:"RETENTION_DAYS"`
	BatchSize              int           `mapstructure:"BATCH_SIZE"`
	Timeout                time.Duration `mapstructure:"TIMEOUT"`
}

type SchedulerConfig struct {
	ReconciliationCron string        `mapstructure:"RECONCILIATION_CRON"`
	RealTimeEnabled    bool          `mapstructure:"REAL_TIME_ENABLED"`
	RealTimeCron       string        `mapstructure:"REAL_TIME_CRON"`
	JobTimeout         time.Duration `mapstructure:"JOB_TIMEOUT"`
}

// Load loads configuration
func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	// Defaults
	viper.SetDefault("SERVICE_NAME", "reconciliation-service")
	viper.SetDefault("VERSION", "1.0.0")
	viper.SetDefault("ENVIRONMENT", "development")
	viper.SetDefault("server.PORT", "8082")
	viper.SetDefault("server.READ_TIMEOUT", 30*time.Second)
	viper.SetDefault("server.WRITE_TIMEOUT", 30*time.Second)
	viper.SetDefault("database.URL", "postgres://root@localhost:26257/nexus?sslmode=disable")
	viper.SetDefault("database.MAX_CONNECTIONS", 20)
	viper.SetDefault("database.MIN_CONNECTIONS", 5)
	viper.SetDefault("database.MAX_CONN_LIFETIME", time.Hour)
	viper.SetDefault("jaeger.ENDPOINT", "http://localhost:14268/api/traces")
	viper.SetDefault("reconciliation.AUTO_RESOLVE_ENABLED", true)
	viper.SetDefault("reconciliation.MAX_AUTO_RESOLVE_AMOUNT", 0.01)
	viper.SetDefault("reconciliation.ROUNDING_THRESHOLD", 0.01)
	viper.SetDefault("reconciliation.BALANCE_TOLERANCE_AMOUNT", 0.0)
	viper.SetDefault("reconciliation.RETENTION_DAYS", 90)
	viper.SetDefault("reconciliation.BATCH_SIZE", 1000)
	viper.SetDefault("reconciliation.TIMEOUT", 30*time.Minute)
	viper.SetDefault("scheduler.RECONCILIATION_CRON", "0 0 2 * * *") // 2 AM daily
	viper.SetDefault("scheduler.REAL_TIME_ENABLED", true)
	viper.SetDefault("scheduler.REAL_TIME_CRON", "0 */5 * * * *") // Every 5 minutes
	viper.SetDefault("scheduler.JOB_TIMEOUT", 2*time.Hour)

	viper.AutomaticEnv()

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
