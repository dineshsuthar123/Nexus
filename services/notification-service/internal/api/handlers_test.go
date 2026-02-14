package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/nexus-rtp/notification-service/internal/models"
	"github.com/nexus-rtp/notification-service/internal/service"
)

// ── Mock dependencies ────────────────────────────────────────────────

type mockNotifRepo struct {
	items   []models.Notification
	created *models.Notification
	err     error
}

func (m *mockNotifRepo) Create(_ context.Context, n *models.Notification) error {
	m.created = n
	return m.err
}

func (m *mockNotifRepo) GetByID(_ context.Context, id string) (*models.Notification, error) {
	for _, n := range m.items {
		if n.ID == id {
			return &n, nil
		}
	}
	return nil, service.ErrRecordNotFound
}

func (m *mockNotifRepo) ListByUser(_ context.Context, _ string, _ *bool, _ *string, page, pageSize int) (*models.PaginatedNotifications, error) {
	if m.err != nil {
		return nil, m.err
	}
	return &models.PaginatedNotifications{
		Items:       m.items,
		Total:       len(m.items),
		Page:        page,
		PageSize:    pageSize,
		TotalPages:  1,
		UnreadCount: len(m.items),
	}, nil
}

func (m *mockNotifRepo) MarkRead(_ context.Context, _, _ string) error { return m.err }

func (m *mockNotifRepo) MarkAllRead(_ context.Context, _ string) (int64, error) {
	return int64(len(m.items)), m.err
}

type mockPrefRepo struct {
	prefs []models.NotificationPreference
	err   error
}

func (m *mockPrefRepo) GetByUser(_ context.Context, _ string) ([]models.NotificationPreference, error) {
	return m.prefs, m.err
}

func (m *mockPrefRepo) UpsertPreference(_ context.Context, _ *models.NotificationPreference) error {
	return m.err
}

type mockPublisher struct{}

func (m *mockPublisher) PublishNotification(_ context.Context, _ *models.Notification) error {
	return nil
}

type mockEmailer struct{}

func (m *mockEmailer) Send(_, _, _ string) error { return nil }

// ── Test helpers ────────────────────────────────────────────────────

func setupRouter(svc *service.NotificationService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	logger, _ := zap.NewDevelopment()
	RegisterRoutes(router, svc, logger)
	return router
}

func buildService(notifRepo service.NotificationRepository, prefRepo service.PreferenceRepository) *service.NotificationService {
	logger, _ := zap.NewDevelopment()
	return service.NewNotificationService(logger, notifRepo, prefRepo, &mockPublisher{}, &mockEmailer{})
}

const testUserID = "00000000-0000-0000-0000-000000000001"

// ── Handler tests ───────────────────────────────────────────────────

func TestListNotifications_NoUserID(t *testing.T) {
	svc := buildService(&mockNotifRepo{}, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/notifications", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestListNotifications_Success(t *testing.T) {
	notifRepo := &mockNotifRepo{
		items: []models.Notification{
			{ID: "n-1", UserID: testUserID, Title: "Test", CreatedAt: time.Now()},
		},
	}
	svc := buildService(notifRepo, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/notifications?page=1&pageSize=10", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result models.PaginatedNotifications
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if len(result.Items) != 1 {
		t.Errorf("expected 1 item, got %d", len(result.Items))
	}
}

func TestCreateNotification_Success(t *testing.T) {
	svc := buildService(&mockNotifRepo{}, &mockPrefRepo{})
	router := setupRouter(svc)

	body, _ := json.Marshal(map[string]string{
		"userId":  testUserID,
		"type":    "PAYMENT",
		"title":   "Payment Received",
		"message": "You received $100",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/notifications", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateNotification_BadBody(t *testing.T) {
	svc := buildService(&mockNotifRepo{}, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/notifications", bytes.NewReader([]byte("{invalid")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestMarkRead_NoUserID(t *testing.T) {
	svc := buildService(&mockNotifRepo{}, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/notifications/n-1/read", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestMarkRead_NotFound(t *testing.T) {
	svc := buildService(&mockNotifRepo{items: []models.Notification{}}, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/notifications/nonexistent/read", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMarkRead_Forbidden(t *testing.T) {
	notifRepo := &mockNotifRepo{
		items: []models.Notification{
			{ID: "n-1", UserID: "other-user"},
		},
	}
	svc := buildService(notifRepo, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/notifications/n-1/read", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMarkAllRead_Success(t *testing.T) {
	notifRepo := &mockNotifRepo{
		items: []models.Notification{
			{ID: "n-1", UserID: testUserID},
			{ID: "n-2", UserID: testUserID},
		},
	}
	svc := buildService(notifRepo, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/notifications/read-all", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetPreferences_NoUserID(t *testing.T) {
	svc := buildService(&mockNotifRepo{}, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/notifications/preferences", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestGetPreferences_Success(t *testing.T) {
	svc := buildService(&mockNotifRepo{}, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/notifications/preferences", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdatePreferences_BadBody(t *testing.T) {
	svc := buildService(&mockNotifRepo{}, &mockPrefRepo{})
	router := setupRouter(svc)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/notifications/preferences", bytes.NewReader([]byte("{bad")))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestUpdatePreferences_NoUserID(t *testing.T) {
	svc := buildService(&mockNotifRepo{}, &mockPrefRepo{})
	router := setupRouter(svc)

	body, _ := json.Marshal(map[string]interface{}{
		"preferences": []map[string]interface{}{
			{"type": "PAYMENT", "inApp": true},
		},
	})

	req := httptest.NewRequest(http.MethodPut, "/api/v1/notifications/preferences", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestUpdatePreferences_Success(t *testing.T) {
	prefRepo := &mockPrefRepo{
		prefs: []models.NotificationPreference{
			{ID: "p-1", UserID: testUserID, Type: models.NotificationTypePayment, InApp: true},
		},
	}
	svc := buildService(&mockNotifRepo{}, prefRepo)
	router := setupRouter(svc)

	body, _ := json.Marshal(map[string]interface{}{
		"preferences": []map[string]interface{}{
			{"type": "PAYMENT", "inApp": true, "email": false},
		},
	})

	req := httptest.NewRequest(http.MethodPut, "/api/v1/notifications/preferences", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestErrorResponse_Format(t *testing.T) {
	resp := errorResponse("TEST_CODE", "Test message", "extra detail")
	if resp.Code != "TEST_CODE" {
		t.Errorf("expected code TEST_CODE, got %s", resp.Code)
	}
	if resp.Message != "Test message" {
		t.Errorf("expected message 'Test message', got %s", resp.Message)
	}
	if resp.Details != "extra detail" {
		t.Errorf("expected details 'extra detail', got %s", resp.Details)
	}
	if resp.Timestamp.IsZero() {
		t.Error("expected timestamp to be set")
	}
}

func TestErrorResponse_NoDetails(t *testing.T) {
	resp := errorResponse("ERR", "msg")
	if resp.Details != "" {
		t.Errorf("expected empty details, got %s", resp.Details)
	}
}
