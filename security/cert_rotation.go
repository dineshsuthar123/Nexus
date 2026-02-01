package security

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// ============================================================================
// METRICS
// ============================================================================

var (
	certRotationsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "cert_rotations_total",
			Help: "Total number of certificate rotations",
		},
		[]string{"service", "status"},
	)

	certExpiryDays = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "cert_expiry_days",
			Help: "Days until certificate expiration",
		},
		[]string{"service", "cert_type"},
	)

	certRotationDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "cert_rotation_duration_seconds",
			Help:    "Time taken to rotate certificates",
			Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30},
		},
		[]string{"service"},
	)

	certRotationErrors = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "cert_rotation_errors_total",
			Help: "Total certificate rotation errors",
		},
		[]string{"service", "error_type"},
	)
)

// ============================================================================
// CONFIGURATION
// ============================================================================

// CertConfig holds certificate rotation configuration
type CertConfig struct {
	// Service identification
	ServiceName string
	CommonName  string
	DNSNames    []string
	IPAddresses []string

	// Validity periods
	CACertValidity      time.Duration // CA cert validity (e.g., 10 years)
	ServiceCertValidity time.Duration // Service cert validity (e.g., 90 days)
	RotationThreshold   time.Duration // Rotate when this time remains (e.g., 30 days)

	// Vault configuration
	VaultAddr      string
	VaultPath      string // e.g., "pki/issue/nexus-rtp"
	VaultToken     string
	VaultRoleID    string
	VaultSecretID  string

	// Output paths
	CertPath string
	KeyPath  string
	CAPath   string

	// Callbacks
	OnRotation func(newCert, newKey []byte) error
	OnError    func(err error)
}

// DefaultConfig returns sensible defaults
func DefaultConfig(serviceName string) *CertConfig {
	return &CertConfig{
		ServiceName:         serviceName,
		CommonName:          fmt.Sprintf("%s.nexus-rtp.internal", serviceName),
		DNSNames:            []string{fmt.Sprintf("%s.nexus-rtp.internal", serviceName)},
		CACertValidity:      10 * 365 * 24 * time.Hour,  // 10 years
		ServiceCertValidity: 90 * 24 * time.Hour,       // 90 days
		RotationThreshold:   30 * 24 * time.Hour,       // 30 days before expiry
		CertPath:            fmt.Sprintf("/etc/nexus/certs/%s.crt", serviceName),
		KeyPath:             fmt.Sprintf("/etc/nexus/certs/%s.key", serviceName),
		CAPath:              "/etc/nexus/certs/ca.crt",
	}
}

// ============================================================================
// CERTIFICATE MANAGER
// ============================================================================

// CertManager handles certificate lifecycle
type CertManager struct {
	config *CertConfig
	mu     sync.RWMutex

	// Current certificates
	currentCert   *x509.Certificate
	currentKey    *ecdsa.PrivateKey
	currentCertPEM []byte
	currentKeyPEM  []byte

	// CA certificate
	caCert    *x509.Certificate
	caKey     *ecdsa.PrivateKey
	caCertPEM []byte

	// Rotation state
	lastRotation time.Time
	nextRotation time.Time

	// Control
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewCertManager creates a new certificate manager
func NewCertManager(config *CertConfig) *CertManager {
	ctx, cancel := context.WithCancel(context.Background())
	return &CertManager{
		config: config,
		ctx:    ctx,
		cancel: cancel,
	}
}

// Initialize sets up initial certificates
func (cm *CertManager) Initialize() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Generate CA if not using Vault
	if cm.config.VaultAddr == "" {
		if err := cm.generateCA(); err != nil {
			return fmt.Errorf("failed to generate CA: %w", err)
		}
	}

	// Generate initial service certificate
	if err := cm.generateServiceCert(); err != nil {
		return fmt.Errorf("failed to generate service cert: %w", err)
	}

	cm.lastRotation = time.Now()
	cm.scheduleNextRotation()

	return nil
}

// Start begins the automatic rotation loop
func (cm *CertManager) Start() {
	cm.wg.Add(1)
	go cm.rotationLoop()
}

// Stop halts the rotation loop
func (cm *CertManager) Stop() {
	cm.cancel()
	cm.wg.Wait()
}

// GetCertificate returns current certificate PEM
func (cm *CertManager) GetCertificate() []byte {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.currentCertPEM
}

