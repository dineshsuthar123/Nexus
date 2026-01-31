// Package kafka provides Kafka producer and consumer functionality
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
)

// Producer provides Kafka message production with exactly-once semantics
type Producer struct {
	writers map[string]*kafka.Writer
	brokers []string
}

// NewProducer creates a new Kafka producer
func NewProducer(brokers []string) (*Producer, error) {
	p := &Producer{
		writers: make(map[string]*kafka.Writer),
		brokers: brokers,
	}
	return p, nil
}

// getWriter gets or creates a writer for a topic
func (p *Producer) getWriter(topic string) *kafka.Writer {
	if w, ok := p.writers[topic]; ok {
		return w
	}

	w := &kafka.Writer{
		Addr:         kafka.TCP(p.brokers...),
		Topic:        topic,
		Balancer:     &kafka.Hash{}, // Partition by key for ordering
		BatchSize:    100,
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireAll, // Wait for all ISRs
		Async:        false,            // Synchronous for exactly-once
		Compression:  kafka.Lz4,
		// Idempotent producer settings
		MaxAttempts: 3,
	}

	p.writers[topic] = w
	return w
}

// Publish publishes a message to a Kafka topic
func (p *Producer) Publish(ctx context.Context, topic, key string, value interface{}) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	msg := kafka.Message{
		Key:   []byte(key),
		Value: data,
		Headers: []kafka.Header{
			{Key: "content-type", Value: []byte("application/json")},
			{Key: "timestamp", Value: []byte(time.Now().UTC().Format(time.RFC3339))},
			{Key: "message-id", Value: []byte(uuid.New().String())},
		},
	}

	writer := p.getWriter(topic)
	if err := writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}

	return nil
}

// PublishBatch publishes multiple messages to a Kafka topic
func (p *Producer) PublishBatch(ctx context.Context, topic string, messages []Message) error {
	writer := p.getWriter(topic)

	kafkaMessages := make([]kafka.Message, len(messages))
	for i, msg := range messages {
		data, err := json.Marshal(msg.Value)
		if err != nil {
			return fmt.Errorf("failed to marshal message %d: %w", i, err)
		}

		kafkaMessages[i] = kafka.Message{
			Key:   []byte(msg.Key),
			Value: data,
			Headers: []kafka.Header{
				{Key: "content-type", Value: []byte("application/json")},
				{Key: "timestamp", Value: []byte(time.Now().UTC().Format(time.RFC3339))},
				{Key: "message-id", Value: []byte(uuid.New().String())},
			},
		}
	}

	if err := writer.WriteMessages(ctx, kafkaMessages...); err != nil {
		return fmt.Errorf("failed to publish batch: %w", err)
	}

	return nil
}

// Close closes all writers
func (p *Producer) Close() error {
	for topic, w := range p.writers {
		if err := w.Close(); err != nil {
			return fmt.Errorf("failed to close writer for topic %s: %w", topic, err)
		}
	}
	return nil
}

// Message represents a Kafka message
type Message struct {
	Key   string
	Value interface{}
}

// Consumer provides Kafka message consumption
type Consumer struct {
	reader *kafka.Reader
}

// ConsumerConfig holds consumer configuration
type ConsumerConfig struct {
	Brokers       []string
	Topic         string
	GroupID       string
	StartOffset   int64
	MinBytes      int
	MaxBytes      int
	CommitInterval time.Duration
}

// NewConsumer creates a new Kafka consumer
func NewConsumer(cfg ConsumerConfig) *Consumer {
	if cfg.MinBytes == 0 {
		cfg.MinBytes = 10e3 // 10KB
	}
	if cfg.MaxBytes == 0 {
		cfg.MaxBytes = 10e6 // 10MB
	}
	if cfg.CommitInterval == 0 {
		cfg.CommitInterval = time.Second
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        cfg.Brokers,
		Topic:          cfg.Topic,
		GroupID:        cfg.GroupID,
		StartOffset:    cfg.StartOffset,
		MinBytes:       cfg.MinBytes,
		MaxBytes:       cfg.MaxBytes,
		CommitInterval: cfg.CommitInterval,
		// Read committed - for exactly-once semantics
		IsolationLevel: kafka.ReadCommitted,
	})

	return &Consumer{reader: reader}
}

// ReadMessage reads a single message from Kafka
func (c *Consumer) ReadMessage(ctx context.Context) (*kafka.Message, error) {
	msg, err := c.reader.ReadMessage(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to read message: %w", err)
	}
	return &msg, nil
}

// FetchMessage fetches a message without committing
func (c *Consumer) FetchMessage(ctx context.Context) (*kafka.Message, error) {
	msg, err := c.reader.FetchMessage(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch message: %w", err)
	}
	return &msg, nil
}

// CommitMessages commits the given messages
func (c *Consumer) CommitMessages(ctx context.Context, msgs ...kafka.Message) error {
	return c.reader.CommitMessages(ctx, msgs...)
}

// Close closes the consumer
func (c *Consumer) Close() error {
	return c.reader.Close()
}

// Event types for Kafka messages
type PaymentEvent struct {
	EventType   string      `json:"eventType"`
	Timestamp   time.Time   `json:"timestamp"`
	UETR        string      `json:"uetr"`
	MessageID   string      `json:"messageId"`
	Amount      string      `json:"amount"`
	Currency    string      `json:"currency"`
	DebtorName  string      `json:"debtorName"`
	CreditorName string     `json:"creditorName"`
	Status      string      `json:"status"`
	Payload     interface{} `json:"payload,omitempty"`
}

// FraudAlertEvent represents a fraud alert
type FraudAlertEvent struct {
	EventType    string    `json:"eventType"`
	Timestamp    time.Time `json:"timestamp"`
	UETR         string    `json:"uetr"`
	AccountID    string    `json:"accountId"`
	AlertType    string    `json:"alertType"` // VELOCITY, SMURFING, GEO_ANOMALY
	Severity     string    `json:"severity"`  // LOW, MEDIUM, HIGH, CRITICAL
	Description  string    `json:"description"`
	Score        float64   `json:"score"`
	Indicators   []string  `json:"indicators"`
}

// SanctionsResultEvent represents a sanctions screening result
type SanctionsResultEvent struct {
	EventType     string    `json:"eventType"`
	Timestamp     time.Time `json:"timestamp"`
	UETR          string    `json:"uetr"`
	PartyType     string    `json:"partyType"` // DEBTOR, CREDITOR
	PartyName     string    `json:"partyName"`
	Status        string    `json:"status"` // CLEAR, BLOCKED, REVIEW
	MatchScore    float64   `json:"matchScore"`
	MatchedEntity string    `json:"matchedEntity,omitempty"`
	Programs      []string  `json:"programs,omitempty"`
}

// Topics
const (
	TopicPaymentsInitiated = "nexus.payments.initiated"
	TopicPaymentsEnriched  = "nexus.payments.enriched"
	TopicPaymentsCompleted = "nexus.payments.completed"
	TopicFraudAlerts       = "nexus.fraud.alerts"
	TopicSanctionsResults  = "nexus.sanctions.results"
	TopicReconciliation    = "nexus.reconciliation.events"
	TopicNotifications     = "nexus.notifications"
	TopicOutboxEvents      = "nexus.outbox.events"
)
