package vault

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	vault "github.com/hashicorp/vault/api"
)

// Client wraps HashiCorp Vault client with Nexus-specific functionality
type Client struct {
	client      *vault.Client
	roleID      string
	secretID    string
	token       string
	mu          sync.RWMutex
	renewCancel context.CancelFunc
}

// Config holds Vault connection configuration
type Config struct {
	Address  string
	RoleID   string
	SecretID string
	Token    string // For dev mode - DO NOT USE IN PRODUCTION
}

// DatabaseCredentials holds database connection info
type DatabaseCredentials struct {
	Host     string `json:"host"`
	Port     string `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	Database string `json:"database"`
	SSLMode  string `json:"sslmode"`
}

// KafkaCredentials holds Kafka connection info
type KafkaCredentials struct {
	BootstrapServers string `json:"bootstrap_servers"`
	SecurityProtocol string `json:"security_protocol"`
	SASLMechanism    string `json:"sasl_mechanism"`
	SASLUsername     string `json:"sasl_username"`
	SASLPassword     string `json:"sasl_password"`
}

// RedisCredentials holds Redis connection info
type RedisCredentials struct {
	Host     string `json:"host"`
	Port     string `json:"port"`
	Password string `json:"password"`
	DB       string `json:"db"`
}

// NewClient creates a new Vault client
func NewClient(cfg Config) (*Client, error) {
	config := vault.DefaultConfig()
	config.Address = cfg.Address

	client, err := vault.NewClient(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create vault client: %w", err)
	}

	c := &Client{
		client:   client,
		roleID:   cfg.RoleID,
		secretID: cfg.SecretID,
		token:    cfg.Token,
	}

	// If token is provided (dev mode), use it directly
	if cfg.Token != "" {
		client.SetToken(cfg.Token)
		return c, nil
	}

	// Otherwise, authenticate with AppRole
	if err := c.loginWithAppRole(); err != nil {
		return nil, err
	}

	// Start token renewal goroutine
	ctx, cancel := context.WithCancel(context.Background())
	c.renewCancel = cancel
	go c.renewToken(ctx)

	return c, nil
}

// loginWithAppRole authenticates using AppRole
func (c *Client) loginWithAppRole() error {
	data := map[string]interface{}{
		"role_id":   c.roleID,
		"secret_id": c.secretID,
	}

	resp, err := c.client.Logical().Write("auth/approle/login", data)
	if err != nil {
		return fmt.Errorf("failed to login with approle: %w", err)
	}

	if resp == nil || resp.Auth == nil {
		return fmt.Errorf("no auth response from vault")
	}

	c.mu.Lock()
	c.token = resp.Auth.ClientToken
	c.client.SetToken(c.token)
	c.mu.Unlock()

	return nil
}

// renewToken periodically renews the Vault token
func (c *Client) renewToken(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.loginWithAppRole(); err != nil {
				fmt.Fprintf(os.Stderr, "failed to renew vault token: %v\n", err)
			}
		}
	}
}

// Close stops the token renewal goroutine
func (c *Client) Close() {
	if c.renewCancel != nil {
		c.renewCancel()
	}
}

// GetDatabaseCredentials retrieves database credentials from Vault
func (c *Client) GetDatabaseCredentials(ctx context.Context, name string) (*DatabaseCredentials, error) {
	path := fmt.Sprintf("nexus/data/database/%s", name)

	secret, err := c.client.Logical().ReadWithContext(ctx, path)
	if err != nil {
		return nil, fmt.Errorf("failed to read database credentials: %w", err)
	}

	if secret == nil || secret.Data == nil {
		return nil, fmt.Errorf("no data at path: %s", path)
	}

	data, ok := secret.Data["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid secret format")
	}

	return &DatabaseCredentials{
		Host:     getString(data, "host"),
		Port:     getString(data, "port"),
		Username: getString(data, "username"),
		Password: getString(data, "password"),
		Database: getString(data, "database"),
		SSLMode:  getString(data, "sslmode"),
	}, nil
}

// GetKafkaCredentials retrieves Kafka credentials from Vault
func (c *Client) GetKafkaCredentials(ctx context.Context) (*KafkaCredentials, error) {
	secret, err := c.client.Logical().ReadWithContext(ctx, "nexus/data/messaging/kafka")
	if err != nil {
		return nil, fmt.Errorf("failed to read kafka credentials: %w", err)
	}

	if secret == nil || secret.Data == nil {
		return nil, fmt.Errorf("no kafka credentials found")
	}

	data, ok := secret.Data["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid secret format")
	}

	return &KafkaCredentials{
		BootstrapServers: getString(data, "bootstrap_servers"),
		SecurityProtocol: getString(data, "security_protocol"),
		SASLMechanism:    getString(data, "sasl_mechanism"),
		SASLUsername:     getString(data, "sasl_username"),
		SASLPassword:     getString(data, "sasl_password"),
	}, nil
}

// GetRedisCredentials retrieves Redis credentials from Vault
func (c *Client) GetRedisCredentials(ctx context.Context) (*RedisCredentials, error) {
	secret, err := c.client.Logical().ReadWithContext(ctx, "nexus/data/cache/redis")
	if err != nil {
		return nil, fmt.Errorf("failed to read redis credentials: %w", err)
	}

	if secret == nil || secret.Data == nil {
		return nil, fmt.Errorf("no redis credentials found")
	}

	data, ok := secret.Data["data"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid secret format")
	}

	return &RedisCredentials{
		Host:     getString(data, "host"),
		Port:     getString(data, "port"),
		Password: getString(data, "password"),
		DB:       getString(data, "db"),
	}, nil
}

// Encrypt encrypts data using Vault Transit engine
func (c *Client) Encrypt(ctx context.Context, keyName string, plaintext []byte) (string, error) {
	data := map[string]interface{}{
		"plaintext": plaintext,
	}

	path := fmt.Sprintf("transit/encrypt/%s", keyName)
	secret, err := c.client.Logical().WriteWithContext(ctx, path, data)
	if err != nil {
		return "", fmt.Errorf("failed to encrypt: %w", err)
	}

	ciphertext, ok := secret.Data["ciphertext"].(string)
	if !ok {
		return "", fmt.Errorf("invalid encryption response")
	}

	return ciphertext, nil
}

// Decrypt decrypts data using Vault Transit engine
func (c *Client) Decrypt(ctx context.Context, keyName, ciphertext string) ([]byte, error) {
	data := map[string]interface{}{
		"ciphertext": ciphertext,
	}

	path := fmt.Sprintf("transit/decrypt/%s", keyName)
	secret, err := c.client.Logical().WriteWithContext(ctx, path, data)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	plaintext, ok := secret.Data["plaintext"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid decryption response")
	}

	return []byte(plaintext), nil
}

// GetSecret retrieves a secret from arbitrary path
func (c *Client) GetSecret(ctx context.Context, path string) (map[string]interface{}, error) {
	secret, err := c.client.Logical().ReadWithContext(ctx, path)
	if err != nil {
		return nil, fmt.Errorf("failed to read secret at %s: %w", path, err)
	}

	if secret == nil || secret.Data == nil {
		return nil, fmt.Errorf("no data at path: %s", path)
	}

	data, ok := secret.Data["data"].(map[string]interface{})
	if !ok {
		// Try returning Data directly for non-KV v2 secrets
		return secret.Data, nil
	}

	return data, nil
}

// HealthCheck verifies Vault connectivity
func (c *Client) HealthCheck(ctx context.Context) error {
	health, err := c.client.Sys().HealthWithContext(ctx)
	if err != nil {
		return fmt.Errorf("vault health check failed: %w", err)
	}

	if health.Sealed {
		return fmt.Errorf("vault is sealed")
	}

	return nil
}

// getString safely extracts string from map
func getString(data map[string]interface{}, key string) string {
	if val, ok := data[key].(string); ok {
		return val
	}
	return ""
}

// ToJSON converts credentials to JSON (for debugging only - never log in production)
func (d *DatabaseCredentials) ToJSON() string {
	b, _ := json.Marshal(d)
	return string(b)
}

// ConnectionString builds a connection string (password redacted for logging)
func (d *DatabaseCredentials) ConnectionString() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=*** dbname=%s sslmode=%s",
		d.Host, d.Port, d.Username, d.Database, d.SSLMode)
}

// ConnectionStringFull builds a full connection string (NEVER log this)
func (d *DatabaseCredentials) ConnectionStringFull() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.Username, d.Password, d.Database, d.SSLMode)
}
