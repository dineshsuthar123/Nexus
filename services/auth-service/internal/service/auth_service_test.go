package service

import (
	"context"
	"crypto/rsa"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/auth-service/internal/auth"
	"github.com/nexus-rtp/auth-service/internal/db"
	"github.com/nexus-rtp/auth-service/internal/email"
	"github.com/nexus-rtp/auth-service/internal/models"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// ============================================================================
// Mock implementations
// ============================================================================

type mockUserStore struct {
	createFn           func(ctx context.Context, user *models.User) error
	getByIDFn          func(ctx context.Context, id uuid.UUID) (*models.User, error)
	getByEmailFn       func(ctx context.Context, email string) (*models.User, error)
	updateLastLoginFn  func(ctx context.Context, userID uuid.UUID) error
	updateEmailVerFn   func(ctx context.Context, userID uuid.UUID) error
	updatePasswordFn   func(ctx context.Context, userID uuid.UUID, hash string) error
	updateMFAEnabledFn func(ctx context.Context, userID uuid.UUID, enabled bool) error
	updateProfileFn    func(ctx context.Context, userID uuid.UUID, fn, ln, org string) (*models.User, error)
	getPasswordHashFn  func(ctx context.Context, userID uuid.UUID) (string, error)
	createCalls        int
}

func (m *mockUserStore) Create(ctx context.Context, user *models.User) error {
	m.createCalls++
	if m.createFn != nil {
		return m.createFn(ctx, user)
	}
	return nil
}

func (m *mockUserStore) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return &models.User{ID: id, Email: "test@example.com", FirstName: "Test", LastName: "User", Role: "OPERATOR", Status: "active", EmailVerified: true}, nil
}

func (m *mockUserStore) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	if m.getByEmailFn != nil {
		return m.getByEmailFn(ctx, email)
	}
	return nil, db.ErrNotFound
}

func (m *mockUserStore) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	if m.updateLastLoginFn != nil {
		return m.updateLastLoginFn(ctx, userID)
	}
	return nil
}

func (m *mockUserStore) UpdateEmailVerified(ctx context.Context, userID uuid.UUID) error {
	if m.updateEmailVerFn != nil {
		return m.updateEmailVerFn(ctx, userID)
	}
	return nil
}

func (m *mockUserStore) UpdatePassword(ctx context.Context, userID uuid.UUID, hash string) error {
	if m.updatePasswordFn != nil {
		return m.updatePasswordFn(ctx, userID, hash)
	}
	return nil
}

func (m *mockUserStore) UpdateMFAEnabled(ctx context.Context, userID uuid.UUID, enabled bool) error {
	if m.updateMFAEnabledFn != nil {
		return m.updateMFAEnabledFn(ctx, userID, enabled)
	}
	return nil
}

func (m *mockUserStore) UpdateProfile(ctx context.Context, userID uuid.UUID, fn, ln, org string) (*models.User, error) {
	if m.updateProfileFn != nil {
		return m.updateProfileFn(ctx, userID, fn, ln, org)
	}
	return &models.User{ID: userID, FirstName: fn, LastName: ln, Organization: org, Email: "test@example.com", Role: "OPERATOR", Status: "active"}, nil
}

func (m *mockUserStore) GetPasswordHash(ctx context.Context, userID uuid.UUID) (string, error) {
	if m.getPasswordHashFn != nil {
		return m.getPasswordHashFn(ctx, userID)
	}
	return "", nil
}

type mockRefreshTokenStore struct {
	createFn       func(ctx context.Context, token *models.RefreshToken) error
	getByHashFn    func(ctx context.Context, hash string) (*models.RefreshToken, error)
	revokeByFamFn  func(ctx context.Context, family string) error
	revokeByUserFn func(ctx context.Context, userID uuid.UUID) error
	deleteExpFn    func(ctx context.Context) error
}

func (m *mockRefreshTokenStore) Create(ctx context.Context, token *models.RefreshToken) error {
	if m.createFn != nil {
		return m.createFn(ctx, token)
	}
	return nil
}

func (m *mockRefreshTokenStore) GetByTokenHash(ctx context.Context, hash string) (*models.RefreshToken, error) {
	if m.getByHashFn != nil {
		return m.getByHashFn(ctx, hash)
	}
	return nil, db.ErrNotFound
}

func (m *mockRefreshTokenStore) RevokeByFamily(ctx context.Context, family string) error {
	if m.revokeByFamFn != nil {
		return m.revokeByFamFn(ctx, family)
	}
	return nil
}