// GetPrivateKey returns current private key PEM
func (cm *CertManager) GetPrivateKey() []byte {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.currentKeyPEM
}

// GetCACertificate returns CA certificate PEM
func (cm *CertManager) GetCACertificate() []byte {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.caCertPEM
}

// DaysUntilExpiry returns days until current cert expires
func (cm *CertManager) DaysUntilExpiry() float64 {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	if cm.currentCert == nil {
		return 0
	}
	return time.Until(cm.currentCert.NotAfter).Hours() / 24
}

// ============================================================================
// CERTIFICATE GENERATION
// ============================================================================

// generateCA creates a new CA certificate
func (cm *CertManager) generateCA() error {
	// Generate key
	key, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	if err != nil {
		return fmt.Errorf("failed to generate CA key: %w", err)
	}

	// Create certificate template
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return fmt.Errorf("failed to generate serial number: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization:       []string{"Nexus RTP Platform"},
			OrganizationalUnit: []string{"Platform Security"},
			CommonName:         "Nexus RTP Root CA",
		},
		NotBefore:             time.Now().Add(-1 * time.Hour), // 1 hour grace
		NotAfter:              time.Now().Add(cm.config.CACertValidity),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            1,
	}

	// Self-sign
	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return fmt.Errorf("failed to create CA certificate: %w", err)
	}

	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return fmt.Errorf("failed to parse CA certificate: %w", err)
	}

	// Store
	cm.caCert = cert
	cm.caKey = key
	cm.caCertPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})

	return nil
}

// generateServiceCert creates a new service certificate
func (cm *CertManager) generateServiceCert() error {
	// Generate key
	key, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	if err != nil {
		return fmt.Errorf("failed to generate key: %w", err)
	}

	// Create certificate template
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return fmt.Errorf("failed to generate serial number: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization:       []string{"Nexus RTP Platform"},
			OrganizationalUnit: []string{cm.config.ServiceName},
			CommonName:         cm.config.CommonName,
		},
		DNSNames:              cm.config.DNSNames,
		NotBefore:             time.Now().Add(-1 * time.Hour), // 1 hour grace
		NotAfter:              time.Now().Add(cm.config.ServiceCertValidity),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IsCA:                  false,
	}

	// Sign with CA
	certDER, err := x509.CreateCertificate(rand.Reader, template, cm.caCert, &key.PublicKey, cm.caKey)
	if err != nil {
		return fmt.Errorf("failed to create certificate: %w", err)
	}

	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return fmt.Errorf("failed to parse certificate: %w", err)
	}

	// Encode to PEM
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyBytes, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return fmt.Errorf("failed to marshal key: %w", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyBytes})

	// Store
	cm.currentCert = cert
	cm.currentKey = key
	cm.currentCertPEM = certPEM
	cm.currentKeyPEM = keyPEM

	return nil
}

// ============================================================================
// ROTATION LOGIC
// ============================================================================

// rotationLoop runs the automatic rotation process
func (cm *CertManager) rotationLoop() {
	defer cm.wg.Done()

	ticker := time.NewTicker(1 * time.Hour) // Check every hour
	defer ticker.Stop()

	for {
		select {
		case <-cm.ctx.Done():
			return
		case <-ticker.C:
			cm.checkAndRotate()
		}
	}
}

// checkAndRotate checks if rotation is needed and performs it
func (cm *CertManager) checkAndRotate() {
	cm.mu.RLock()
	needsRotation := time.Now().After(cm.nextRotation)
	daysLeft := cm.DaysUntilExpiry()
	cm.mu.RUnlock()

	// Update expiry metric
	certExpiryDays.WithLabelValues(cm.config.ServiceName, "service").Set(daysLeft)

	if !needsRotation {
		return
	}

	// Perform rotation
	if err := cm.Rotate(); err != nil {
		certRotationErrors.WithLabelValues(cm.config.ServiceName, "rotation_failed").Inc()
		if cm.config.OnError != nil {
			cm.config.OnError(err)
		}
	}
}

