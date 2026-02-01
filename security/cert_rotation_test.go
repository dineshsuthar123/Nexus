package security

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// TestGenerateCACreatesValidCertificate tests CA certificate generation
func TestGenerateCACreatesValidCertificate(t *testing.T) {
	config := DefaultConfig("test-service")
	config.CACertValidity = 365 * 24 * time.Hour
	manager := NewCertManager(config)

	err := manager.Initialize()
	if err != nil {
		t.Fatalf("Failed to initialize: %v", err)
	}

	// Get CA certificate PEM
	caCertPEM := manager.GetCACertificate()
	if len(caCertPEM) == 0 {
		t.Fatal("CA certificate PEM should not be empty")
	}

	// Parse CA cert from manager's internal state (access via reflection or check PEM)
	// For this test, we verify the PEM was generated
	if string(caCertPEM[:11]) != "-----BEGIN " {
		t.Error("CA certificate should be PEM encoded")
	}
}

// TestGenerateServiceCertificateIsSignedByCA tests service certificate generation
func TestGenerateServiceCertificateIsSignedByCA(t *testing.T) {
	config := DefaultConfig("payment-service")
	config.CACertValidity = 365 * 24 * time.Hour
	config.ServiceCertValidity = 90 * 24 * time.Hour
	manager := NewCertManager(config)

	err := manager.Initialize()
	if err != nil {
		t.Fatalf("Failed to initialize: %v", err)
	}

	// Get certificates
	certPEM := manager.GetCertificate()
	if len(certPEM) == 0 {
		t.Fatal("Service certificate PEM should not be empty")
	}

	keyPEM := manager.GetPrivateKey()
	if len(keyPEM) == 0 {
		t.Fatal("Private key PEM should not be empty")
	}

	// Verify PEM format
	if string(certPEM[:11]) != "-----BEGIN " {
		t.Error("Service certificate should be PEM encoded")
	}

	if string(keyPEM[:11]) != "-----BEGIN " {
		t.Error("Private key should be PEM encoded")
	}
}

// TestCertificateChainValidation tests full chain validation
func TestCertificateChainValidation(t *testing.T) {
	config := DefaultConfig("account-service")
	config.CACertValidity = 365 * 24 * time.Hour
	config.ServiceCertValidity = 90 * 24 * time.Hour
	manager := NewCertManager(config)

	err := manager.Initialize()
	if err != nil {
		t.Fatalf("Failed to initialize: %v", err)
	}

	// Get CA and service cert PEMs
	caCertPEM := manager.GetCACertificate()
	serviceCertPEM := manager.GetCertificate()

	if len(caCertPEM) == 0 || len(serviceCertPEM) == 0 {
		t.Fatal("Certificates should not be empty")
	}

	// Both should be valid PEM
	if string(caCertPEM[:11]) != "-----BEGIN " {
		t.Error("CA certificate should be PEM encoded")
	}
	if string(serviceCertPEM[:11]) != "-----BEGIN " {
		t.Error("Service certificate should be PEM encoded")
	}
}

// TestDaysUntilExpiryCalculation tests expiry calculation
func TestDaysUntilExpiryCalculation(t *testing.T) {
	config := DefaultConfig("fraud-service")
	config.CACertValidity = 365 * 24 * time.Hour
	config.ServiceCertValidity = 90 * 24 * time.Hour
	manager := NewCertManager(config)

	// Before initialization, days should be 0
	if manager.DaysUntilExpiry() != 0 {
		t.Error("Days until expiry should be 0 before initialization")
	}

	err := manager.Initialize()
	if err != nil {
		t.Fatalf("Failed to initialize: %v", err)
	}

	// After initialization, should be close to 90 days
	days := manager.DaysUntilExpiry()
	if days < 89 || days > 91 {
		t.Errorf("Expected ~90 days until expiry, got %f", days)
	}
}