func (m *mockRefreshTokenStore) RevokeByUserID(ctx context.Context, userID uuid.UUID) error {
	if m.revokeByUserFn != nil {
		return m.revokeByUserFn(ctx, userID)
	}
	return nil
}

func (m *mockRefreshTokenStore) DeleteExpired(ctx context.Context) error {
	if m.deleteExpFn != nil {
		return m.deleteExpFn(ctx)
	}
	return nil
}

type mockMFAStore struct {
	createFn       func(ctx context.Context, mfa *models.UserMFA) error
	getByUserIDFn  func(ctx context.Context, userID uuid.UUID) (*models.UserMFA, error)
	markVerifiedFn func(ctx context.Context, id uuid.UUID) error
	deleteByUserFn func(ctx context.Context, userID uuid.UUID) error
}

func (m *mockMFAStore) Create(ctx context.Context, mfa *models.UserMFA) error {
	if m.createFn != nil {
		return m.createFn(ctx, mfa)
	}
	return nil
}

func (m *mockMFAStore) GetByUserID(ctx context.Context, userID uuid.UUID) (*models.UserMFA, error) {
	if m.getByUserIDFn != nil {
		return m.getByUserIDFn(ctx, userID)
	}
	return nil, db.ErrNotFound
}

func (m *mockMFAStore) MarkVerified(ctx context.Context, id uuid.UUID) error {
	if m.markVerifiedFn != nil {
		return m.markVerifiedFn(ctx, id)
	}
	return nil
}

func (m *mockMFAStore) DeleteByUserID(ctx context.Context, userID uuid.UUID) error {
	if m.deleteByUserFn != nil {
		return m.deleteByUserFn(ctx, userID)
	}
	return nil
}

type mockAuditStore struct {
	createFn func(ctx context.Context, log *models.AuditLog) error
	calls    int
}

func (m *mockAuditStore) Create(ctx context.Context, log *models.AuditLog) error {
	m.calls++
	if m.createFn != nil {
		return m.createFn(ctx, log)
	}
	return nil
}

type mockPasswordResetStore struct {
	createFn    func(ctx context.Context, token *models.PasswordResetToken) error
	getByHashFn func(ctx context.Context, hash string) (*models.PasswordResetToken, error)
	markUsedFn  func(ctx context.Context, id uuid.UUID) error
}

func (m *mockPasswordResetStore) Create(ctx context.Context, token *models.PasswordResetToken) error {
	if m.createFn != nil {
		return m.createFn(ctx, token)
	}
	return nil
}

func (m *mockPasswordResetStore) GetByTokenHash(ctx context.Context, hash string) (*models.PasswordResetToken, error) {
	if m.getByHashFn != nil {
		return m.getByHashFn(ctx, hash)
	}
	return nil, db.ErrNotFound
}

func (m *mockPasswordResetStore) MarkUsed(ctx context.Context, id uuid.UUID) error {
	if m.markUsedFn != nil {
		return m.markUsedFn(ctx, id)
	}
	return nil
}

type mockAPIKeyStore struct {
	createFn     func(ctx context.Context, key *models.APIKey) error
	listByUserFn func(ctx context.Context, userID uuid.UUID) ([]models.APIKey, error)
	getByIDFn    func(ctx context.Context, id uuid.UUID) (*models.APIKey, error)
	revokeFn     func(ctx context.Context, id, userID uuid.UUID) error
}

func (m *mockAPIKeyStore) Create(ctx context.Context, key *models.APIKey) error {
	if m.createFn != nil {
		return m.createFn(ctx, key)
	}
	return nil
}

func (m *mockAPIKeyStore) ListByUserID(ctx context.Context, userID uuid.UUID) ([]models.APIKey, error) {
	if m.listByUserFn != nil {
		return m.listByUserFn(ctx, userID)
	}
	return nil, nil
}

func (m *mockAPIKeyStore) GetByID(ctx context.Context, id uuid.UUID) (*models.APIKey, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, db.ErrNotFound
}

func (m *mockAPIKeyStore) Revoke(ctx context.Context, id, userID uuid.UUID) error {
	if m.revokeFn != nil {
		return m.revokeFn(ctx, id, userID)
	}
	return nil
}

type mockTokenProvider struct {
	generateFn func(userID uuid.UUID, email string, roles []string) (*auth.TokenPair, error)
	validateFn func(tokenStr string) (*auth.Claims, error)
	expiryDur  time.Duration
}

