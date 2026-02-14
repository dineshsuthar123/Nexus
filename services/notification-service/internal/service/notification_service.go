package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/nexus-rtp/notification-service/internal/email"
	"github.com/nexus-rtp/notification-service/internal/models"
)

var (
	ErrNotificationNotFound = errors.New("notification not found")
	ErrRecordNotFound       = errors.New("record not found")
	ErrInvalidRequest       = errors.New("invalid request")
	ErrUnauthorized         = errors.New("unauthorized")
)

// NotificationRepository defines the data access contract for notifications.
type NotificationRepository interface {
	Create(ctx context.Context, n *models.Notification) error
	GetByID(ctx context.Context, id string) (*models.Notification, error)
	ListByUser(ctx context.Context, userID string, readFilter *bool, notifType *string, page, pageSize int) (*models.PaginatedNotifications, error)
	MarkRead(ctx context.Context, id, userID string) error
	MarkAllRead(ctx context.Context, userID string) (int64, error)
}

// PreferenceRepository defines the data access contract for preferences.
type PreferenceRepository interface {
	GetByUser(ctx context.Context, userID string) ([]models.NotificationPreference, error)
	UpsertPreference(ctx context.Context, p *models.NotificationPreference) error
}

// NotificationPublisher publishes notification events (e.g. to Kafka).
type NotificationPublisher interface {
	PublishNotification(ctx context.Context, n *models.Notification) error
}

// CreateNotificationRequest represents the payload for creating a notification.
type CreateNotificationRequest struct {
	UserID      string            `json:"userId" binding:"required"`
	Type        string            `json:"type" binding:"required"`
	Priority    string            `json:"priority"`
	Title       string            `json:"title" binding:"required"`
	Message     string            `json:"message" binding:"required"`
	Channel     string            `json:"channel"`
	ReferenceID string            `json:"referenceId"`
	Metadata    map[string]string `json:"metadata"`
}

// UpdatePreferenceRequest holds a single preference update.
type UpdatePreferenceRequest struct {
	Type  string `json:"type" binding:"required"`
	InApp *bool  `json:"inApp"`
	Email *bool  `json:"email"`
	SMS   *bool  `json:"sms"`
	Push  *bool  `json:"push"`
}

// NotificationService provides notification business logic.
type NotificationService struct {
	logger    *zap.Logger
	notifRepo NotificationRepository
	prefRepo  PreferenceRepository
	producer  NotificationPublisher
	emailer   email.Sender
}

// NewNotificationService creates a new service.
func NewNotificationService(
	logger *zap.Logger,
	notifRepo NotificationRepository,
	prefRepo PreferenceRepository,
	producer NotificationPublisher,
	emailer email.Sender,
) *NotificationService {
	return &NotificationService{
		logger:    logger,
		notifRepo: notifRepo,
		prefRepo:  prefRepo,
		producer:  producer,
		emailer:   emailer,
	}
}

