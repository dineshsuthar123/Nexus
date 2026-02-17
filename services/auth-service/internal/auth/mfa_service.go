package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"

	"github.com/pquerna/otp/totp"
)

// MFAService handles TOTP MFA operations.
type MFAService struct {
	issuer        string
	encryptionKey []byte // 32-byte AES-256 key
}

// NewMFAService creates a new MFAService.
func NewMFAService(issuer string, encryptionKey string) (*MFAService, error) {
	key := []byte(encryptionKey)
	if len(key) != 32 {
		return nil, fmt.Errorf("encryption key must be exactly 32 bytes, got %d", len(key))
	}
	return &MFAService{
		issuer:        issuer,
		encryptionKey: key,
	}, nil
}

// GenerateTOTPSecret creates a new TOTP secret for the user.
// Returns the encrypted secret and the provisioning URI.
func (s *MFAService) GenerateTOTPSecret(email string) (encryptedSecret, provisioningURI string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      s.issuer,
		AccountName: email,
	})
	if err != nil {
		return "", "", fmt.Errorf("failed to generate TOTP key: %w", err)
	}

	encrypted, err := s.encrypt(key.Secret())
	if err != nil {
		return "", "", fmt.Errorf("failed to encrypt TOTP secret: %w", err)
	}

	return encrypted, key.URL(), nil
}

// ValidateTOTP validates a TOTP code against an encrypted secret.
func (s *MFAService) ValidateTOTP(encryptedSecret, code string) (bool, error) {
	secret, err := s.decrypt(encryptedSecret)
	if err != nil {
		return false, fmt.Errorf("failed to decrypt TOTP secret: %w", err)
	}
	return totp.Validate(code, secret), nil
}

// GenerateBackupCodes generates a set of backup codes.
func (s *MFAService) GenerateBackupCodes(count int) ([]string, error) {
	codes := make([]string, count)
	for i := 0; i < count; i++ {
		b := make([]byte, 4)
		if _, err := rand.Read(b); err != nil {
			return nil, fmt.Errorf("failed to generate backup code: %w", err)
		}
		codes[i] = fmt.Sprintf("%08x", b)
	}
	return codes, nil
}

// -- AES-256-GCM encryption / decryption --

func (s *MFAService) encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(s.encryptionKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (s *MFAService) decrypt(ciphertext string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(s.encryptionKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertextBytes := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
