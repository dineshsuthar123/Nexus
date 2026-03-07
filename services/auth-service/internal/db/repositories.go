package db

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus-rtp/auth-service/internal/models"
)

// UserRepository handles user persistence.
type UserRepository struct {
	pool *Pool
}

// NewUserRepository creates a new UserRepository.
func NewUserRepository(pool *Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// Create inserts a new user into the database.
func (r *UserRepository) Create(ctx context.Context, user *models.User) error {
	query := `
		INSERT INTO users (id, email, password_hash, first_name, last_name, organization, role, email_verified, mfa_enabled, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	_, err := r.pool.Exec(ctx, query,
		user.ID, user.Email, user.PasswordHash, user.FirstName, user.LastName,
		user.Organization, user.Role, user.EmailVerified, user.MFAEnabled,
		user.Status, user.CreatedAt, user.UpdatedAt,
	)
	if err != nil {
		if isDuplicateKeyError(err) {
			return ErrDuplicateKey
		}
		return fmt.Errorf("failed to create user: %w", err)
	}
	return nil
}

// GetByID retrieves a user by ID.
func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, first_name, last_name, organization, role,
		       email_verified, mfa_enabled, status, created_at, updated_at, last_login_at
		FROM users WHERE id = $1
	`
	user := &models.User{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.FirstName, &user.LastName,
		&user.Organization, &user.Role, &user.EmailVerified, &user.MFAEnabled,
		&user.Status, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get user by id: %w", err)
	}
	return user, nil
}

// GetByEmail retrieves a user by email.
func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	query := `
		SELECT id, email, password_hash, first_name, last_name, organization, role,
		       email_verified, mfa_enabled, status, created_at, updated_at, last_login_at
		FROM users WHERE email = $1
	`
	user := &models.User{}
	err := r.pool.QueryRow(ctx, query, email).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.FirstName, &user.LastName,
		&user.Organization, &user.Role, &user.EmailVerified, &user.MFAEnabled,
		&user.Status, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}
	return user, nil
}

// UpdateLastLogin updates the last login timestamp.
func (r *UserRepository) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE users SET last_login_at = $1, updated_at = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, time.Now().UTC(), userID)
	return err
}

// UpdateEmailVerified sets the email_verified flag.
func (r *UserRepository) UpdateEmailVerified(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE users SET email_verified = true, status = 'active', updated_at = $1 WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, time.Now().UTC(), userID)
	return err
}

// UpdatePassword updates the user's password hash.
func (r *UserRepository) UpdatePassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	query := `UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`
	_, err := r.pool.Exec(ctx, query, passwordHash, time.Now().UTC(), userID)
	return err
}

// UpdateMFAEnabled updates the MFA enabled flag.
func (r *UserRepository) UpdateMFAEnabled(ctx context.Context, userID uuid.UUID, enabled bool) error {
	query := `UPDATE users SET mfa_enabled = $1, updated_at = $2 WHERE id = $3`
	_, err := r.pool.Exec(ctx, query, enabled, time.Now().UTC(), userID)
	return err
}

// UpdateProfile updates user profile fields (firstName, lastName, organization).
func (r *UserRepository) UpdateProfile(ctx context.Context, userID uuid.UUID, firstName, lastName, organization string) (*models.User, error) {
	now := time.Now().UTC()
	query := `UPDATE users SET first_name = $1, last_name = $2, organization = $3, updated_at = $4 WHERE id = $5
	           RETURNING id, email, password_hash, first_name, last_name, organization, role, email_verified, mfa_enabled, status, created_at, updated_at, last_login_at`
	user := &models.User{}
	err := r.pool.QueryRow(ctx, query, firstName, lastName, organization, now, userID).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.FirstName, &user.LastName,
		&user.Organization, &user.Role, &user.EmailVerified, &user.MFAEnabled,
		&user.Status, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}
	return user, nil
}

// GetPasswordHash retrieves just the password hash for a user (for password change verification).
func (r *UserRepository) GetPasswordHash(ctx context.Context, userID uuid.UUID) (string, error) {
	var hash string
	err := r.pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&hash)
	if err != nil {
		return "", fmt.Errorf("failed to get password hash: %w", err)
	}
	return hash, nil
}