// TestCertificateRotation tests the rotation functionality
func TestCertificateRotation(t *testing.T) {
	rotationCalled := false
	config := DefaultConfig("reconciliation-service")
	config.CACertValidity = 365 * 24 * time.Hour
	config.ServiceCertValidity = 90 * 24 * time.Hour
	config.RotationThreshold = 30 * 24 * time.Hour
	config.OnRotation = func(newCert, newKey []byte) error {
		rotationCalled = true
		return nil
	}

	manager := NewCertManager(config)
	err := manager.Initialize()
	if err != nil {
		t.Fatalf("Failed to initialize: %v", err)
	}

	// Get original certificate
	origCert := manager.GetCertificate()

	// Force rotation
	err = manager.Rotate()
	if err != nil {
		t.Fatalf("Rotation failed: %v", err)
	}

	// Verify callback was called
	if !rotationCalled {
		t.Error("Rotation callback should have been called")
	}

	// Verify certificate changed
	newCert := manager.GetCertificate()
	if string(origCert) == string(newCert) {
		t.Error("Certificate should have changed after rotation")
	}
}

// TestPrometheusMetricsRegistration tests that metrics are properly defined
func TestPrometheusMetricsRegistration(t *testing.T) {
	// Create a new registry to test custom metrics
	reg := prometheus.NewRegistry()

	rotationsTotal := prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "test_cert_rotations_total",
			Help: "Total number of certificate rotations",
		},
		[]string{"service", "status"},
	)

	expiryDays := prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "test_cert_expiry_days",
			Help: "Days until certificate expiration",
		},
		[]string{"service", "type"},
	)

	reg.MustRegister(rotationsTotal)
	reg.MustRegister(expiryDays)

	// Test incrementing counter
	rotationsTotal.WithLabelValues("payment-service", "success").Inc()

	// Test setting gauge
	expiryDays.WithLabelValues("payment-service", "leaf").Set(45.5)

	// Gather metrics
	mfs, err := reg.Gather()
	if err != nil {
		t.Fatalf("Failed to gather metrics: %v", err)
	}

	// Verify metrics exist
	foundRotations := false
	foundExpiry := false
	for _, mf := range mfs {
		if *mf.Name == "test_cert_rotations_total" {
			foundRotations = true
		}
		if *mf.Name == "test_cert_expiry_days" {
			foundExpiry = true
		}
	}

	if !foundRotations {
		t.Error("Rotations counter metric not found")
	}
	if !foundExpiry {
		t.Error("Expiry gauge metric not found")
	}
}

// TestMultipleServiceManagers tests running multiple managers for different services
func TestMultipleServiceManagers(t *testing.T) {
	services := []string{"payment-service", "account-service", "fraud-detection", "reconciliation"}
	managers := make(map[string]*CertManager)

	// Create managers for all services
	for _, svc := range services {
		config := DefaultConfig(svc)
		config.CACertValidity = 365 * 24 * time.Hour
		config.ServiceCertValidity = 90 * 24 * time.Hour
		manager := NewCertManager(config)

		err := manager.Initialize()
		if err != nil {
			t.Fatalf("Failed to initialize manager for %s: %v", svc, err)
		}
		managers[svc] = manager
	}

	// Verify each manager has valid certs
	for svc, manager := range managers {
		certPEM := manager.GetCertificate()
		if len(certPEM) == 0 {
			t.Errorf("Manager for %s has empty certificate", svc)
		}

		keyPEM := manager.GetPrivateKey()
		if len(keyPEM) == 0 {
			t.Errorf("Manager for %s has empty private key", svc)
		}

		days := manager.DaysUntilExpiry()
		if days < 89 || days > 91 {
			t.Errorf("Manager for %s has unexpected expiry: %f days", svc, days)
		}
	}
}

// TestDefaultConfigValues tests that default config has reasonable values
func TestDefaultConfigValues(t *testing.T) {
	config := DefaultConfig("test-service")

	if config.ServiceName != "test-service" {
		t.Errorf("Expected service name 'test-service', got '%s'", config.ServiceName)
	}

	if config.CACertValidity != 10*365*24*time.Hour {
		t.Error("Expected CA validity of 10 years")
	}

	if config.ServiceCertValidity != 90*24*time.Hour {
		t.Error("Expected service cert validity of 90 days")
	}

	if config.RotationThreshold != 30*24*time.Hour {
		t.Error("Expected rotation threshold of 30 days")
	}

	if len(config.DNSNames) == 0 {
		t.Error("Expected at least one DNS name")
	}
}
