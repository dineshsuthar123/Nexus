package vault

import (
	"context"
	"crypto/rsa"
	"fmt"
	"sync"
	"time"
)

// VaultTokenService wraps JWT token creation/validation with Vault-backed keys.
// It supports hot key rotation — when Vault keys change, the service picks up
// new keys at the next refresh cycle without requiring a restart.
type VaultTokenService struct {
	keyProvider *KeyProvider
	keyPath     string // Vault KV path, e.g. "nexus/data/keys/jwt-signing"

	mu         sync.RWMutex
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	lastLoad   time.Time

	accessExpiry  time.Duration
	refreshExpiry time.Duration
	issuer        string
}

// VaultTokenServiceConfig configures a Vault-backed token service.
type VaultTokenServiceConfig struct {
	KeyPath         string        // Vault KV v2 path to JWT signing keys
	AccessExpiry    time.Duration // Access token TTL
	RefreshExpiry   time.Duration // Refresh token TTL
	Issuer          string        // JWT issuer claim
	RefreshInterval time.Duration // How often to re-fetch keys (0 = on-demand only)
}

// NewVaultTokenService creates a token service that fetches keys from Vault.
func NewVaultTokenService(kp *KeyProvider, cfg VaultTokenServiceConfig) (*VaultTokenService, error) {
	vts := &VaultTokenService{
		keyProvider:   kp,
		keyPath:       cfg.KeyPath,
		accessExpiry:  cfg.AccessExpiry,
		refreshExpiry: cfg.RefreshExpiry,
		issuer:        cfg.Issuer,
	}

	// Load keys immediately to fail fast at startup
	if err := vts.loadKeys(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to load JWT keys from Vault at startup: %w", err)
	}

	// Start background refresh if configured
	if cfg.RefreshInterval > 0 {
		go vts.refreshLoop(cfg.RefreshInterval)
	}

	return vts, nil
}

// GetPrivateKey returns the current RSA private key.
func (vts *VaultTokenService) GetPrivateKey() *rsa.PrivateKey {
	vts.mu.RLock()
	defer vts.mu.RUnlock()
	return vts.privateKey
}

// GetPublicKey returns the current RSA public key.
func (vts *VaultTokenService) GetPublicKey() *rsa.PublicKey {
	vts.mu.RLock()
	defer vts.mu.RUnlock()
	return vts.publicKey
}

// GetAccessExpiry returns access token TTL.
func (vts *VaultTokenService) GetAccessExpiry() time.Duration {
	return vts.accessExpiry
}

// GetRefreshExpiry returns refresh token TTL.
func (vts *VaultTokenService) GetRefreshExpiry() time.Duration {
	return vts.refreshExpiry
}

// GetIssuer returns the JWT issuer.
func (vts *VaultTokenService) GetIssuer() string {
	return vts.issuer
}

// ForceRefresh reloads keys from Vault (used after key rotation).
func (vts *VaultTokenService) ForceRefresh(ctx context.Context) error {
	vts.keyProvider.InvalidateCache(vts.keyPath)
	return vts.loadKeys(ctx)
}

// loadKeys fetches RSA keys from Vault and updates the in-memory cache.
func (vts *VaultTokenService) loadKeys(ctx context.Context) error {
	privKey, pubKey, err := vts.keyProvider.GetRSAKeyPair(ctx, vts.keyPath)
	if err != nil {
		return err
	}

	vts.mu.Lock()
	vts.privateKey = privKey
	vts.publicKey = pubKey
	vts.lastLoad = time.Now()
	vts.mu.Unlock()

	return nil
}

func (vts *VaultTokenService) refreshLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		if err := vts.loadKeys(context.Background()); err != nil {
			fmt.Printf("[vault-token-service] key refresh failed: %v\n", err)
		}
	}
}
