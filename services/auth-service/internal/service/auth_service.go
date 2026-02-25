package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/auth-service/internal/auth"
	"github.com/nexus-rtp/auth-service/internal/db"
	"github.com/nexus-rtp/auth-service/internal/email"
	"github.com/nexus-rtp/auth-service/internal/models"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailExists        = errors.New("email already registered")
	ErrEmailNotVerified   = errors.New("email not verified")
	ErrAccountSuspended   = errors.New("account is suspended")
	ErrMFARequired        = errors.New("MFA verification required")
	ErrInvalidMFACode     = errors.New("invalid MFA code")
	ErrMFAAlreadyEnabled  = errors.New("MFA is already enabled")
	ErrMFANotEnabled      = errors.New("MFA is not enabled")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrTokenRevoked       = errors.New("token has been revoked")
	ErrWrongPassword      = errors.New("current password is incorrect")
	ErrAPIKeyNotFound     = errors.New("API key not found")
)

// AuthService handles authentication business logic.
type AuthService struct {
	logger           *zap.Logger
	userRepo         UserStore
	refreshTokenRepo RefreshTokenStore
	mfaRepo          MFAStore
	auditRepo        AuditStore
	resetRepo        PasswordResetStore
	apiKeyRepo       APIKeyStore
	tokenService     TokenProvider
	mfaService       MFAProvider
	emailSender      email.Sender
}

// NewAuthService creates a new AuthService.
func NewAuthService(
	logger *zap.Logger,
	userRepo UserStore,
	refreshTokenRepo RefreshTokenStore,
	mfaRepo MFAStore,
	auditRepo AuditStore,
	resetRepo PasswordResetStore,
	apiKeyRepo APIKeyStore,
	tokenService TokenProvider,
	mfaService MFAProvider,
	emailSender email.Sender,
) *AuthService {
	return &AuthService{
		logger:           logger,
		userRepo:         userRepo,
		refreshTokenRepo: refreshTokenRepo,
		mfaRepo:          mfaRepo,
		auditRepo:        auditRepo,
		resetRepo:        resetRepo,
		apiKeyRepo:       apiKeyRepo,
		tokenService:     tokenService,
		mfaService:       mfaService,
		emailSender:      emailSender,
	}
}

// --- Request/Response types ---

type RegisterRequest struct {
	Email        string `json:"email" binding:"required,email"`
	Password     string `json:"password" binding:"required,min=8"`
	FirstName    string `json:"firstName" binding:"required"`
	LastName     string `json:"lastName" binding:"required"`
	Organization string `json:"organization"`
}

