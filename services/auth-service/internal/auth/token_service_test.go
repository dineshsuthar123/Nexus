package auth_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/auth-service/internal/auth"
)

func TestTokenService_GenerateAndValidate(t *testing.T) {
	privPath, pubPath := getTestKeyPaths(t)

	svc, err := auth.NewTokenService(privPath, pubPath, 15*time.Minute, 7*24*time.Hour, "test-issuer")
	if err != nil {
		t.Fatalf("Failed to create token service: %v", err)
	}

	userID := uuid.New()
	email := "test@example.com"
	roles := []string{"OPERATOR"}

	pair, err := svc.GenerateTokenPair(userID, email, roles)
	if err != nil {
		t.Fatalf("Failed to generate token pair: %v", err)
	}

	if pair.AccessToken == "" {
		t.Error("Expected non-empty access token")
	}
	if pair.RefreshToken == "" {
		t.Error("Expected non-empty refresh token")
	}
	if pair.TokenType != "Bearer" {
		t.Errorf("Expected token type 'Bearer', got '%s'", pair.TokenType)
	}
	if pair.ExpiresIn != 900 {
		t.Errorf("Expected expiresIn 900, got %d", pair.ExpiresIn)
	}

	// Validate the access token
	claims, err := svc.ValidateAccessToken(pair.AccessToken)
	if err != nil {
		t.Fatalf("Failed to validate access token: %v", err)
	}

	if claims.UID != userID.String() {
		t.Errorf("Expected UID '%s', got '%s'", userID.String(), claims.UID)
	}
	if claims.Email != email {
		t.Errorf("Expected email '%s', got '%s'", email, claims.Email)
	}
	if len(claims.Roles) != 1 || claims.Roles[0] != "OPERATOR" {
		t.Errorf("Expected roles [OPERATOR], got %v", claims.Roles)
	}
	if claims.Issuer != "test-issuer" {
		t.Errorf("Expected issuer 'test-issuer', got '%s'", claims.Issuer)
	}
}

func TestTokenService_InvalidToken(t *testing.T) {
	privPath, pubPath := getTestKeyPaths(t)

	svc, err := auth.NewTokenService(privPath, pubPath, 15*time.Minute, 7*24*time.Hour, "test-issuer")
	if err != nil {
		t.Fatalf("Failed to create token service: %v", err)
	}

	_, err = svc.ValidateAccessToken("invalid.token.string")
	if err == nil {
		t.Error("Expected error for invalid token")
	}
}

func TestTokenService_ExpiredToken(t *testing.T) {
	privPath, pubPath := getTestKeyPaths(t)

	// Create a service with 0-second expiry
	svc, err := auth.NewTokenService(privPath, pubPath, -1*time.Second, 7*24*time.Hour, "test-issuer")
	if err != nil {
		t.Fatalf("Failed to create token service: %v", err)
	}

	pair, err := svc.GenerateTokenPair(uuid.New(), "test@example.com", []string{"OPERATOR"})
	if err != nil {
		t.Fatalf("Failed to generate token pair: %v", err)
	}

	_, err = svc.ValidateAccessToken(pair.AccessToken)
	if err == nil {
		t.Error("Expected error for expired token")
	}
}

func TestTokenService_DifferentUsersGetDifferentTokens(t *testing.T) {
	privPath, pubPath := getTestKeyPaths(t)

	svc, err := auth.NewTokenService(privPath, pubPath, 15*time.Minute, 7*24*time.Hour, "test-issuer")
	if err != nil {
		t.Fatalf("Failed to create token service: %v", err)
	}

	pair1, err := svc.GenerateTokenPair(uuid.New(), "user1@example.com", []string{"OPERATOR"})
	if err != nil {
		t.Fatalf("Failed to generate token pair 1: %v", err)
	}

	pair2, err := svc.GenerateTokenPair(uuid.New(), "user2@example.com", []string{"ADMIN"})
	if err != nil {
		t.Fatalf("Failed to generate token pair 2: %v", err)
	}

	if pair1.AccessToken == pair2.AccessToken {
		t.Error("Different users should get different access tokens")
	}
	if pair1.RefreshToken == pair2.RefreshToken {
		t.Error("Different users should get different refresh tokens")
	}
}

func getTestKeyPaths(t *testing.T) (string, string) {
	t.Helper()

	// Walk up to find the keys directory
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get working directory: %v", err)
	}

	// Try current and parent directories
	for i := 0; i < 5; i++ {
		privPath := filepath.Join(dir, "keys", "dev_private.pem")
		pubPath := filepath.Join(dir, "keys", "dev_public.pem")
		if _, err := os.Stat(privPath); err == nil {
			return privPath, pubPath
		}
		dir = filepath.Dir(dir)
	}

	t.Skip("Dev RSA keys not found — run `go run cmd/genkeys/main.go` first")
	return "", ""
}