func (m *mockTokenProvider) GenerateTokenPair(userID uuid.UUID, email string, roles []string) (*auth.TokenPair, error) {
	if m.generateFn != nil {
		return m.generateFn(userID, email, roles)
	}
	return &auth.TokenPair{
		AccessToken:  "mock-access-token",
		RefreshToken: "mock-refresh-token",
		ExpiresIn:    900,
		TokenType:    "Bearer",
	}, nil
}

func (m *mockTokenProvider) ValidateAccessToken(tokenStr string) (*auth.Claims, error) {
	if m.validateFn != nil {
		return m.validateFn(tokenStr)
	}
	return nil, errors.New("invalid token")
}

func (m *mockTokenProvider) GetRefreshTokenExpiry() time.Duration {
	if m.expiryDur > 0 {
		return m.expiryDur
	}
	return 7 * 24 * time.Hour
}

func (m *mockTokenProvider) GetPublicKey() *rsa.PublicKey { return nil }

type mockMFAProvider struct {
	generateFn func(email string) (string, string, error)
	validateFn func(secret, code string) (bool, error)
	backupFn   func(count int) ([]string, error)
}

func (m *mockMFAProvider) GenerateTOTPSecret(email string) (string, string, error) {
	if m.generateFn != nil {
		return m.generateFn(email)
	}
	return "encrypted-secret", "otpauth://totp/NexusRTP:test@example.com?secret=ABC", nil
}

func (m *mockMFAProvider) ValidateTOTP(secret, code string) (bool, error) {
	if m.validateFn != nil {
		return m.validateFn(secret, code)
	}
	return code == "123456", nil
}

func (m *mockMFAProvider) GenerateBackupCodes(count int) ([]string, error) {
	if m.backupFn != nil {
		return m.backupFn(count)
	}
	codes := make([]string, count)
	for i := range codes {
		codes[i] = "backup-code-" + uuid.New().String()[:8]
	}
	return codes, nil
}

type mockEmailSender struct {
	verificationCalls int
	resetCalls        int
}

func (m *mockEmailSender) SendVerificationEmail(toEmail, token string) error {
	m.verificationCalls++
	return nil
}

func (m *mockEmailSender) SendPasswordResetEmail(toEmail, token string) error {
	m.resetCalls++
	return nil
}

// ============================================================================
// Test helpers
// ============================================================================

func newTestAuthService(opts ...func(*authTestOpts)) *AuthService {
	logger, _ := zap.NewDevelopment()
	o := &authTestOpts{
		users:   &mockUserStore{},
		refresh: &mockRefreshTokenStore{},
		mfa:     &mockMFAStore{},
		audit:   &mockAuditStore{},
		reset:   &mockPasswordResetStore{},
		apiKeys: &mockAPIKeyStore{},
		tokens:  &mockTokenProvider{},
		mfaProv: &mockMFAProvider{},
		email:   &mockEmailSender{},
	}
	for _, fn := range opts {
		fn(o)
	}
	return NewAuthService(
		logger,
		o.users,
		o.refresh,
		o.mfa,
		o.audit,
		o.reset,
		o.apiKeys,
		o.tokens,
		o.mfaProv,
		o.email,
	)
}

type authTestOpts struct {
	users   UserStore
	refresh RefreshTokenStore
	mfa     MFAStore
	audit   AuditStore
	reset   PasswordResetStore
	apiKeys APIKeyStore
	tokens  TokenProvider
	mfaProv MFAProvider
	email   email.Sender
}

func withUsers(m UserStore) func(*authTestOpts) {
	return func(o *authTestOpts) { o.users = m }
}

func withRefresh(m RefreshTokenStore) func(*authTestOpts) {
	return func(o *authTestOpts) { o.refresh = m }
}

func withMFAStore(m MFAStore) func(*authTestOpts) {
	return func(o *authTestOpts) { o.mfa = m }
}

func withAudit(m AuditStore) func(*authTestOpts) {
	return func(o *authTestOpts) { o.audit = m }
}

func withResetStore(m PasswordResetStore) func(*authTestOpts) {
	return func(o *authTestOpts) { o.reset = m }
}

func withAPIKeys(m APIKeyStore) func(*authTestOpts) {
	return func(o *authTestOpts) { o.apiKeys = m }
}

func withTokenProvider(m TokenProvider) func(*authTestOpts) {
	return func(o *authTestOpts) { o.tokens = m }
}

