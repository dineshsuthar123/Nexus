package vault

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// ============================================================================
// Metrics
// ============================================================================

var (
	keyFetchTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "vault_key_fetch_total",
			Help: "Total Vault key fetch operations",
		},
		[]string{"key_name", "status"},
	)

	keyRotationTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "vault_key_rotation_total",
			Help: "Total Vault key rotation events detected",
		},
		[]string{"key_name"},
	)

	keyFetchDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "vault_key_fetch_duration_seconds",
			Help:    "Time taken to fetch keys from Vault",
			Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2},
		},
		[]string{"key_name"},
	)

	keyCacheHits = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "vault_key_cache_hits_total",
			Help: "Number of key cache hits",
		},
		[]string{"key_name"},
	)
)

// ============================================================================
// Key Provider
// ============================================================================

// KeyProvider manages cryptographic keys fetched from Vault KV v2.
// Keys are cached in-memory and refreshed periodically for rotation support.
type KeyProvider struct {
	client          *Client
	mu              sync.RWMutex
	cache           map[string]*cachedKey
	refreshInterval time.Duration
	ctx             context.Context
	cancel          context.CancelFunc
}

type cachedKey struct {
	raw       []byte
	version   int
	fetchedAt time.Time
}

// KeyProviderConfig configures the key provider.
type KeyProviderConfig struct {
	// RefreshInterval is how often to poll Vault for key changes (default: 5m).
	RefreshInterval time.Duration
}

// NewKeyProvider creates a KeyProvider backed by the given Vault client.
func NewKeyProvider(client *Client, cfg *KeyProviderConfig) *KeyProvider {
	interval := 5 * time.Minute
	if cfg != nil && cfg.RefreshInterval > 0 {
		interval = cfg.RefreshInterval
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &KeyProvider{
		client:          client,
		cache:           make(map[string]*cachedKey),
		refreshInterval: interval,
		ctx:             ctx,
		cancel:          cancel,
	}
}

// Start begins the background key refresh loop.
func (kp *KeyProvider) Start(keyPaths []string) {
	go kp.refreshLoop(keyPaths)
}

// Stop stops the background refresh.
func (kp *KeyProvider) Stop() {
	kp.cancel()
}

// GetRSAKeyPair fetches an RSA private/public key pair from Vault KV.
// Path should be like "nexus/data/keys/jwt-signing".
// Expects the secret to have "private_key" and "public_key" fields (PEM-encoded).
func (kp *KeyProvider) GetRSAKeyPair(ctx context.Context, path string) (*rsa.PrivateKey, *rsa.PublicKey, error) {
	privPEM, err := kp.getKeyBytes(ctx, path, "private_key")
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get private key from %s: %w", path, err)
	}

	pubPEM, err := kp.getKeyBytes(ctx, path, "public_key")
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get public key from %s: %w", path, err)
	}

	privKey, err := parseRSAPrivateKey(privPEM)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse private key: %w", err)
	}

	pubKey, err := parseRSAPublicKey(pubPEM)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse public key: %w", err)
	}

	return privKey, pubKey, nil
}

// GetSecretString fetches a single string value from a Vault KV path.
func (kp *KeyProvider) GetSecretString(ctx context.Context, path, field string) (string, error) {
	data, err := kp.fetchSecret(ctx, path)
	if err != nil {
		return "", err
	}
	val, ok := data[field].(string)
	if !ok {
		return "", fmt.Errorf("field %q not found or not a string at %s", field, path)
	}
	return val, nil
}

// GetSecretBytes fetches a base64-encoded or raw bytes value from Vault KV.
func (kp *KeyProvider) GetSecretBytes(ctx context.Context, path, field string) ([]byte, error) {
	return kp.getKeyBytes(ctx, path, field)
}

// ============================================================================
// Internal helpers
// ============================================================================

func (kp *KeyProvider) getKeyBytes(ctx context.Context, path, field string) ([]byte, error) {
	// Check cache first
	cacheKey := path + "#" + field
	kp.mu.RLock()
	if ck, ok := kp.cache[cacheKey]; ok && time.Since(ck.fetchedAt) < kp.refreshInterval {
		kp.mu.RUnlock()
		keyCacheHits.WithLabelValues(cacheKey).Inc()
		return ck.raw, nil
	}
	kp.mu.RUnlock()

	data, err := kp.fetchSecret(ctx, path)
	if err != nil {
		return nil, err
	}

	val, ok := data[field]
	if !ok {
		return nil, fmt.Errorf("field %q not found at path %s", field, path)
	}

	var raw []byte
	switch v := val.(type) {
	case string:
		// Try base64 decode first
		decoded, err := base64.StdEncoding.DecodeString(v)
		if err != nil {
			// Treat as raw PEM / plaintext
			raw = []byte(v)
		} else {
			raw = decoded
		}
	default:
		return nil, fmt.Errorf("unexpected type for field %q: %T", field, val)
	}

	// Update cache
	kp.mu.Lock()
	kp.cache[cacheKey] = &cachedKey{raw: raw, fetchedAt: time.Now()}
	kp.mu.Unlock()

	return raw, nil
}

func (kp *KeyProvider) fetchSecret(ctx context.Context, path string) (map[string]interface{}, error) {
	start := time.Now()
	data, err := kp.client.GetSecret(ctx, path)
	duration := time.Since(start).Seconds()
	keyFetchDuration.WithLabelValues(path).Observe(duration)

	if err != nil {
		keyFetchTotal.WithLabelValues(path, "error").Inc()
		return nil, fmt.Errorf("failed to read secret at %s: %w", path, err)
	}
	keyFetchTotal.WithLabelValues(path, "success").Inc()
	return data, nil
}

func (kp *KeyProvider) refreshLoop(paths []string) {
	ticker := time.NewTicker(kp.refreshInterval)
	defer ticker.Stop()

	for {
		select {
		case <-kp.ctx.Done():
			return
		case <-ticker.C:
			for _, path := range paths {
				if _, err := kp.fetchSecret(context.Background(), path); err != nil {
					// Log but don't crash — cached keys remain available
					fmt.Printf("[vault-key-provider] refresh failed for %s: %v\n", path, err)
				}
			}
		}
	}
}

// InvalidateCache forces a re-fetch on next access.
func (kp *KeyProvider) InvalidateCache(path string) {
	kp.mu.Lock()
	defer kp.mu.Unlock()
	for k := range kp.cache {
		if len(k) >= len(path) && k[:len(path)] == path {
			delete(kp.cache, k)
		}
	}
	keyRotationTotal.WithLabelValues(path).Inc()
}

// ============================================================================
// RSA Key Parsing
// ============================================================================

func parseRSAPrivateKey(pemData []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	// Try PKCS#8 first, then PKCS#1
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		key2, err2 := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("failed to parse RSA private key (PKCS8: %v, PKCS1: %v)", err, err2)
		}
		return key2, nil
	}

	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("key is not RSA")
	}
	return rsaKey, nil
}

func parseRSAPublicKey(pemData []byte) (*rsa.PublicKey, error) {
	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		key2, err2 := x509.ParsePKCS1PublicKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("failed to parse RSA public key (PKIX: %v, PKCS1: %v)", err, err2)
		}
		return key2, nil
	}

	rsaKey, ok := key.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("key is not RSA")
	}
	return rsaKey, nil
}