type RegisterResponse struct {
	User    *UserResponse `json:"user"`
	Message string        `json:"message"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	User         *UserResponse   `json:"user"`
	Tokens       *auth.TokenPair `json:"tokens,omitempty"`
	MFARequired  bool            `json:"mfaRequired"`
	MFASessionID string          `json:"mfaSessionId,omitempty"`
}

type MFAVerifyRequest struct {
	SessionID string `json:"sessionId" binding:"required"`
	Code      string `json:"code" binding:"required"`
	Email     string `json:"email" binding:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

type PasswordResetRequestReq struct {
	Email string `json:"email" binding:"required,email"`
}

type PasswordResetReq struct {
	Token    string `json:"token" binding:"required"`
	Password string `json:"password" binding:"required,min=8"`
}

type MFASetupResponse struct {
	Secret          string   `json:"secret"`
	ProvisioningURI string   `json:"provisioningUri"`
	BackupCodes     []string `json:"backupCodes"`
}

type UserResponse struct {
	ID            uuid.UUID  `json:"id"`
	Email         string     `json:"email"`
	FirstName     string     `json:"firstName"`
	LastName      string     `json:"lastName"`
	Organization  string     `json:"organization,omitempty"`
	Role          string     `json:"role"`
	EmailVerified bool       `json:"emailVerified"`
	MFAEnabled    bool       `json:"mfaEnabled"`
	Status        string     `json:"status"`
	CreatedAt     time.Time  `json:"createdAt"`
	LastLoginAt   *time.Time `json:"lastLoginAt,omitempty"`
}

func toUserResponse(u *models.User) *UserResponse {
	return &UserResponse{
		ID:            u.ID,
		Email:         u.Email,
		FirstName:     u.FirstName,
		LastName:      u.LastName,
		Organization:  u.Organization,
		Role:          u.Role,
		EmailVerified: u.EmailVerified,
		MFAEnabled:    u.MFAEnabled,
		Status:        u.Status,
		CreatedAt:     u.CreatedAt,
		LastLoginAt:   u.LastLoginAt,
	}
}

// --- Core Operations ---

// Register creates a new user.
func (s *AuthService) Register(ctx context.Context, req *RegisterRequest) (*RegisterResponse, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	now := time.Now().UTC()
	user := &models.User{
		ID:            uuid.New(),
		Email:         req.Email,
		PasswordHash:  string(hash),
		FirstName:     req.FirstName,
		LastName:      req.LastName,
		Organization:  req.Organization,
		Role:          "OPERATOR",
		EmailVerified: false,
		MFAEnabled:    false,
		Status:        "pending_verification",
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		if errors.Is(err, db.ErrDuplicateKey) {
			return nil, ErrEmailExists
		}
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	s.logAudit(ctx, user.ID, "register", "", "", "User registered", true)

	// Send verification email asynchronously
	verificationToken := uuid.New().String()
	go func() {
		if err := s.emailSender.SendVerificationEmail(req.Email, verificationToken); err != nil {
			s.logger.Error("Failed to send verification email",
				zap.String("email", req.Email),
				zap.Error(err),
			)
		}
	}()
	s.logger.Info("User registered", zap.String("email", req.Email), zap.String("userId", user.ID.String()))

	return &RegisterResponse{
		User:    toUserResponse(user),
		Message: "Registration successful. Please verify your email.",
	}, nil
}

// Login authenticates a user with email/password.
func (s *AuthService) Login(ctx context.Context, req *LoginRequest, ipAddress, userAgent string) (*LoginResponse, error) {
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			s.logAudit(ctx, uuid.Nil, "login_failed", ipAddress, userAgent, "User not found: "+req.Email, false)
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	if user.Status == "suspended" {
		s.logAudit(ctx, user.ID, "login_failed", ipAddress, userAgent, "Account suspended", false)
		return nil, ErrAccountSuspended
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		s.logAudit(ctx, user.ID, "login_failed", ipAddress, userAgent, "Invalid password", false)
		return nil, ErrInvalidCredentials
	}

	// If MFA is enabled, don't issue tokens yet — require MFA
	if user.MFAEnabled {
		sessionID := uuid.New().String()
		// Store MFA session temporarily (in production use Redis with short TTL)
		s.logAudit(ctx, user.ID, "mfa_challenge", ipAddress, userAgent, "MFA challenge issued", true)
		return &LoginResponse{
			User:         toUserResponse(user),
			MFARequired:  true,
			MFASessionID: sessionID,
		}, nil
	}

	// Issue tokens directly if no MFA
	tokens, err := s.issueTokens(ctx, user)
	if err != nil {
		return nil, err
	}

	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)
	s.logAudit(ctx, user.ID, "login", ipAddress, userAgent, "Login successful", true)

	return &LoginResponse{
		User:   toUserResponse(user),
		Tokens: tokens,
	}, nil
}

// VerifyMFA validates a TOTP code and issues tokens.
func (s *AuthService) VerifyMFA(ctx context.Context, req *MFAVerifyRequest, ipAddress, userAgent string) (*LoginResponse, error) {
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	mfa, err := s.mfaRepo.GetByUserID(ctx, user.ID)
	if err != nil {
		return nil, ErrMFANotEnabled
	}

	valid, err := s.mfaService.ValidateTOTP(mfa.TOTPSecret, req.Code)
	if err != nil {
		return nil, fmt.Errorf("failed to validate TOTP: %w", err)
	}

	if !valid {
		s.logAudit(ctx, user.ID, "mfa_failed", ipAddress, userAgent, "Invalid MFA code", false)
		return nil, ErrInvalidMFACode
	}

	tokens, err := s.issueTokens(ctx, user)
	if err != nil {
		return nil, err
	}

	_ = s.userRepo.UpdateLastLogin(ctx, user.ID)
	s.logAudit(ctx, user.ID, "login", ipAddress, userAgent, "Login successful (MFA verified)", true)

	return &LoginResponse{
		User:   toUserResponse(user),
		Tokens: tokens,
	}, nil
}

// RefreshToken rotates a refresh token.
func (s *AuthService) RefreshToken(ctx context.Context, refreshToken string) (*auth.TokenPair, error) {
	tokenHash := hashToken(refreshToken)

	stored, err := s.refreshTokenRepo.GetByTokenHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return nil, ErrInvalidToken
		}
		return nil, fmt.Errorf("failed to get refresh token: %w", err)
	}

	if stored.Revoked {
		// Possible token reuse attack — revoke the entire family
		_ = s.refreshTokenRepo.RevokeByFamily(ctx, stored.Family)
		s.logger.Warn("Refresh token reuse detected — revoking family",
			zap.String("userId", stored.UserID.String()),
			zap.String("family", stored.Family),
		)
		return nil, ErrTokenRevoked
	}

	if time.Now().UTC().After(stored.ExpiresAt) {
		return nil, ErrInvalidToken
	}

	// Revoke the old token
	_ = s.refreshTokenRepo.RevokeByFamily(ctx, stored.Family)

	user, err := s.userRepo.GetByID(ctx, stored.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	tokens, err := s.tokenService.GenerateTokenPair(user.ID, user.Email, []string{user.Role})
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	// Store the new refresh token with the same family
	newFamily := uuid.New().String()
	newRefreshToken := &models.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: hashToken(tokens.RefreshToken),
		Family:    newFamily,
		ExpiresAt: time.Now().UTC().Add(s.tokenService.GetRefreshTokenExpiry()),
		Revoked:   false,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.refreshTokenRepo.Create(ctx, newRefreshToken); err != nil {
		return nil, fmt.Errorf("failed to store refresh token: %w", err)
	}

	return tokens, nil
}

