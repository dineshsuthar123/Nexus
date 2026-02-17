package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a registered user in the system.
type User struct {
	ID            uuid.UUID  `json:"id"`
	Email         string     `json:"email"`
	PasswordHash  string     `json:"-"`
	FirstName     string     `json:"firstName"`
	LastName      string     `json:"lastName"`
	Organization  string     `json:"organization,omitempty"`
	Role          string     `json:"role"`
	EmailVerified bool       `json:"emailVerified"`
	MFAEnabled    bool       `json:"mfaEnabled"`
	Status        string     `json:"status"` // active, suspended, pending_verification
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	LastLoginAt   *time.Time `json:"lastLoginAt,omitempty"`
}

// UserMFA holds TOTP MFA configuration for a user.
type UserMFA struct {
	ID          uuid.UUID `json:"id"`
	UserID      uuid.UUID `json:"userId"`
	TOTPSecret  string    `json:"-"` // encrypted at rest
	BackupCodes []string  `json:"-"` // hashed
	Verified    bool      `json:"verified"`
	CreatedAt   time.Time `json:"createdAt"`
}

// RefreshToken represents a stored refresh token for token rotation.
type RefreshToken struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"userId"`
	TokenHash string    `json:"-"`
	Family    string    `json:"-"` // token family for rotation detection
	ExpiresAt time.Time `json:"expiresAt"`
	Revoked   bool      `json:"revoked"`
	CreatedAt time.Time `json:"createdAt"`
}

// AuditLog represents a security audit event.
type AuditLog struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"userId"`
	Action    string    `json:"action"`
	IPAddress string    `json:"ipAddress"`
	UserAgent string    `json:"userAgent"`
	Details   string    `json:"details,omitempty"`
	Success   bool      `json:"success"`
	CreatedAt time.Time `json:"createdAt"`
}

// PasswordResetToken represents a signed password reset token.
type PasswordResetToken struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"userId"`
	TokenHash string    `json:"-"`
	ExpiresAt time.Time `json:"expiresAt"`
	Used      bool      `json:"used"`
	CreatedAt time.Time `json:"createdAt"`
}

// EmailVerificationToken represents an email verification token.
type EmailVerificationToken struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"userId"`
	TokenHash string    `json:"-"`
	ExpiresAt time.Time `json:"expiresAt"`
	Used      bool      `json:"used"`
	CreatedAt time.Time `json:"createdAt"`
}

// APIKey represents a user-generated API key for programmatic access.
type APIKey struct {
	ID          uuid.UUID  `json:"id"`
	UserID      uuid.UUID  `json:"userId"`
	Name        string     `json:"name"`
	KeyPrefix   string     `json:"keyPrefix"` // first 8 chars for display
	KeyHash     string     `json:"-"`         // SHA-256 hash of full key
	Permissions []string   `json:"permissions"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
	Revoked     bool       `json:"revoked"`
	CreatedAt   time.Time  `json:"createdAt"`
}
