package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/ws-gateway/internal/hub"
	kafkago "github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

// Consumer reads from Kafka topics and broadcasts to the WebSocket hub.
type Consumer struct {
	readers []*kafkago.Reader
	hub     *hub.Hub
	logger  *zap.Logger
}

// NewConsumer creates Kafka readers for each topic.
func NewConsumer(brokers, topics []string, groupID string, h *hub.Hub, logger *zap.Logger) *Consumer {
	readers := make([]*kafkago.Reader, 0, len(topics))

	for _, topic := range topics {
		r := kafkago.NewReader(kafkago.ReaderConfig{
			Brokers:        brokers,
			Topic:          topic,
			GroupID:        groupID,
			MinBytes:       1,
			MaxBytes:       10e6,
			MaxWait:        500 * time.Millisecond,
			CommitInterval: time.Second,
			StartOffset:    kafkago.LastOffset,
			Logger:         nil,
		})
		readers = append(readers, r)
		logger.Info("kafka consumer created", zap.String("topic", topic))
	}

	return &Consumer{
		readers: readers,
		hub:     h,
		logger:  logger,
	}
}

// Start begins consuming from all topics. Blocks until context is cancelled.
func (c *Consumer) Start(ctx context.Context) {
	for _, reader := range c.readers {
		go c.consumeTopic(ctx, reader)
	}
	<-ctx.Done()
}

// Close shuts down all readers.
func (c *Consumer) Close() {
	for _, reader := range c.readers {
		if err := reader.Close(); err != nil {
			c.logger.Error("error closing kafka reader", zap.Error(err))
		}
	}
}

func (c *Consumer) consumeTopic(ctx context.Context, reader *kafkago.Reader) {
	topic := reader.Config().Topic
	c.logger.Info("starting kafka consumer", zap.String("topic", topic))

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("kafka read error",
				zap.String("topic", topic),
				zap.Error(err),
			)
			time.Sleep(time.Second)
			continue
		}

		c.handleMessage(topic, msg)
	}
}

func (c *Consumer) handleMessage(topic string, msg kafkago.Message) {
	wsMsg, err := c.transformMessage(topic, msg)
	if err != nil {
		c.logger.Warn("failed to transform kafka message",
			zap.String("topic", topic),
			zap.Int64("offset", msg.Offset),
			zap.Error(err),
		)
		return
	}

	c.hub.Broadcast(wsMsg)

	c.logger.Debug("kafka message forwarded to hub",
		zap.String("topic", topic),
		zap.String("ws_type", wsMsg.Type),
		zap.Int64("offset", msg.Offset),
	)
}

// transformMessage converts a Kafka message into a WebSocket hub.Message.
func (c *Consumer) transformMessage(topic string, msg kafkago.Message) (*hub.Message, error) {
	// Determine WebSocket message type from Kafka topic
	wsType := topicToWSType(topic)

	// Try to parse key for additional context
	var key string
	if msg.Key != nil {
		key = string(msg.Key)
	}

	// Validate JSON payload
	var payload json.RawMessage
	if json.Valid(msg.Value) {
		payload = msg.Value
	} else {
		// Wrap non-JSON payloads
		wrapped := map[string]string{
			"raw": string(msg.Value),
			"key": key,
		}
		b, _ := json.Marshal(wrapped)
		payload = b
	}

	return &hub.Message{
		Type:      wsType,
		Payload:   payload,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		ID:        uuid.New().String(),
	}, nil
}

// topicToWSType maps Kafka topic names to WebSocket message types.
func topicToWSType(topic string) string {
	switch topic {
	case "nexus.payments.status":
		return "payment.status_changed"
	case "nexus.payments.created":
		return "payment.created"
	case "nexus.events.raw":
		return "event.raw"
	case "nexus.notifications":
		return "notification"
	case "nexus.reconciliation.events":
		return "reconciliation.updated"
	case "nexus.fraud.alerts":
		return "fraud.alert"
	case "nexus.sanctions.results":
		return "sanctions.result"
	case "nexus.outbox.events":
		return "outbox.event"
	default:
		return fmt.Sprintf("kafka.%s", topic)
	}
}
