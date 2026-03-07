package service

import (
	"context"
	"crypto/rsa"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/auth-service/internal/auth"
	"github.com/nexus-rtp/auth-service/internal/models"
)

// UserStore abstracts user persistence for testability.
type UserStore interface {
	Create(ctx context.Context, user *models.User) error
	GetByID(ctx context.Context, id uuid.UUID) (*models.User, error)
	GetByEmail(ctx context.Context, email string) (*models.User, error)
	UpdateLastLogin(ctx context.Context, userID uuid.UUID) error
	UpdateEmailVerified(ctx context.Context, userID uuid.UUID) error
	UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error
	UpdateMFAEnabled(ctx context.Context, userID uuid.UUID, enabled bool) error
	UpdateProfile(ctx context.Context, userID uuid.UUID, firstName, lastName, organization string) (*models.User, error)
	GetPasswordHash(ctx context.Context, userID uuid.UUID) (string, error)
}

// RefreshTokenStore abstracts refresh token persistence.
type RefreshTokenStore interface {
	Create(ctx context.Context, token *models.RefreshToken) error
	GetByTokenHash(ctx context.Context, tokenHash string) (*models.RefreshToken, error)
	RevokeByFamily(ctx context.Context, family string) error
	RevokeByUserID(ctx context.Context, userID uuid.UUID) error
	DeleteExpired(ctx context.Context) error
}

// MFAStore abstracts MFA persistence.
type MFAStore interface {
	Create(ctx context.Context, mfa *models.UserMFA) error
	GetByUserID(ctx context.Context, userID uuid.UUID) (*models.UserMFA, error)
	MarkVerified(ctx context.Context, id uuid.UUID) error
	DeleteByUserID(ctx context.Context, userID uuid.UUID) error
}

// AuditStore abstracts audit log persistence.
type AuditStore interface {
	Create(ctx context.Context, log *models.AuditLog) error
}

// PasswordResetStore abstracts password reset token persistence.
type PasswordResetStore interface {
	Create(ctx context.Context, token *models.PasswordResetToken) error
	GetByTokenHash(ctx context.Context, tokenHash string) (*models.PasswordResetToken, error)
	MarkUsed(ctx context.Context, id uuid.UUID) error
}

// APIKeyStore abstracts API key persistence.
type APIKeyStore interface {
	Create(ctx context.Context, key *models.APIKey) error
	ListByUserID(ctx context.Context, userID uuid.UUID) ([]models.APIKey, error)
	GetByID(ctx context.Context, id uuid.UUID) (*models.APIKey, error)
	Revoke(ctx context.Context, id, userID uuid.UUID) error
}

// TokenProvider abstracts JWT token operations.
type TokenProvider interface {
	GenerateTokenPair(userID uuid.UUID, email string, roles []string) (*auth.TokenPair, error)
	ValidateAccessToken(tokenStr string) (*auth.Claims, error)
	GetRefreshTokenExpiry() time.Duration
	GetPublicKey() *rsa.PublicKey
}

// MFAProvider abstracts TOTP/MFA operations.
type MFAProvider interface {
	GenerateTOTPSecret(email string) (encryptedSecret, provisioningURI string, err error)
	ValidateTOTP(encryptedSecret, code string) (bool, error)
	GenerateBackupCodes(count int) ([]string, error)
}