// Rotate performs certificate rotation
func (cm *CertManager) Rotate() error {
	start := time.Now()

	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Generate new certificate
	if err := cm.generateServiceCert(); err != nil {
		certRotationsTotal.WithLabelValues(cm.config.ServiceName, "failed").Inc()
		return fmt.Errorf("failed to generate new certificate: %w", err)
	}

	// Call rotation callback
	if cm.config.OnRotation != nil {
		if err := cm.config.OnRotation(cm.currentCertPEM, cm.currentKeyPEM); err != nil {
			certRotationsTotal.WithLabelValues(cm.config.ServiceName, "callback_failed").Inc()
			return fmt.Errorf("rotation callback failed: %w", err)
		}
	}

	// Update state
	cm.lastRotation = time.Now()
	cm.scheduleNextRotation()

	// Record metrics
	duration := time.Since(start).Seconds()
	certRotationDuration.WithLabelValues(cm.config.ServiceName).Observe(duration)
	certRotationsTotal.WithLabelValues(cm.config.ServiceName, "success").Inc()

	return nil
}

// scheduleNextRotation calculates next rotation time
func (cm *CertManager) scheduleNextRotation() {
	if cm.currentCert == nil {
		cm.nextRotation = time.Now()
		return
	}
	cm.nextRotation = cm.currentCert.NotAfter.Add(-cm.config.RotationThreshold)
}

// ============================================================================
// VAULT INTEGRATION
// ============================================================================

// VaultCertProvider integrates with HashiCorp Vault PKI
type VaultCertProvider struct {
	addr   string
	token  string
	path   string
	client VaultClient
}

// VaultClient interface for Vault operations
type VaultClient interface {
	IssueCertificate(path string, params map[string]interface{}) (cert, key, ca []byte, err error)
	RenewToken() error
}

// NewVaultCertProvider creates a Vault-backed cert provider
func NewVaultCertProvider(addr, token, path string) *VaultCertProvider {
	return &VaultCertProvider{
		addr:  addr,
		token: token,
		path:  path,
	}
}

// IssueCertificate requests a new certificate from Vault
func (v *VaultCertProvider) IssueCertificate(commonName string, dnsNames []string, ttl time.Duration) (cert, key, ca []byte, err error) {
	if v.client == nil {
		return nil, nil, nil, fmt.Errorf("vault client not initialized")
	}

	params := map[string]interface{}{
		"common_name": commonName,
		"alt_names":   dnsNames,
		"ttl":         ttl.String(),
		"format":      "pem",
	}

	return v.client.IssueCertificate(v.path, params)
}

// ============================================================================
// CERTIFICATE CHAIN VALIDATOR
// ============================================================================

// ChainValidator validates certificate chains
type ChainValidator struct {
	roots     *x509.CertPool
	timestamp time.Time // For testing with specific time
}

// NewChainValidator creates a new chain validator
func NewChainValidator(caCert []byte) (*ChainValidator, error) {
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("failed to parse CA certificate")
	}
	return &ChainValidator{roots: roots}, nil
}

// Validate checks if a certificate is valid and chains to trusted CA
func (v *ChainValidator) Validate(certPEM []byte) error {
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return fmt.Errorf("failed to decode PEM")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse certificate: %w", err)
	}

	// Check expiry
	now := v.timestamp
	if now.IsZero() {
		now = time.Now()
	}

	if now.Before(cert.NotBefore) {
		return fmt.Errorf("certificate not yet valid")
	}
	if now.After(cert.NotAfter) {
		return fmt.Errorf("certificate expired")
	}

	// Verify chain
	opts := x509.VerifyOptions{
		Roots:       v.roots,
		CurrentTime: now,
	}

	if _, err := cert.Verify(opts); err != nil {
		return fmt.Errorf("chain verification failed: %w", err)
	}

	return nil
}

// ============================================================================
// MTLS CONFIGURATION GENERATOR
// ============================================================================

// MTLSConfig generates mTLS configuration for services
type MTLSConfig struct {
	CertPEM   []byte
	KeyPEM    []byte
	CAPEM     []byte
	VerifyPeer bool
}

// GenerateTLSConfig creates a complete mTLS configuration
func (m *MTLSConfig) GenerateTLSConfig() (interface{}, error) {
	// In production, this would return *tls.Config
	// Simplified here for demonstration
	return map[string]interface{}{
		"cert":        string(m.CertPEM),
		"key":         string(m.KeyPEM),
		"ca":          string(m.CAPEM),
		"verify_peer": m.VerifyPeer,
	}, nil
}