// Create creates and dispatches a new notification.
func (s *NotificationService) Create(ctx context.Context, req *CreateNotificationRequest) (*models.Notification, error) {
	if req.UserID == "" || req.Title == "" || req.Message == "" {
		return nil, ErrInvalidRequest
	}

	priority := models.NotificationPriority(req.Priority)
	if priority == "" {
		priority = models.PriorityMedium
	}

	channel := models.NotificationChannel(req.Channel)
	if channel == "" {
		channel = models.ChannelInApp
	}

	notifType := models.NotificationType(req.Type)
	if notifType == "" {
		notifType = models.NotificationTypeSystem
	}

	now := time.Now().UTC()
	n := &models.Notification{
		ID:          uuid.New().String(),
		UserID:      req.UserID,
		Type:        notifType,
		Priority:    priority,
		Title:       req.Title,
		Message:     req.Message,
		Channel:     channel,
		ReferenceID: req.ReferenceID,
		Metadata:    req.Metadata,
		Read:        false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Persist
	if err := s.notifRepo.Create(ctx, n); err != nil {
		s.logger.Error("Failed to create notification", zap.Error(err))
		return nil, err
	}

	// Publish to Kafka (async — best effort)
	go func() {
		pubCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.producer.PublishNotification(pubCtx, n); err != nil {
			s.logger.Warn("Kafka publish failed (non-fatal)", zap.Error(err))
		}
	}()

	// Send email if channel is EMAIL and emailer is available
	if channel == models.ChannelEmail {
		go func() {
			if err := s.emailer.Send(req.UserID, n.Title, n.Message); err != nil {
				s.logger.Warn("Email send failed (non-fatal)", zap.Error(err))
			}
		}()
	}

	s.logger.Info("Notification created",
		zap.String("id", n.ID),
		zap.String("userId", n.UserID),
		zap.String("type", string(n.Type)),
	)
	return n, nil
}

// List returns paginated notifications for a user.
func (s *NotificationService) List(ctx context.Context, userID string, readFilter *bool, notifType *string, page, pageSize int) (*models.PaginatedNotifications, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.notifRepo.ListByUser(ctx, userID, readFilter, notifType, page, pageSize)
}

// MarkRead marks a single notification as read, verifying ownership.
func (s *NotificationService) MarkRead(ctx context.Context, id, userID string) error {
	// Verify ownership
	n, err := s.notifRepo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, ErrRecordNotFound) {
			return ErrNotificationNotFound
		}
		return err
	}
	if n.UserID != userID {
		return ErrUnauthorized
	}

	return s.notifRepo.MarkRead(ctx, id, userID)
}

// MarkAllRead marks all unread notifications as read for a user.
func (s *NotificationService) MarkAllRead(ctx context.Context, userID string) (int64, error) {
	return s.notifRepo.MarkAllRead(ctx, userID)
}

// GetPreferences returns a user's notification preferences.
func (s *NotificationService) GetPreferences(ctx context.Context, userID string) ([]models.NotificationPreference, error) {
	prefs, err := s.prefRepo.GetByUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	// If no preferences exist, return defaults
	if len(prefs) == 0 {
		prefs = s.defaultPreferences(userID)
	}
	return prefs, nil
}

// UpdatePreferences upserts notification preferences for a user.
func (s *NotificationService) UpdatePreferences(ctx context.Context, userID string, updates []UpdatePreferenceRequest) ([]models.NotificationPreference, error) {
	now := time.Now().UTC()

	for _, u := range updates {
		pref := &models.NotificationPreference{
			ID:        uuid.New().String(),
			UserID:    userID,
			Type:      models.NotificationType(u.Type),
			InApp:     boolOrDefault(u.InApp, true),
			Email:     boolOrDefault(u.Email, true),
			SMS:       boolOrDefault(u.SMS, false),
			Push:      boolOrDefault(u.Push, false),
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := s.prefRepo.UpsertPreference(ctx, pref); err != nil {
			return nil, err
		}
	}

	return s.prefRepo.GetByUser(ctx, userID)
}

// defaultPreferences returns sensible defaults for all notification types.
func (s *NotificationService) defaultPreferences(userID string) []models.NotificationPreference {
	now := time.Now().UTC()
	types := []models.NotificationType{
		models.NotificationTypePayment,
		models.NotificationTypeAccount,
		models.NotificationTypeReconciliation,
		models.NotificationTypeSecurity,
		models.NotificationTypeSystem,
		models.NotificationTypeFraud,
	}

	prefs := make([]models.NotificationPreference, 0, len(types))
	for _, t := range types {
		prefs = append(prefs, models.NotificationPreference{
			ID:        uuid.New().String(),
			UserID:    userID,
			Type:      t,
			InApp:     true,
			Email:     true,
			SMS:       false,
			Push:      false,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}
	return prefs
}

func boolOrDefault(ptr *bool, defaultVal bool) bool {
	if ptr != nil {
		return *ptr
	}
	return defaultVal
}