// Logout revokes all refresh tokens for a user.
func (s *AuthService) Logout(ctx context.Context, userID uuid.UUID, ipAddress, userAgent string) error {
	if err := s.refreshTokenRepo.RevokeByUserID(ctx, userID); err != nil {
		return fmt.Errorf("failed to revoke tokens: %w", err)
	}
	s.logAudit(ctx, userID, "logout", ipAddress, userAgent, "All sessions revoked", true)
	return nil
}

// GetMe returns the current user profile.
func (s *AuthService) GetMe(ctx context.Context, userID uuid.UUID) (*UserResponse, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return toUserResponse(user), nil
}

// RequestPasswordReset creates a signed password reset token.
func (s *AuthService) RequestPasswordReset(ctx context.Context, req *PasswordResetRequestReq) error {
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		// Don't reveal whether email exists
		return nil
	}

	resetToken := uuid.New().String()
	token := &models.PasswordResetToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: hashToken(resetToken),
		ExpiresAt: time.Now().UTC().Add(1 * time.Hour),
		Used:      false,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.resetRepo.Create(ctx, token); err != nil {
		return fmt.Errorf("failed to create reset token: %w", err)
	}

	// Send password reset email asynchronously
	go func() {
		if err := s.emailSender.SendPasswordResetEmail(user.Email, resetToken); err != nil {
			s.logger.Error("Failed to send password reset email",
				zap.String("userId", user.ID.String()),
				zap.Error(err),
			)
		}
	}()
	s.logger.Info("Password reset token created",
		zap.String("userId", user.ID.String()),
	)

	s.logAudit(ctx, user.ID, "password_reset_request", "", "", "Password reset requested", true)
	return nil
}

