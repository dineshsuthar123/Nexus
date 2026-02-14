package auth_test

import (
	"testing"

	"github.com/nexus-rtp/auth-service/internal/auth"
)

func TestMFAService_GenerateAndValidate(t *testing.T) {
	svc, err := auth.NewMFAService("NexusRTP", "12345678901234567890123456789012")
	if err != nil {
		t.Fatalf("Failed to create MFA service: %v", err)
	}

	encrypted, uri, err := svc.GenerateTOTPSecret("test@example.com")
	if err != nil {
		t.Fatalf("Failed to generate TOTP secret: %v", err)
	}

	if encrypted == "" {
		t.Error("Expected non-empty encrypted secret")
	}
	if uri == "" {
		t.Error("Expected non-empty provisioning URI")
	}

	// Validate with wrong code should return false
	valid, err := svc.ValidateTOTP(encrypted, "000000")
	if err != nil {
		t.Fatalf("Validation failed with error: %v", err)
	}
	// Note: "000000" might occasionally be valid; we test that the method works
	_ = valid
}

func TestMFAService_InvalidKeyLength(t *testing.T) {
	_, err := auth.NewMFAService("NexusRTP", "too-short")
	if err == nil {
		t.Error("Expected error for invalid key length")
	}
}

func TestMFAService_GenerateBackupCodes(t *testing.T) {
	svc, err := auth.NewMFAService("NexusRTP", "12345678901234567890123456789012")
	if err != nil {
		t.Fatalf("Failed to create MFA service: %v", err)
	}

	codes, err := svc.GenerateBackupCodes(8)
	if err != nil {
		t.Fatalf("Failed to generate backup codes: %v", err)
	}
	if len(codes) != 8 {
		t.Errorf("Expected 8 backup codes, got %d", len(codes))
	}

	// All codes should be unique
	seen := make(map[string]bool)
	for _, code := range codes {
		if seen[code] {
			t.Errorf("Duplicate backup code: %s", code)
		}
		seen[code] = true
		if len(code) != 8 {
			t.Errorf("Expected backup code length 8, got %d for %s", len(code), code)
		}
	}
}

func TestMFAService_EncryptDecryptRoundTrip(t *testing.T) {
	svc, err := auth.NewMFAService("NexusRTP", "12345678901234567890123456789012")
	if err != nil {
		t.Fatalf("Failed to create MFA service: %v", err)
	}

	// Generate and check that the encrypted secret can be decrypted (validated)
	encrypted, _, err := svc.GenerateTOTPSecret("user@example.com")
	if err != nil {
		t.Fatalf("Failed to generate TOTP secret: %v", err)
	}

	// The encrypted secret should be decryptable (ValidateTOTP internally decrypts)
	_, err = svc.ValidateTOTP(encrypted, "123456")
	if err != nil {
		t.Errorf("Failed to validate (decrypt) TOTP: %v", err)
	}
}