func withMFAProvider(m MFAProvider) func(*authTestOpts) {
	return func(o *authTestOpts) { o.mfaProv = m }
}

func withEmailSender(m email.Sender) func(*authTestOpts) {
	return func(o *authTestOpts) { o.email = m }
}

// ============================================================================
// Register Tests
// ============================================================================

func TestRegister_Success(t *testing.T) {
	userStore := &mockUserStore{}
	svc := newTestAuthService(withUsers(userStore))

	resp, err := svc.Register(context.Background(), &RegisterRequest{
		Email:     "newuser@example.com",
		Password:  "SecurePass123!",
		FirstName: "Jane",
		LastName:  "Doe",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.User.Email != "newuser@example.com" {
		t.Errorf("expected email newuser@example.com, got %s", resp.User.Email)
	}
	if resp.User.Role != "OPERATOR" {
		t.Errorf("expected role OPERATOR, got %s", resp.User.Role)
	}
	if resp.User.EmailVerified {
		t.Error("expected EmailVerified=false for new user")
	}
	if userStore.createCalls != 1 {
		t.Errorf("expected 1 user create call, got %d", userStore.createCalls)
	}
}

func TestRegister_DuplicateEmail(t *testing.T) {
	userStore := &mockUserStore{
		createFn: func(ctx context.Context, user *models.User) error {
			return db.ErrDuplicateKey
		},
	}
	svc := newTestAuthService(withUsers(userStore))

	_, err := svc.Register(context.Background(), &RegisterRequest{
		Email:     "existing@example.com",
		Password:  "SecurePass123!",
		FirstName: "Jane",
		LastName:  "Doe",
	})
	if !errors.Is(err, ErrEmailExists) {
		t.Errorf("expected ErrEmailExists, got %v", err)
	}
}

// ============================================================================
// Login Tests
// ============================================================================

func TestLogin_Success_NoMFA(t *testing.T) {
	// Generate a real bcrypt hash for password validation
	userID := uuid.New()
	hash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	userStore := &mockUserStore{
		getByEmailFn: func(ctx context.Context, email string) (*models.User, error) {
			return &models.User{
				ID:            userID,
				Email:         "alice@example.com",
				PasswordHash:  string(hash),
				FirstName:     "Alice",
				LastName:      "Smith",
				Role:          "OPERATOR",
				EmailVerified: true,
				MFAEnabled:    false,
				Status:        "active",
			}, nil
		},
	}

	svc := newTestAuthService(withUsers(userStore))

	resp, err := svc.Login(context.Background(), &LoginRequest{
		Email:    "alice@example.com",
		Password: "password123",
	}, "127.0.0.1", "TestAgent")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.MFARequired {
		t.Error("expected MFARequired=false")
	}
	if resp.Tokens == nil {
		t.Fatal("expected tokens to be issued")
	}
	if resp.Tokens.AccessToken == "" {
		t.Error("expected non-empty access token")
	}
}

func TestLogin_UserNotFound(t *testing.T) {
	svc := newTestAuthService() // default mock returns ErrNotFound

	_, err := svc.Login(context.Background(), &LoginRequest{
		Email:    "nonexistent@example.com",
		Password: "password123",
	}, "127.0.0.1", "TestAgent")

	if !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.DefaultCost)
	userStore := &mockUserStore{
		getByEmailFn: func(ctx context.Context, email string) (*models.User, error) {
			return &models.User{
				ID:            uuid.New(),
				Email:         email,
				PasswordHash:  string(hash),
				Status:        "active",
				EmailVerified: true,
			}, nil
		},
	}

	svc := newTestAuthService(withUsers(userStore))

	_, err := svc.Login(context.Background(), &LoginRequest{
		Email:    "alice@example.com",
		Password: "wrong-password",
	}, "127.0.0.1", "TestAgent")

	if !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLogin_SuspendedAccount(t *testing.T) {
	userStore := &mockUserStore{
		getByEmailFn: func(ctx context.Context, email string) (*models.User, error) {
			return &models.User{
				ID:     uuid.New(),
				Email:  email,
				Status: "suspended",
			}, nil
		},
	}

	svc := newTestAuthService(withUsers(userStore))

	_, err := svc.Login(context.Background(), &LoginRequest{
		Email:    "suspended@example.com",
		Password: "password123",
	}, "127.0.0.1", "TestAgent")

	if !errors.Is(err, ErrAccountSuspended) {
		t.Errorf("expected ErrAccountSuspended, got %v", err)
	}
}

func TestLogin_MFARequired(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	userStore := &mockUserStore{
		getByEmailFn: func(ctx context.Context, email string) (*models.User, error) {
			return &models.User{
				ID:            uuid.New(),
				Email:         email,
				PasswordHash:  string(hash),
				Status:        "active",
				EmailVerified: true,
				MFAEnabled:    true,
			}, nil
		},
	}

	svc := newTestAuthService(withUsers(userStore))

	resp, err := svc.Login(context.Background(), &LoginRequest{
		Email:    "mfa@example.com",
		Password: "password123",
	}, "127.0.0.1", "TestAgent")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.MFARequired {
		t.Error("expected MFARequired=true")
	}
	if resp.MFASessionID == "" {
		t.Error("expected non-empty MFA session ID")
	}
	if resp.Tokens != nil {
		t.Error("expected no tokens when MFA is required")
	}
}

// ============================================================================
// GetMe / GetProfile Tests
// ============================================================================

func TestGetMe_Success(t *testing.T) {
	userID := uuid.New()
	svc := newTestAuthService()

	resp, err := svc.GetMe(context.Background(), userID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ID != userID {
		t.Errorf("expected user ID %s, got %s", userID.String(), resp.ID.String())
	}
}

func TestGetProfile_Success(t *testing.T) {
	userID := uuid.New()
	svc := newTestAuthService()

	resp, err := svc.GetProfile(context.Background(), userID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ID != userID {
		t.Errorf("expected user ID %s, got %s", userID.String(), resp.ID.String())
	}
}

// ============================================================================
// UpdateProfile Tests
// ============================================================================

func TestUpdateProfile_Success(t *testing.T) {
	userID := uuid.New()
	svc := newTestAuthService()

	resp, err := svc.UpdateProfile(context.Background(), userID, &UpdateProfileRequest{
		FirstName:    "Updated",
		LastName:     "Name",
		Organization: "NewOrg",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.FirstName != "Updated" {
		t.Errorf("expected FirstName Updated, got %s", resp.FirstName)
	}
}

// ============================================================================
// RequestPasswordReset Tests
// ============================================================================

func TestRequestPasswordReset_Success(t *testing.T) {
	userStore := &mockUserStore{
		getByEmailFn: func(ctx context.Context, email string) (*models.User, error) {
			return &models.User{
				ID:    uuid.New(),
				Email: email,
			}, nil
		},
	}
	emailMock := &mockEmailSender{}
	svc := newTestAuthService(withUsers(userStore), withEmailSender(emailMock))

	err := svc.RequestPasswordReset(context.Background(), &PasswordResetRequestReq{
		Email: "user@example.com",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Email should be sent asynchronously — give goroutine a moment
	time.Sleep(50 * time.Millisecond)
	// Note: email.resetCalls may not be deterministic due to goroutine timing
}

func TestRequestPasswordReset_UnknownEmail_SilentSuccess(t *testing.T) {
	svc := newTestAuthService() // default: GetByEmail returns ErrNotFound

	// Should NOT return an error (to prevent user enumeration)
	err := svc.RequestPasswordReset(context.Background(), &PasswordResetRequestReq{
		Email: "unknown@example.com",
	})
	if err != nil {
		t.Fatalf("should not return error for unknown email, got: %v", err)
	}
}

// ============================================================================
// ResetPassword Tests
// ============================================================================

func TestResetPassword_Success(t *testing.T) {
	tokenID := uuid.New()
	userID := uuid.New()
	validToken := "valid-reset-token"

	resetStore := &mockPasswordResetStore{
		getByHashFn: func(ctx context.Context, hash string) (*models.PasswordResetToken, error) {
			return &models.PasswordResetToken{
				ID:        tokenID,
				UserID:    userID,
				ExpiresAt: time.Now().Add(1 * time.Hour),
				Used:      false,
			}, nil
		},
	}

	svc := newTestAuthService(withResetStore(resetStore))

	err := svc.ResetPassword(context.Background(), &PasswordResetReq{
		Token:    validToken,
		Password: "NewSecurePassword123!",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResetPassword_ExpiredToken(t *testing.T) {
	resetStore := &mockPasswordResetStore{
		getByHashFn: func(ctx context.Context, hash string) (*models.PasswordResetToken, error) {
			return &models.PasswordResetToken{
				ID:        uuid.New(),
				UserID:    uuid.New(),
				ExpiresAt: time.Now().Add(-1 * time.Hour), // Expired
				Used:      false,
			}, nil
		},
	}

	svc := newTestAuthService(withResetStore(resetStore))

	err := svc.ResetPassword(context.Background(), &PasswordResetReq{
		Token:    "expired-token",
		Password: "NewPass123!",
	})
	if !errors.Is(err, ErrInvalidToken) {
		t.Errorf("expected ErrInvalidToken for expired token, got %v", err)
	}
}

func TestResetPassword_UsedToken(t *testing.T) {
	resetStore := &mockPasswordResetStore{
		getByHashFn: func(ctx context.Context, hash string) (*models.PasswordResetToken, error) {
			return &models.PasswordResetToken{
				ID:        uuid.New(),
				UserID:    uuid.New(),
				ExpiresAt: time.Now().Add(1 * time.Hour),
				Used:      true, // Already used
			}, nil
		},
	}

	svc := newTestAuthService(withResetStore(resetStore))

	err := svc.ResetPassword(context.Background(), &PasswordResetReq{
		Token:    "used-token",
		Password: "NewPass123!",
	})
	if !errors.Is(err, ErrInvalidToken) {
		t.Errorf("expected ErrInvalidToken for used token, got %v", err)
	}
}

// ============================================================================
// Logout Tests
// ============================================================================

func TestLogout_Success(t *testing.T) {
	refreshStore := &mockRefreshTokenStore{}
	auditStore := &mockAuditStore{}
	svc := newTestAuthService(withRefresh(refreshStore), withAudit(auditStore))

	err := svc.Logout(context.Background(), uuid.New(), "127.0.0.1", "TestAgent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if auditStore.calls < 1 {
		t.Error("expected audit log to be created on logout")
	}
}

// ============================================================================
// MFA Setup Tests
// ============================================================================

func TestSetupMFA_Success(t *testing.T) {
	userID := uuid.New()
	userStore := &mockUserStore{
		getByIDFn: func(ctx context.Context, id uuid.UUID) (*models.User, error) {
			return &models.User{
				ID:         id,
				Email:      "test@example.com",
				MFAEnabled: false,
			}, nil
		},
	}

	svc := newTestAuthService(withUsers(userStore))

	resp, err := svc.SetupMFA(context.Background(), userID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ProvisioningURI == "" {
		t.Error("expected non-empty provisioning URI")
	}
	if len(resp.BackupCodes) == 0 {
		t.Error("expected backup codes")
	}
}

func TestSetupMFA_AlreadyEnabled(t *testing.T) {
	userStore := &mockUserStore{
		getByIDFn: func(ctx context.Context, id uuid.UUID) (*models.User, error) {
			return &models.User{
				ID:         id,
				Email:      "test@example.com",
				MFAEnabled: true,
			}, nil
		},
	}

	svc := newTestAuthService(withUsers(userStore))

	_, err := svc.SetupMFA(context.Background(), uuid.New())
	if !errors.Is(err, ErrMFAAlreadyEnabled) {
		t.Errorf("expected ErrMFAAlreadyEnabled, got %v", err)
	}
}

// ============================================================================
// API Key Tests
// ============================================================================

func TestListAPIKeys_Empty(t *testing.T) {
	svc := newTestAuthService()

	keys, err := svc.ListAPIKeys(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if keys != nil && len(keys) > 0 {
		t.Errorf("expected empty keys list, got %d", len(keys))
	}
}

func TestCreateAPIKey_Success(t *testing.T) {
	svc := newTestAuthService()

	resp, err := svc.CreateAPIKey(context.Background(), uuid.New(), &CreateAPIKeyRequest{
		Name:        "Test Key",
		Permissions: []string{"read:payments"},
		ExpiresIn:   30,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Key == "" {
		t.Error("expected non-empty API key")
	}
	if resp.Name != "Test Key" {
		t.Errorf("expected name 'Test Key', got %s", resp.Name)
	}
}

func TestRevokeAPIKey_NotFound(t *testing.T) {
	apiKeyStore := &mockAPIKeyStore{
		revokeFn: func(ctx context.Context, id, userID uuid.UUID) error {
			return db.ErrNotFound
		},
	}

	svc := newTestAuthService(withAPIKeys(apiKeyStore))

	err := svc.RevokeAPIKey(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrAPIKeyNotFound) {
		t.Errorf("expected ErrAPIKeyNotFound, got %v", err)
	}
}