// --- Refresh Token Repository ---

// RefreshTokenRepository manages refresh tokens.
type RefreshTokenRepository struct {
	pool *Pool
}

// NewRefreshTokenRepository creates a new RefreshTokenRepository.
func NewRefreshTokenRepository(pool *Pool) *RefreshTokenRepository {
	return &RefreshTokenRepository{pool: pool}
}

// Create stores a new refresh token.
func (r *RefreshTokenRepository) Create(ctx context.Context, token *models.RefreshToken) error {
	query := `
		INSERT INTO refresh_tokens (id, user_id, token_hash, "family", expires_at, revoked, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := r.pool.Exec(ctx, query,
		token.ID, token.UserID, token.TokenHash, token.Family,
		token.ExpiresAt, token.Revoked, token.CreatedAt,
	)
	return err
}

// GetByTokenHash retrieves a refresh token by its hash.
func (r *RefreshTokenRepository) GetByTokenHash(ctx context.Context, tokenHash string) (*models.RefreshToken, error) {
	query := `
		SELECT id, user_id, token_hash, "family", expires_at, revoked, created_at
		FROM refresh_tokens WHERE token_hash = $1
	`
	t := &models.RefreshToken{}
	err := r.pool.QueryRow(ctx, query, tokenHash).Scan(
		&t.ID, &t.UserID, &t.TokenHash, &t.Family, &t.ExpiresAt, &t.Revoked, &t.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return t, nil
}

// RevokeByFamily revokes all tokens in a token family (for rotation abuse detection).
func (r *RefreshTokenRepository) RevokeByFamily(ctx context.Context, family string) error {
	query := `UPDATE refresh_tokens SET revoked = true WHERE "family" = $1`
	_, err := r.pool.Exec(ctx, query, family)
	return err
}

// RevokeByUserID revokes all refresh tokens for a user (logout all sessions).
func (r *RefreshTokenRepository) RevokeByUserID(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`
	_, err := r.pool.Exec(ctx, query, userID)
	return err
}

// DeleteExpired cleans up expired tokens.
func (r *RefreshTokenRepository) DeleteExpired(ctx context.Context) error {
	query := `DELETE FROM refresh_tokens WHERE expires_at < $1`
	_, err := r.pool.Exec(ctx, query, time.Now().UTC())
	return err
}

// --- MFA Repository ---

// MFARepository manages MFA records.
type MFARepository struct {
	pool *Pool
}

// NewMFARepository creates a new MFARepository.
func NewMFARepository(pool *Pool) *MFARepository {
	return &MFARepository{pool: pool}
}

