package mtls

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
	"time"
)

// Config holds mTLS configuration for inter-service communication.
type Config struct {
	// CACertPath is the path to the CA certificate PEM file.
	CACertPath string
	// CertPath is the path to the service's client/server certificate PEM file.
	CertPath string
	// KeyPath is the path to the service's private key PEM file.
	KeyPath string
	// ServerName is the expected server name for verification (optional).
	ServerName string
	// InsecureSkipVerify disables certificate verification (dev only).
	InsecureSkipVerify bool
}

// DefaultConfig returns a Config populated from standard environment variables.
//
//	MTLS_CA_CERT   → CACertPath
//	MTLS_CERT      → CertPath
//	MTLS_KEY       → KeyPath
//	MTLS_SERVER_NAME → ServerName
func DefaultConfig() Config {
	return Config{
		CACertPath: envOr("MTLS_CA_CERT", "/etc/mtls/ca.pem"),
		CertPath:   envOr("MTLS_CERT", "/etc/mtls/server.pem"),
		KeyPath:    envOr("MTLS_KEY", "/etc/mtls/server-key.pem"),
		ServerName: os.Getenv("MTLS_SERVER_NAME"),
	}
}

// NewTLSConfig creates a tls.Config for mTLS from the provided Config.
func NewTLSConfig(cfg Config) (*tls.Config, error) {
	// Load CA certificate
	caCert, err := os.ReadFile(cfg.CACertPath)
	if err != nil {
		return nil, fmt.Errorf("mtls: failed to read CA certificate %s: %w", cfg.CACertPath, err)
	}

	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("mtls: failed to parse CA certificate %s", cfg.CACertPath)
	}

	// Load client/server certificate and key
	cert, err := tls.LoadX509KeyPair(cfg.CertPath, cfg.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("mtls: failed to load certificate pair (%s, %s): %w", cfg.CertPath, cfg.KeyPath, err)
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
		ClientCAs:    caCertPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
		MinVersion:   tls.VersionTLS13,
		CipherSuites: []uint16{
			tls.TLS_AES_256_GCM_SHA384,
			tls.TLS_AES_128_GCM_SHA256,
			tls.TLS_CHACHA20_POLY1305_SHA256,
		},
		InsecureSkipVerify: cfg.InsecureSkipVerify,
	}

	if cfg.ServerName != "" {
		tlsConfig.ServerName = cfg.ServerName
	}

	return tlsConfig, nil
}

// NewHTTPClient returns an *http.Client configured for mTLS.
func NewHTTPClient(cfg Config) (*http.Client, error) {
	tlsCfg, err := NewTLSConfig(cfg)
	if err != nil {
		return nil, err
	}

	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig:     tlsCfg,
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 20,
			IdleConnTimeout:     90 * time.Second,
			DisableCompression:  false,
		},
		Timeout: 30 * time.Second,
	}, nil
}

// NewServerTLSConfig returns a tls.Config suitable for an HTTP/gRPC server with mTLS.
func NewServerTLSConfig(cfg Config) (*tls.Config, error) {
	tlsCfg, err := NewTLSConfig(cfg)
	if err != nil {
		return nil, err
	}
	// Server doesn't need RootCAs, only ClientCAs for verifying clients
	tlsCfg.RootCAs = nil
	return tlsCfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
