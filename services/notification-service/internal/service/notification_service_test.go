package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.uber.org/zap"

	"github.com/nexus-rtp/notification-service/internal/models"
)

// ── Mock implementations ────────────────────────────────────────────

type mockNotifRepo struct {
	createFn   func(ctx context.Context, n *models.Notification) error
	getByIDFn  func(ctx context.Context, id string) (*models.Notification, error)
	listFn     func(ctx context.Context, userID string, readFilter *bool, notifType *string, page, pageSize int) (*models.PaginatedNotifications, error)
	markReadFn func(ctx context.Context, id, userID string) error
	markAllFn  func(ctx context.Context, userID string) (int64, error)
}

func (m *mockNotifRepo) Create(ctx context.Context, n *models.Notification) error {
	if m.createFn != nil {
		return m.createFn(ctx, n)
	}
	return nil
}

func (m *mockNotifRepo) GetByID(ctx context.Context, id string) (*models.Notification, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, ErrRecordNotFound
}

func (m *mockNotifRepo) ListByUser(ctx context.Context, userID string, readFilter *bool, notifType *string, page, pageSize int) (*models.PaginatedNotifications, error) {
	if m.listFn != nil {
		return m.listFn(ctx, userID, readFilter, notifType, page, pageSize)
	}
	return &models.PaginatedNotifications{Items: []models.Notification{}}, nil
}

func (m *mockNotifRepo) MarkRead(ctx context.Context, id, userID string) error {
	if m.markReadFn != nil {
		return m.markReadFn(ctx, id, userID)
	}
	return nil
}

func (m *mockNotifRepo) MarkAllRead(ctx context.Context, userID string) (int64, error) {
	if m.markAllFn != nil {
		return m.markAllFn(ctx, userID)
	}
	return 0, nil
}

type mockPrefRepo struct {
	getByUserFn func(ctx context.Context, userID string) ([]models.NotificationPreference, error)
	upsertFn    func(ctx context.Context, p *models.NotificationPreference) error
}

func (m *mockPrefRepo) GetByUser(ctx context.Context, userID string) ([]models.NotificationPreference, error) {
	if m.getByUserFn != nil {
		return m.getByUserFn(ctx, userID)
	}
	return []models.NotificationPreference{}, nil
}

func (m *mockPrefRepo) UpsertPreference(ctx context.Context, p *models.NotificationPreference) error {
	if m.upsertFn != nil {
		return m.upsertFn(ctx, p)
	}
	return nil
}

type mockPublisher struct {
	publishFn func(ctx context.Context, n *models.Notification) error
}

func (m *mockPublisher) PublishNotification(ctx context.Context, n *models.Notification) error {
	if m.publishFn != nil {
		return m.publishFn(ctx, n)
	}
	return nil
}

type mockEmailer struct {
	sendFn func(to, subject, body string) error
	sent   []sentEmail
}

type sentEmail struct {
	to, subject, body string
}

func (m *mockEmailer) Send(to, subject, body string) error {
	m.sent = append(m.sent, sentEmail{to, subject, body})
	if m.sendFn != nil {
		return m.sendFn(to, subject, body)
	}
	return nil
}

// ── Helpers ─────────────────────────────────────────────────────────

func newTestService(
	notifRepo NotificationRepository,
	prefRepo PreferenceRepository,
	publisher NotificationPublisher,
	emailer *mockEmailer,
) *NotificationService {
	logger, _ := zap.NewDevelopment()
	if emailer == nil {
		emailer = &mockEmailer{}
	}
	return NewNotificationService(logger, notifRepo, prefRepo, publisher, emailer)
}

const testUserID = "00000000-0000-0000-0000-000000000001"

// ── Create tests ────────────────────────────────────────────────────