// Create stores a new MFA record.
func (r *MFARepository) Create(ctx context.Context, mfa *models.UserMFA) error {
	query := `
		INSERT INTO user_mfa (id, user_id, totp_secret, backup_codes, verified, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.pool.Exec(ctx, query,
		mfa.ID, mfa.UserID, mfa.TOTPSecret, mfa.BackupCodes, mfa.Verified, mfa.CreatedAt,
	)
	return err
}

// GetByUserID retrieves MFA config for a user.
func (r *MFARepository) GetByUserID(ctx context.Context, userID uuid.UUID) (*models.UserMFA, error) {
	query := `
		SELECT id, user_id, totp_secret, backup_codes, verified, created_at
		FROM user_mfa WHERE user_id = $1
	`
	mfa := &models.UserMFA{}
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&mfa.ID, &mfa.UserID, &mfa.TOTPSecret, &mfa.BackupCodes, &mfa.Verified, &mfa.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return mfa, nil
}

// MarkVerified marks MFA as verified.
func (r *MFARepository) MarkVerified(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE user_mfa SET verified = true WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// DeleteByUserID removes MFA for a user.
func (r *MFARepository) DeleteByUserID(ctx context.Context, userID uuid.UUID) error {
	query := `DELETE FROM user_mfa WHERE user_id = $1`
	_, err := r.pool.Exec(ctx, query, userID)
	return err
}

// --- Audit Log Repository ---

// AuditLogRepository manages security audit logs.
type AuditLogRepository struct {
	pool *Pool
}

// NewAuditLogRepository creates a new AuditLogRepository.
func NewAuditLogRepository(pool *Pool) *AuditLogRepository {
	return &AuditLogRepository{pool: pool}
}

// Create inserts a new audit log entry.
func (r *AuditLogRepository) Create(ctx context.Context, log *models.AuditLog) error {
	query := `
		INSERT INTO auth_audit_logs (id, user_id, action, ip_address, user_agent, details, success, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.pool.Exec(ctx, query,
		log.ID, log.UserID, log.Action, log.IPAddress, log.UserAgent,
		log.Details, log.Success, log.CreatedAt,
	)
	return err
}

// --- Password Reset Token Repository ---

// PasswordResetRepository manages password reset tokens.
type PasswordResetRepository struct {
	pool *Pool
}

// NewPasswordResetRepository creates a new PasswordResetRepository.
func NewPasswordResetRepository(pool *Pool) *PasswordResetRepository {
	return &PasswordResetRepository{pool: pool}
}

// Create stores a new password reset token.
func (r *PasswordResetRepository) Create(ctx context.Context, token *models.PasswordResetToken) error {
	query := `
		INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.pool.Exec(ctx, query,
		token.ID, token.UserID, token.TokenHash, token.ExpiresAt, token.Used, token.CreatedAt,
	)
	return err
}

// GetByTokenHash retrieves a password reset token.
func (r *PasswordResetRepository) GetByTokenHash(ctx context.Context, tokenHash string) (*models.PasswordResetToken, error) {
	query := `
		SELECT id, user_id, token_hash, expires_at, used, created_at
		FROM password_reset_tokens WHERE token_hash = $1
	`
	t := &models.PasswordResetToken{}
	err := r.pool.QueryRow(ctx, query, tokenHash).Scan(
		&t.ID, &t.UserID, &t.TokenHash, &t.ExpiresAt, &t.Used, &t.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return t, nil
}

// MarkUsed marks a reset token as used.
func (r *PasswordResetRepository) MarkUsed(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE password_reset_tokens SET used = true WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// --- Helper ---

func HashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return contains(errStr, "23505") || contains(errStr, "duplicate key")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && containsSubstring(s, substr)
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// --- API Key Repository ---

// APIKeyRepository manages API key records.
type APIKeyRepository struct {
	pool *Pool
}

// NewAPIKeyRepository creates a new APIKeyRepository.
func NewAPIKeyRepository(pool *Pool) *APIKeyRepository {
	return &APIKeyRepository{pool: pool}
}

// Create inserts a new API key.
func (r *APIKeyRepository) Create(ctx context.Context, key *models.APIKey) error {
	query := `
		INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, permissions, expires_at, revoked, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.pool.Exec(ctx, query,
		key.ID, key.UserID, key.Name, key.KeyPrefix, key.KeyHash,
		key.Permissions, key.ExpiresAt, key.Revoked, key.CreatedAt,
	)
	return err
}

// ListByUserID returns all non-revoked API keys for a user.
func (r *APIKeyRepository) ListByUserID(ctx context.Context, userID uuid.UUID) ([]models.APIKey, error) {
	query := `
		SELECT id, user_id, name, key_prefix, key_hash, permissions, expires_at, last_used_at, revoked, created_at
		FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []models.APIKey
	for rows.Next() {
		var k models.APIKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.Name, &k.KeyPrefix, &k.KeyHash, &k.Permissions, &k.ExpiresAt, &k.LastUsedAt, &k.Revoked, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	if keys == nil {
		keys = []models.APIKey{}
	}
	return keys, nil
}

// GetByID retrieves an API key by ID.
func (r *APIKeyRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.APIKey, error) {
	query := `
		SELECT id, user_id, name, key_prefix, key_hash, permissions, expires_at, last_used_at, revoked, created_at
		FROM api_keys WHERE id = $1
	`
	k := &models.APIKey{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&k.ID, &k.UserID, &k.Name, &k.KeyPrefix, &k.KeyHash, &k.Permissions, &k.ExpiresAt, &k.LastUsedAt, &k.Revoked, &k.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return k, nil
}

// Revoke soft-deletes an API key.
func (r *APIKeyRepository) Revoke(ctx context.Context, id, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE api_keys SET revoked = true WHERE id = $1 AND user_id = $2 AND revoked = false`,
		id, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
