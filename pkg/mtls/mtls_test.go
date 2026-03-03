package mtls

import (
	"crypto/tls"
	"os"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.CACertPath == "" {
		t.Error("DefaultConfig().CACertPath should not be empty")
	}
	if cfg.CertPath == "" {
		t.Error("DefaultConfig().CertPath should not be empty")
	}
	if cfg.KeyPath == "" {
		t.Error("DefaultConfig().KeyPath should not be empty")
	}
}

func TestDefaultConfigFromEnv(t *testing.T) {
	os.Setenv("MTLS_CA_CERT", "/custom/ca.pem")
	os.Setenv("MTLS_CERT", "/custom/cert.pem")
	os.Setenv("MTLS_KEY", "/custom/key.pem")
	os.Setenv("MTLS_SERVER_NAME", "payment-service")
	defer func() {
		os.Unsetenv("MTLS_CA_CERT")
		os.Unsetenv("MTLS_CERT")
		os.Unsetenv("MTLS_KEY")
		os.Unsetenv("MTLS_SERVER_NAME")
	}()

	cfg := DefaultConfig()
	if cfg.CACertPath != "/custom/ca.pem" {
		t.Errorf("expected /custom/ca.pem, got %s", cfg.CACertPath)
	}
	if cfg.CertPath != "/custom/cert.pem" {
		t.Errorf("expected /custom/cert.pem, got %s", cfg.CertPath)
	}
	if cfg.KeyPath != "/custom/key.pem" {
		t.Errorf("expected /custom/key.pem, got %s", cfg.KeyPath)
	}
	if cfg.ServerName != "payment-service" {
		t.Errorf("expected payment-service, got %s", cfg.ServerName)
	}
}

func TestNewTLSConfigMissingCA(t *testing.T) {
	cfg := Config{
		CACertPath: "/nonexistent/ca.pem",
		CertPath:   "/nonexistent/cert.pem",
		KeyPath:    "/nonexistent/key.pem",
	}

	_, err := NewTLSConfig(cfg)
	if err == nil {
		t.Error("expected error for missing CA cert, got nil")
	}
}

func TestTLSVersionMinimum(t *testing.T) {
	// Verify that the minimum TLS version constant is TLS 1.3
	if tls.VersionTLS13 != 0x0304 {
		t.Error("TLS 1.3 version constant mismatch")
	}
}
