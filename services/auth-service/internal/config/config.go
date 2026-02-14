package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all auth-service configuration.
type Config struct {
	ServiceName string `mapstructure:"SERVICE_NAME"`
	Version     string `mapstructure:"VERSION"`
	Environment string `mapstructure:"ENVIRONMENT"`
	Port        int    `mapstructure:"PORT"`
	LogLevel    string `mapstructure:"LOG_LEVEL"`

	DatabaseURL    string `mapstructure:"DATABASE_URL"`
	RedisURL       string `mapstructure:"REDIS_URL"`
	JaegerEndpoint string `mapstructure:"JAEGER_ENDPOINT"`

	JWT JWTConfig `mapstructure:"JWT"`
	MFA MFAConfig `mapstructure:"MFA"`
}

// JWTConfig holds JWT signing configuration.
type JWTConfig struct {
	PrivateKeyPath      string        `mapstructure:"PRIVATE_KEY_PATH"`
	PublicKeyPath       string        `mapstructure:"PUBLIC_KEY_PATH"`
	AccessTokenExpiry   time.Duration `mapstructure:"ACCESS_TOKEN_EXPIRY"`
	RefreshTokenExpiry  time.Duration `mapstructure:"REFRESH_TOKEN_EXPIRY"`
	Issuer              string        `mapstructure:"ISSUER"`
	PasswordResetExpiry time.Duration `mapstructure:"PASSWORD_RESET_EXPIRY"`
}

// MFAConfig holds MFA (TOTP) configuration.
type MFAConfig struct {
	Issuer        string `mapstructure:"ISSUER"`
	EncryptionKey string `mapstructure:"ENCRYPTION_KEY"`
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	v := viper.New()

	v.SetDefault("SERVICE_NAME", "auth-service")
	v.SetDefault("VERSION", "1.0.0")
	v.SetDefault("ENVIRONMENT", "development")
	v.SetDefault("PORT", 8080)
	v.SetDefault("LOG_LEVEL", "info")

	v.SetDefault("DATABASE_URL", "postgresql://root@localhost:26257/nexus_auth?sslmode=disable")
	v.SetDefault("REDIS_URL", "redis://localhost:6379")
	v.SetDefault("JAEGER_ENDPOINT", "http://localhost:14268/api/traces")

	// JWT defaults — dev RSA keys; in production use Vault/HSM-backed keys
	v.SetDefault("JWT_PRIVATE_KEY_PATH", "./keys/dev_private.pem")
	v.SetDefault("JWT_PUBLIC_KEY_PATH", "./keys/dev_public.pem")
	v.SetDefault("JWT_ACCESS_TOKEN_EXPIRY", 15*time.Minute)
	v.SetDefault("JWT_REFRESH_TOKEN_EXPIRY", 7*24*time.Hour)
	v.SetDefault("JWT_ISSUER", "nexus-rtp-auth")
	v.SetDefault("JWT_PASSWORD_RESET_EXPIRY", 1*time.Hour)

	// MFA defaults
	v.SetDefault("MFA_ISSUER", "NexusRTP")
	// TODO: Replace with Vault-backed secret in production
	v.SetDefault("MFA_ENCRYPTION_KEY", "PLACEHOLDER_32_BYTE_KEY_REPLACE_")

	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// Map nested JWT/MFA fields from flat env vars
	cfg.JWT.PrivateKeyPath = v.GetString("JWT_PRIVATE_KEY_PATH")
	cfg.JWT.PublicKeyPath = v.GetString("JWT_PUBLIC_KEY_PATH")
	cfg.JWT.AccessTokenExpiry = v.GetDuration("JWT_ACCESS_TOKEN_EXPIRY")
	cfg.JWT.RefreshTokenExpiry = v.GetDuration("JWT_REFRESH_TOKEN_EXPIRY")
	cfg.JWT.Issuer = v.GetString("JWT_ISSUER")
	cfg.JWT.PasswordResetExpiry = v.GetDuration("JWT_PASSWORD_RESET_EXPIRY")
	cfg.MFA.Issuer = v.GetString("MFA_ISSUER")
	cfg.MFA.EncryptionKey = v.GetString("MFA_ENCRYPTION_KEY")

	return &cfg, nil
}