func TestCreate_Success(t *testing.T) {
	var created *models.Notification
	repo := &mockNotifRepo{
		createFn: func(_ context.Context, n *models.Notification) error {
			created = n
			return nil
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	req := &CreateNotificationRequest{
		UserID:  testUserID,
		Type:    "PAYMENT",
		Title:   "Payment Received",
		Message: "You received $100",
	}

	n, err := svc.Create(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n == nil {
		t.Fatal("expected notification to be returned")
	}
	if n.UserID != testUserID {
		t.Errorf("expected userID %s, got %s", testUserID, n.UserID)
	}
	if n.Title != "Payment Received" {
		t.Errorf("expected title 'Payment Received', got '%s'", n.Title)
	}
	if n.Type != models.NotificationTypePayment {
		t.Errorf("expected type PAYMENT, got %s", n.Type)
	}
	if n.Priority != models.PriorityMedium {
		t.Errorf("expected default priority MEDIUM, got %s", n.Priority)
	}
	if n.Channel != models.ChannelInApp {
		t.Errorf("expected default channel IN_APP, got %s", n.Channel)
	}
	if n.ID == "" {
		t.Error("expected notification ID to be set")
	}
	if n.Read {
		t.Error("expected notification to be unread")
	}
	if created == nil {
		t.Error("expected Create to be called on repository")
	}
}

func TestCreate_WithEmailChannel(t *testing.T) {
	emailer := &mockEmailer{}
	repo := &mockNotifRepo{}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, emailer)

	req := &CreateNotificationRequest{
		UserID:  testUserID,
		Type:    "SECURITY",
		Title:   "Login Alert",
		Message: "New login detected",
		Channel: "EMAIL",
	}

	n, err := svc.Create(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.Channel != models.ChannelEmail {
		t.Errorf("expected channel EMAIL, got %s", n.Channel)
	}
	// Give async goroutine time to execute
	time.Sleep(50 * time.Millisecond)
	if len(emailer.sent) == 0 {
		t.Error("expected email to be sent for EMAIL channel")
	}
}

func TestCreate_WithExplicitPriority(t *testing.T) {
	svc := newTestService(&mockNotifRepo{}, &mockPrefRepo{}, &mockPublisher{}, nil)

	req := &CreateNotificationRequest{
		UserID:   testUserID,
		Type:     "FRAUD",
		Priority: "CRITICAL",
		Title:    "Fraud Alert",
		Message:  "Suspicious activity",
	}

	n, err := svc.Create(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.Priority != models.PriorityCritical {
		t.Errorf("expected priority CRITICAL, got %s", n.Priority)
	}
}

func TestCreate_WithMetadata(t *testing.T) {
	svc := newTestService(&mockNotifRepo{}, &mockPrefRepo{}, &mockPublisher{}, nil)

	meta := map[string]string{"txId": "tx-123", "amount": "5000"}
	req := &CreateNotificationRequest{
		UserID:   testUserID,
		Type:     "PAYMENT",
		Title:    "Payment",
		Message:  "Done",
		Metadata: meta,
	}

	n, err := svc.Create(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.Metadata["txId"] != "tx-123" {
		t.Errorf("expected metadata txId=tx-123, got %v", n.Metadata)
	}
}

func TestCreate_InvalidRequest_MissingUserID(t *testing.T) {
	svc := newTestService(&mockNotifRepo{}, &mockPrefRepo{}, &mockPublisher{}, nil)

	req := &CreateNotificationRequest{
		Title:   "Test",
		Message: "Test",
	}

	_, err := svc.Create(context.Background(), req)
	if !errors.Is(err, ErrInvalidRequest) {
		t.Errorf("expected ErrInvalidRequest, got %v", err)
	}
}

func TestCreate_InvalidRequest_MissingTitle(t *testing.T) {
	svc := newTestService(&mockNotifRepo{}, &mockPrefRepo{}, &mockPublisher{}, nil)

	req := &CreateNotificationRequest{
		UserID:  testUserID,
		Type:    "SYSTEM",
		Message: "Body only",
	}

	_, err := svc.Create(context.Background(), req)
	if !errors.Is(err, ErrInvalidRequest) {
		t.Errorf("expected ErrInvalidRequest, got %v", err)
	}
}

func TestCreate_InvalidRequest_MissingMessage(t *testing.T) {
	svc := newTestService(&mockNotifRepo{}, &mockPrefRepo{}, &mockPublisher{}, nil)

	req := &CreateNotificationRequest{
		UserID: testUserID,
		Type:   "SYSTEM",
		Title:  "Title only",
	}

	_, err := svc.Create(context.Background(), req)
	if !errors.Is(err, ErrInvalidRequest) {
		t.Errorf("expected ErrInvalidRequest, got %v", err)
	}
}

func TestCreate_RepoError(t *testing.T) {
	dbErr := errors.New("db connection failed")
	repo := &mockNotifRepo{
		createFn: func(_ context.Context, _ *models.Notification) error {
			return dbErr
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	req := &CreateNotificationRequest{
		UserID:  testUserID,
		Type:    "SYSTEM",
		Title:   "Test",
		Message: "Test",
	}

	_, err := svc.Create(context.Background(), req)
	if err == nil {
		t.Fatal("expected error")
	}
	if !errors.Is(err, dbErr) {
		t.Errorf("expected db error, got %v", err)
	}
}

func TestCreate_DefaultType(t *testing.T) {
	svc := newTestService(&mockNotifRepo{}, &mockPrefRepo{}, &mockPublisher{}, nil)

	req := &CreateNotificationRequest{
		UserID:  testUserID,
		Type:    "", // Empty should default to SYSTEM
		Title:   "Test",
		Message: "Test",
	}

	n, err := svc.Create(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n.Type != models.NotificationTypeSystem {
		t.Errorf("expected default type SYSTEM, got %s", n.Type)
	}
}

// ── List tests ──────────────────────────────────────────────────────

func TestList_Success(t *testing.T) {
	repo := &mockNotifRepo{
		listFn: func(_ context.Context, userID string, _ *bool, _ *string, page, pageSize int) (*models.PaginatedNotifications, error) {
			if userID != testUserID {
				t.Errorf("expected userID %s, got %s", testUserID, userID)
			}
			return &models.PaginatedNotifications{
				Items:       []models.Notification{{ID: "n-1", Title: "Test"}},
				Total:       1,
				Page:        page,
				PageSize:    pageSize,
				TotalPages:  1,
				UnreadCount: 1,
			}, nil
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	result, err := svc.List(context.Background(), testUserID, nil, nil, 1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Items) != 1 {
		t.Errorf("expected 1 item, got %d", len(result.Items))
	}
	if result.UnreadCount != 1 {
		t.Errorf("expected unreadCount 1, got %d", result.UnreadCount)
	}
}

func TestList_DefaultsPagination(t *testing.T) {
	var capturedPage, capturedPageSize int
	repo := &mockNotifRepo{
		listFn: func(_ context.Context, _ string, _ *bool, _ *string, page, pageSize int) (*models.PaginatedNotifications, error) {
			capturedPage = page
			capturedPageSize = pageSize
			return &models.PaginatedNotifications{Items: []models.Notification{}}, nil
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	// Page < 1 should default to 1
	_, _ = svc.List(context.Background(), testUserID, nil, nil, 0, 0)
	if capturedPage != 1 {
		t.Errorf("expected page to default to 1, got %d", capturedPage)
	}
	if capturedPageSize != 20 {
		t.Errorf("expected pageSize to default to 20, got %d", capturedPageSize)
	}

	// PageSize > 100 should be clamped to 20
	_, _ = svc.List(context.Background(), testUserID, nil, nil, 1, 200)
	if capturedPageSize != 20 {
		t.Errorf("expected pageSize to be clamped to 20 for >100, got %d", capturedPageSize)
	}
}

func TestList_WithFilters(t *testing.T) {
	var capturedRead *bool
	var capturedType *string
	repo := &mockNotifRepo{
		listFn: func(_ context.Context, _ string, readFilter *bool, notifType *string, _, _ int) (*models.PaginatedNotifications, error) {
			capturedRead = readFilter
			capturedType = notifType
			return &models.PaginatedNotifications{Items: []models.Notification{}}, nil
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	readFalse := false
	typeStr := "PAYMENT"
	_, _ = svc.List(context.Background(), testUserID, &readFalse, &typeStr, 1, 20)

	if capturedRead == nil || *capturedRead != false {
		t.Error("expected read filter to be false")
	}
	if capturedType == nil || *capturedType != "PAYMENT" {
		t.Error("expected type filter to be PAYMENT")
	}
}

// ── MarkRead tests ──────────────────────────────────────────────────

func TestMarkRead_Success(t *testing.T) {
	repo := &mockNotifRepo{
		getByIDFn: func(_ context.Context, id string) (*models.Notification, error) {
			return &models.Notification{ID: id, UserID: testUserID}, nil
		},
		markReadFn: func(_ context.Context, id, userID string) error {
			if id != "n-1" || userID != testUserID {
				t.Errorf("unexpected args: id=%s, userID=%s", id, userID)
			}
			return nil
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	err := svc.MarkRead(context.Background(), "n-1", testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMarkRead_NotFound(t *testing.T) {
	repo := &mockNotifRepo{
		getByIDFn: func(_ context.Context, _ string) (*models.Notification, error) {
			return nil, ErrRecordNotFound
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	err := svc.MarkRead(context.Background(), "nonexistent", testUserID)
	if !errors.Is(err, ErrNotificationNotFound) {
		t.Errorf("expected ErrNotificationNotFound, got %v", err)
	}
}

func TestMarkRead_Unauthorized(t *testing.T) {
	repo := &mockNotifRepo{
		getByIDFn: func(_ context.Context, id string) (*models.Notification, error) {
			return &models.Notification{ID: id, UserID: "other-user"}, nil
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	err := svc.MarkRead(context.Background(), "n-1", testUserID)
	if !errors.Is(err, ErrUnauthorized) {
		t.Errorf("expected ErrUnauthorized, got %v", err)
	}
}

func TestMarkRead_RepoGetError(t *testing.T) {
	dbErr := errors.New("db error")
	repo := &mockNotifRepo{
		getByIDFn: func(_ context.Context, _ string) (*models.Notification, error) {
			return nil, dbErr
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	err := svc.MarkRead(context.Background(), "n-1", testUserID)
	if !errors.Is(err, dbErr) {
		t.Errorf("expected db error, got %v", err)
	}
}

// ── MarkAllRead tests ───────────────────────────────────────────────

func TestMarkAllRead_Success(t *testing.T) {
	repo := &mockNotifRepo{
		markAllFn: func(_ context.Context, userID string) (int64, error) {
			if userID != testUserID {
				t.Errorf("expected userID %s, got %s", testUserID, userID)
			}
			return 5, nil
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	count, err := svc.MarkAllRead(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 5 {
		t.Errorf("expected 5 marked read, got %d", count)
	}
}

func TestMarkAllRead_RepoError(t *testing.T) {
	dbErr := errors.New("db error")
	repo := &mockNotifRepo{
		markAllFn: func(_ context.Context, _ string) (int64, error) {
			return 0, dbErr
		},
	}
	svc := newTestService(repo, &mockPrefRepo{}, &mockPublisher{}, nil)

	_, err := svc.MarkAllRead(context.Background(), testUserID)
	if !errors.Is(err, dbErr) {
		t.Errorf("expected db error, got %v", err)
	}
}

// ── GetPreferences tests ────────────────────────────────────────────

func TestGetPreferences_ReturnsExisting(t *testing.T) {
	existing := []models.NotificationPreference{
		{ID: "p-1", UserID: testUserID, Type: models.NotificationTypePayment, InApp: true, Email: false},
	}
	prefRepo := &mockPrefRepo{
		getByUserFn: func(_ context.Context, _ string) ([]models.NotificationPreference, error) {
			return existing, nil
		},
	}
	svc := newTestService(&mockNotifRepo{}, prefRepo, &mockPublisher{}, nil)

	prefs, err := svc.GetPreferences(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prefs) != 1 {
		t.Fatalf("expected 1 preference, got %d", len(prefs))
	}
	if prefs[0].Type != models.NotificationTypePayment {
		t.Errorf("expected PAYMENT type, got %s", prefs[0].Type)
	}
}

func TestGetPreferences_ReturnsDefaults(t *testing.T) {
	prefRepo := &mockPrefRepo{
		getByUserFn: func(_ context.Context, _ string) ([]models.NotificationPreference, error) {
			return []models.NotificationPreference{}, nil // empty = return defaults
		},
	}
	svc := newTestService(&mockNotifRepo{}, prefRepo, &mockPublisher{}, nil)

	prefs, err := svc.GetPreferences(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should return defaults for all 6 notification types
	if len(prefs) != 6 {
		t.Fatalf("expected 6 default preferences, got %d", len(prefs))
	}
	// All defaults should have InApp=true, Email=true, SMS=false, Push=false
	for _, p := range prefs {
		if !p.InApp {
			t.Errorf("expected InApp=true for default preference type %s", p.Type)
		}
		if !p.Email {
			t.Errorf("expected Email=true for default preference type %s", p.Type)
		}
		if p.SMS {
			t.Errorf("expected SMS=false for default preference type %s", p.Type)
		}
		if p.Push {
			t.Errorf("expected Push=false for default preference type %s", p.Type)
		}
	}
}

func TestGetPreferences_RepoError(t *testing.T) {
	dbErr := errors.New("db error")
	prefRepo := &mockPrefRepo{
		getByUserFn: func(_ context.Context, _ string) ([]models.NotificationPreference, error) {
			return nil, dbErr
		},
	}
	svc := newTestService(&mockNotifRepo{}, prefRepo, &mockPublisher{}, nil)

	_, err := svc.GetPreferences(context.Background(), testUserID)
	if !errors.Is(err, dbErr) {
		t.Errorf("expected db error, got %v", err)
	}
}

// ── UpdatePreferences tests ─────────────────────────────────────────

func TestUpdatePreferences_Success(t *testing.T) {
	var upserted []*models.NotificationPreference
	prefRepo := &mockPrefRepo{
		upsertFn: func(_ context.Context, p *models.NotificationPreference) error {
			upserted = append(upserted, p)
			return nil
		},
		getByUserFn: func(_ context.Context, _ string) ([]models.NotificationPreference, error) {
			return []models.NotificationPreference{
				{ID: "p-1", UserID: testUserID, Type: models.NotificationTypePayment, InApp: true, Email: false, SMS: true},
			}, nil
		},
	}
	svc := newTestService(&mockNotifRepo{}, prefRepo, &mockPublisher{}, nil)

	boolTrue := true
	boolFalse := false
	updates := []UpdatePreferenceRequest{
		{Type: "PAYMENT", InApp: &boolTrue, Email: &boolFalse, SMS: &boolTrue},
	}

	prefs, err := svc.UpdatePreferences(context.Background(), testUserID, updates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(upserted) != 1 {
		t.Fatalf("expected 1 upsert, got %d", len(upserted))
	}
	if upserted[0].InApp != true {
		t.Error("expected InApp=true")
	}
	if upserted[0].Email != false {
		t.Error("expected Email=false")
	}
	if upserted[0].SMS != true {
		t.Error("expected SMS=true")
	}
	if len(prefs) != 1 {
		t.Errorf("expected 1 preference returned, got %d", len(prefs))
	}
}

func TestUpdatePreferences_DefaultBoolValues(t *testing.T) {
	var upserted *models.NotificationPreference
	prefRepo := &mockPrefRepo{
		upsertFn: func(_ context.Context, p *models.NotificationPreference) error {
			upserted = p
			return nil
		},
		getByUserFn: func(_ context.Context, _ string) ([]models.NotificationPreference, error) {
			return []models.NotificationPreference{}, nil
		},
	}
	svc := newTestService(&mockNotifRepo{}, prefRepo, &mockPublisher{}, nil)

	// All nil booleans => should use defaults (InApp=true, Email=true, SMS=false, Push=false)
	updates := []UpdatePreferenceRequest{
		{Type: "ACCOUNT"},
	}

	_, err := svc.UpdatePreferences(context.Background(), testUserID, updates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if upserted == nil {
		t.Fatal("expected upsert to be called")
	}
	if !upserted.InApp {
		t.Error("expected InApp default true")
	}
	if !upserted.Email {
		t.Error("expected Email default true")
	}
	if upserted.SMS {
		t.Error("expected SMS default false")
	}
	if upserted.Push {
		t.Error("expected Push default false")
	}
}

func TestUpdatePreferences_UpsertError(t *testing.T) {
	dbErr := errors.New("db error")
	prefRepo := &mockPrefRepo{
		upsertFn: func(_ context.Context, _ *models.NotificationPreference) error {
			return dbErr
		},
	}
	svc := newTestService(&mockNotifRepo{}, prefRepo, &mockPublisher{}, nil)

	boolTrue := true
	updates := []UpdatePreferenceRequest{
		{Type: "PAYMENT", InApp: &boolTrue},
	}

	_, err := svc.UpdatePreferences(context.Background(), testUserID, updates)
	if !errors.Is(err, dbErr) {
		t.Errorf("expected db error, got %v", err)
	}
}

// ── boolOrDefault tests ─────────────────────────────────────────────

func TestBoolOrDefault(t *testing.T) {
	boolTrue := true
	boolFalse := false

	if boolOrDefault(nil, true) != true {
		t.Error("nil with default true should return true")
	}
	if boolOrDefault(nil, false) != false {
		t.Error("nil with default false should return false")
	}
	if boolOrDefault(&boolTrue, false) != true {
		t.Error("ptr=true should return true regardless of default")
	}
	if boolOrDefault(&boolFalse, true) != false {
		t.Error("ptr=false should return false regardless of default")
	}
}