// ResetPassword resets a user's password using a valid token.
func (s *AuthService) ResetPassword(ctx context.Context, req *PasswordResetReq) error {
	tokenHash := hashToken(req.Token)

	storedToken, err := s.resetRepo.GetByTokenHash(ctx, tokenHash)
	if err != nil {
		return ErrInvalidToken
	}

	if storedToken.Used || time.Now().UTC().After(storedToken.ExpiresAt) {
		return ErrInvalidToken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	if err := s.userRepo.UpdatePassword(ctx, storedToken.UserID, string(hash)); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	_ = s.resetRepo.MarkUsed(ctx, storedToken.ID)
	// Revoke all sessions on password change
	_ = s.refreshTokenRepo.RevokeByUserID(ctx, storedToken.UserID)

	s.logAudit(ctx, storedToken.UserID, "password_reset", "", "", "Password reset completed", true)
	return nil
}

// SetupMFA enables TOTP MFA for a user.
func (s *AuthService) SetupMFA(ctx context.Context, userID uuid.UUID) (*MFASetupResponse, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if user.MFAEnabled {
		return nil, ErrMFAAlreadyEnabled
	}

	encryptedSecret, provisioningURI, err := s.mfaService.GenerateTOTPSecret(user.Email)
	if err != nil {
		return nil, fmt.Errorf("failed to generate TOTP secret: %w", err)
	}

	backupCodes, err := s.mfaService.GenerateBackupCodes(8)
	if err != nil {
		return nil, fmt.Errorf("failed to generate backup codes: %w", err)
	}

	mfa := &models.UserMFA{
		ID:          uuid.New(),
		UserID:      userID,
		TOTPSecret:  encryptedSecret,
		BackupCodes: backupCodes,
		Verified:    false,
		CreatedAt:   time.Now().UTC(),
	}

	// Delete any existing (unverified) MFA setup
	_ = s.mfaRepo.DeleteByUserID(ctx, userID)

	if err := s.mfaRepo.Create(ctx, mfa); err != nil {
		return nil, fmt.Errorf("failed to create MFA record: %w", err)
	}

	s.logAudit(ctx, userID, "mfa_setup", "", "", "MFA setup initiated", true)

	return &MFASetupResponse{
		Secret:          encryptedSecret,
		ProvisioningURI: provisioningURI,
		BackupCodes:     backupCodes,
	}, nil
}

// ConfirmMFA verifies the first TOTP code and enables MFA.
func (s *AuthService) ConfirmMFA(ctx context.Context, userID uuid.UUID, code string) error {
	mfa, err := s.mfaRepo.GetByUserID(ctx, userID)
	if err != nil {
		return ErrMFANotEnabled
	}

	valid, err := s.mfaService.ValidateTOTP(mfa.TOTPSecret, code)
	if err != nil {
		return fmt.Errorf("failed to validate TOTP: %w", err)
	}
	if !valid {
		return ErrInvalidMFACode
	}

	if err := s.mfaRepo.MarkVerified(ctx, mfa.ID); err != nil {
		return fmt.Errorf("failed to mark MFA verified: %w", err)
	}
	if err := s.userRepo.UpdateMFAEnabled(ctx, userID, true); err != nil {
		return fmt.Errorf("failed to enable MFA: %w", err)
	}

	s.logAudit(ctx, userID, "mfa_enabled", "", "", "MFA enabled successfully", true)
	return nil
}

// DisableMFA disables TOTP MFA for a user.
func (s *AuthService) DisableMFA(ctx context.Context, userID uuid.UUID) error {
	_ = s.mfaRepo.DeleteByUserID(ctx, userID)
	if err := s.userRepo.UpdateMFAEnabled(ctx, userID, false); err != nil {
		return fmt.Errorf("failed to disable MFA: %w", err)
	}

	s.logAudit(ctx, userID, "mfa_disabled", "", "", "MFA disabled", true)
	return nil
}

// VerifyEmail verifies a user's email address.
func (s *AuthService) VerifyEmail(ctx context.Context, token string) error {
	// In production this would look up an email verification token
	// For now we accept the user ID directly for simplicity
	userID, err := uuid.Parse(token)
	if err != nil {
		return ErrInvalidToken
	}
	if err := s.userRepo.UpdateEmailVerified(ctx, userID); err != nil {
		return fmt.Errorf("failed to verify email: %w", err)
	}
	s.logAudit(ctx, userID, "email_verified", "", "", "Email verified", true)
	return nil
}

// --- Internal helpers ---

func (s *AuthService) issueTokens(ctx context.Context, user *models.User) (*auth.TokenPair, error) {
	tokens, err := s.tokenService.GenerateTokenPair(user.ID, user.Email, []string{user.Role})
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	family := uuid.New().String()
	refreshToken := &models.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: hashToken(tokens.RefreshToken),
		Family:    family,
		ExpiresAt: time.Now().UTC().Add(s.tokenService.GetRefreshTokenExpiry()),
		Revoked:   false,
		CreatedAt: time.Now().UTC(),
	}

	if err := s.refreshTokenRepo.Create(ctx, refreshToken); err != nil {
		return nil, fmt.Errorf("failed to store refresh token: %w", err)
	}

	return tokens, nil
}

