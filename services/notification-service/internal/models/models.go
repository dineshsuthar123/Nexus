package models

import "time"

// NotificationType represents the kind of notification.
type NotificationType string

const (
	NotificationTypePayment        NotificationType = "PAYMENT"
	NotificationTypeAccount        NotificationType = "ACCOUNT"
	NotificationTypeReconciliation NotificationType = "RECONCILIATION"
	NotificationTypeSecurity       NotificationType = "SECURITY"
	NotificationTypeSystem         NotificationType = "SYSTEM"
	NotificationTypeFraud          NotificationType = "FRAUD"
)

// NotificationPriority indicates urgency.
type NotificationPriority string

const (
	PriorityLow      NotificationPriority = "LOW"
	PriorityMedium   NotificationPriority = "MEDIUM"
	PriorityHigh     NotificationPriority = "HIGH"
	PriorityCritical NotificationPriority = "CRITICAL"
)

// NotificationChannel describes how a notification is delivered.
type NotificationChannel string

const (
	ChannelInApp NotificationChannel = "IN_APP"
	ChannelEmail NotificationChannel = "EMAIL"
	ChannelSMS   NotificationChannel = "SMS"
	ChannelPush  NotificationChannel = "PUSH"
)

// Notification represents a single notification record.
type Notification struct {
	ID          string               `json:"id"`
	UserID      string               `json:"userId"`
	Type        NotificationType     `json:"type"`
	Priority    NotificationPriority `json:"priority"`
	Title       string               `json:"title"`
	Message     string               `json:"message"`
	Channel     NotificationChannel  `json:"channel"`
	ReferenceID string               `json:"referenceId,omitempty"`
	Metadata    map[string]string    `json:"metadata,omitempty"`
	Read        bool                 `json:"read"`
	ReadAt      *time.Time           `json:"readAt,omitempty"`
	CreatedAt   time.Time            `json:"createdAt"`
	UpdatedAt   time.Time            `json:"updatedAt"`
}

// NotificationPreference stores per-user notification settings.
type NotificationPreference struct {
	ID        string           `json:"id"`
	UserID    string           `json:"userId"`
	Type      NotificationType `json:"type"`
	InApp     bool             `json:"inApp"`
	Email     bool             `json:"email"`
	SMS       bool             `json:"sms"`
	Push      bool             `json:"push"`
	CreatedAt time.Time        `json:"createdAt"`
	UpdatedAt time.Time        `json:"updatedAt"`
}

// PaginatedNotifications wraps a page of notifications with metadata.
type PaginatedNotifications struct {
	Items      []Notification `json:"items"`
	Total      int            `json:"total"`
	Page       int            `json:"page"`
	PageSize   int            `json:"pageSize"`
	TotalPages int            `json:"totalPages"`
	UnreadCount int           `json:"unreadCount"`
}
