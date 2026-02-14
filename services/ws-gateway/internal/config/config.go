package config

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"

	"github.com/spf13/viper"
)

type Config struct {
	Port            string
	KafkaBrokers    []string
	KafkaTopics     []string
	KafkaGroupID    string
	JWTPublicKey    *rsa.PublicKey
	JWTPublicKeyPath string
	PingInterval    int // seconds
	PongTimeout     int // seconds
	MaxMessageSize  int64
	WriteBufferSize int
	ReadBufferSize  int
	AllowedOrigins  []string
	LogLevel        string
}

func Load() (*Config, error) {
	viper.SetDefault("PORT", "8080")
	viper.SetDefault("KAFKA_BROKERS", "kafka-1:29092,kafka-2:29093,kafka-3:29094")
	viper.SetDefault("KAFKA_TOPICS", "nexus.payments.status,nexus.events.raw,nexus.notifications,nexus.reconciliation.events,nexus.fraud.alerts")
	viper.SetDefault("KAFKA_GROUP_ID", "ws-gateway")
	viper.SetDefault("JWT_PUBLIC_KEY_PATH", "keys/dev_public.pem")
	viper.SetDefault("WS_PING_INTERVAL", 30)
	viper.SetDefault("WS_PONG_TIMEOUT", 10)
	viper.SetDefault("WS_MAX_MESSAGE_SIZE", 4096)
	viper.SetDefault("WS_WRITE_BUFFER_SIZE", 1024)
	viper.SetDefault("WS_READ_BUFFER_SIZE", 1024)
	viper.SetDefault("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
	viper.SetDefault("LOG_LEVEL", "info")

	viper.AutomaticEnv()

	pubKeyPath := viper.GetString("JWT_PUBLIC_KEY_PATH")
	pubKey, err := loadPublicKey(pubKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load JWT public key from %s: %w", pubKeyPath, err)
	}

	brokers := splitCSV(viper.GetString("KAFKA_BROKERS"))
	topics := splitCSV(viper.GetString("KAFKA_TOPICS"))
	origins := splitCSV(viper.GetString("ALLOWED_ORIGINS"))

	return &Config{
		Port:            viper.GetString("PORT"),
		KafkaBrokers:    brokers,
		KafkaTopics:     topics,
		KafkaGroupID:    viper.GetString("KAFKA_GROUP_ID"),
		JWTPublicKey:    pubKey,
		JWTPublicKeyPath: pubKeyPath,
		PingInterval:    viper.GetInt("WS_PING_INTERVAL"),
		PongTimeout:     viper.GetInt("WS_PONG_TIMEOUT"),
		MaxMessageSize:  viper.GetInt64("WS_MAX_MESSAGE_SIZE"),
		WriteBufferSize: viper.GetInt("WS_WRITE_BUFFER_SIZE"),
		ReadBufferSize:  viper.GetInt("WS_READ_BUFFER_SIZE"),
		AllowedOrigins:  origins,
		LogLevel:        viper.GetString("LOG_LEVEL"),
	}, nil
}

func loadPublicKey(path string) (*rsa.PublicKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("key is not RSA")
	}
	return rsaPub, nil
}

func splitCSV(s string) []string {
	parts := []string{}
	for _, p := range splitBy(s, ',') {
		trimmed := trimSpace(p)
		if trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	return parts
}

func splitBy(s string, sep byte) []string {
	result := []string{}
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && s[start] == ' ' {
		start++
	}
	for end > start && s[end-1] == ' ' {
		end--
	}
	return s[start:end]
}