func (s *AuthService) logAudit(ctx context.Context, userID uuid.UUID, action, ip, ua, details string, success bool) {
	entry := &models.AuditLog{
		ID:        uuid.New(),
		UserID:    userID,
		Action:    action,
		IPAddress: ip,
		UserAgent: ua,
		Details:   details,
		Success:   success,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.auditRepo.Create(ctx, entry); err != nil {
		s.logger.Error("Failed to write audit log", zap.Error(err))
	}
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// ─── User Profile & Settings ─────────────────────────────────────────

// UpdateProfileRequest holds the fields for profile update.
type UpdateProfileRequest struct {
	FirstName    string `json:"firstName"`
	LastName     string `json:"lastName"`
	Organization string `json:"organization"`
}

// ChangePasswordRequest holds current + new password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required,min=8"`
}

// CreateAPIKeyRequest holds the fields for creating an API key.
type CreateAPIKeyRequest struct {
	Name        string   `json:"name" binding:"required"`
	Permissions []string `json:"permissions"`
	ExpiresIn   int      `json:"expiresIn"` // optional: days until expiry
}

// CreateAPIKeyResponse returns the plaintext key (shown only once).
type CreateAPIKeyResponse struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Key         string     `json:"key"`
	KeyPrefix   string     `json:"keyPrefix"`
	Permissions []string   `json:"permissions"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// GetProfile returns the user's profile.
func (s *AuthService) GetProfile(ctx context.Context, userID uuid.UUID) (*UserResponse, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get profile: %w", err)
	}
	return toUserResponse(user), nil
}

// UpdateProfile updates the user's profile fields.
func (s *AuthService) UpdateProfile(ctx context.Context, userID uuid.UUID, req *UpdateProfileRequest) (*UserResponse, error) {
	// Get current user to merge unchanged fields
	current, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user for update: %w", err)
	}

	firstName := req.FirstName
	if firstName == "" {
		firstName = current.FirstName
	}
	lastName := req.LastName
	if lastName == "" {
		lastName = current.LastName
	}
	org := req.Organization
	if org == "" {
		org = current.Organization
	}

	updated, err := s.userRepo.UpdateProfile(ctx, userID, firstName, lastName, org)
	if err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}

	s.logAudit(ctx, userID, "profile_updated", "", "", "Profile updated", true)
	return toUserResponse(updated), nil
}

// ChangePassword verifies the old password and updates to the new one.
func (s *AuthService) ChangePassword(ctx context.Context, userID uuid.UUID, req *ChangePasswordRequest) error {
	currentHash, err := s.userRepo.GetPasswordHash(ctx, userID)
	if err != nil {
		return fmt.Errorf("failed to get current password: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)); err != nil {
		return ErrWrongPassword
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash new password: %w", err)
	}

	if err := s.userRepo.UpdatePassword(ctx, userID, string(newHash)); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	s.logAudit(ctx, userID, "password_changed", "", "", "Password changed", true)
	return nil
}

// ListAPIKeys returns all API keys for a user.
func (s *AuthService) ListAPIKeys(ctx context.Context, userID uuid.UUID) ([]models.APIKey, error) {
	return s.apiKeyRepo.ListByUserID(ctx, userID)
}

// CreateAPIKey generates a new API key and returns the plaintext (shown once).
func (s *AuthService) CreateAPIKey(ctx context.Context, userID uuid.UUID, req *CreateAPIKeyRequest) (*CreateAPIKeyResponse, error) {
	// Generate a random key
	rawKey := fmt.Sprintf("nxk_%s", uuid.New().String())
	keyHash := hashToken(rawKey)
	keyPrefix := rawKey[:12]

	if req.Permissions == nil {
		req.Permissions = []string{"read"}
	}

	var expiresAt *time.Time
	if req.ExpiresIn > 0 {
		t := time.Now().UTC().Add(time.Duration(req.ExpiresIn) * 24 * time.Hour)
		expiresAt = &t
	}

	apiKey := &models.APIKey{
		ID:          uuid.New(),
		UserID:      userID,
		Name:        req.Name,
		KeyPrefix:   keyPrefix,
		KeyHash:     keyHash,
		Permissions: req.Permissions,
		ExpiresAt:   expiresAt,
		Revoked:     false,
		CreatedAt:   time.Now().UTC(),
	}

	if err := s.apiKeyRepo.Create(ctx, apiKey); err != nil {
		return nil, fmt.Errorf("failed to create API key: %w", err)
	}

	s.logAudit(ctx, userID, "api_key_created", "", "", fmt.Sprintf("API key '%s' created", req.Name), true)

	return &CreateAPIKeyResponse{
		ID:          apiKey.ID,
		Name:        apiKey.Name,
		Key:         rawKey,
		KeyPrefix:   keyPrefix,
		Permissions: req.Permissions,
		ExpiresAt:   expiresAt,
		CreatedAt:   apiKey.CreatedAt,
	}, nil
}

// RevokeAPIKey revokes an API key.
func (s *AuthService) RevokeAPIKey(ctx context.Context, userID, keyID uuid.UUID) error {
	if err := s.apiKeyRepo.Revoke(ctx, keyID, userID); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			return ErrAPIKeyNotFound
		}
		return fmt.Errorf("failed to revoke API key: %w", err)
	}

	s.logAudit(ctx, userID, "api_key_revoked", "", "", fmt.Sprintf("API key %s revoked", keyID), true)
	return nil
}
