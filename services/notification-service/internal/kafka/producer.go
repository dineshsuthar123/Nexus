package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	kafkalib "github.com/segmentio/kafka-go"
	"go.uber.org/zap"

	"github.com/nexus-rtp/notification-service/internal/models"
)

// NotificationEvent is the Kafka message payload published to ws-gateway.
type NotificationEvent struct {
	EventType string                      `json:"eventType"`
	ID        string                      `json:"id"`
	UserID    string                      `json:"userId"`
	Type      models.NotificationType     `json:"type"`
	Priority  models.NotificationPriority `json:"priority"`
	Title     string                      `json:"title"`
	Message   string                      `json:"message"`
	Channel   string                      `json:"channel"`
	Timestamp time.Time                   `json:"timestamp"`
}

// Producer publishes notification events to Kafka.
type Producer struct {
	writer *kafkalib.Writer
	logger *zap.Logger
}

// NewProducer creates a new Kafka producer.
func NewProducer(brokers string, topic string, logger *zap.Logger) *Producer {
	w := &kafkalib.Writer{
		Addr:         kafkalib.TCP(brokers),
		Topic:        topic,
		Balancer:     &kafkalib.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafkalib.RequireOne,
		Async:        false,
	}

	return &Producer{
		writer: w,
		logger: logger,
	}
}

// PublishNotification sends a notification event to Kafka for WS consumption.
func (p *Producer) PublishNotification(ctx context.Context, n *models.Notification) error {
	event := NotificationEvent{
		EventType: "notification.created",
		ID:        n.ID,
		UserID:    n.UserID,
		Type:      n.Type,
		Priority:  n.Priority,
		Title:     n.Title,
		Message:   n.Message,
		Channel:   string(n.Channel),
		Timestamp: n.CreatedAt,
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal notification event: %w", err)
	}

	msg := kafkalib.Message{
		Key:   []byte(n.UserID),
		Value: payload,
		Headers: []kafkalib.Header{
			{Key: "event_type", Value: []byte("notification.created")},
			{Key: "user_id", Value: []byte(n.UserID)},
		},
	}

	if err := p.writer.WriteMessages(ctx, msg); err != nil {
		p.logger.Error("Failed to publish notification to Kafka",
			zap.String("notificationId", n.ID),
			zap.Error(err),
		)
		return fmt.Errorf("failed to publish to Kafka: %w", err)
	}

	p.logger.Debug("Published notification to Kafka",
		zap.String("notificationId", n.ID),
		zap.String("userId", n.UserID),
		zap.String("topic", p.writer.Topic),
	)
	return nil
}

// Close shuts down the Kafka writer.
func (p *Producer) Close() error {
	return p.writer.Close()
}
