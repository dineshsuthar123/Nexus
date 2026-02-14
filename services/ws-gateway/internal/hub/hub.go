package hub

import (
	"encoding/json"
	"sync"
	"time"

	"go.uber.org/zap"
)

// Message represents a WebSocket message sent to clients.
type Message struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	Timestamp string          `json:"timestamp"`
	ID        string          `json:"id,omitempty"`
}

// Subscription tracks what a client is interested in.
type Subscription struct {
	Type       string // e.g. "payment", "account", "reconciliation", "notification"
	ResourceID string // optional filter, e.g. specific UETR or account ID
}

// Client represents a connected WebSocket client.
type Client struct {
	ID            string
	UserID        string
	Send          chan []byte
	Subscriptions map[string]Subscription // key = "type:resourceId"
	mu            sync.RWMutex
	ConnectedAt   time.Time
}

// NewClient creates a new client.
func NewClient(id, userID string, sendBufferSize int) *Client {
	return &Client{
		ID:            id,
		UserID:        userID,
		Send:          make(chan []byte, sendBufferSize),
		Subscriptions: make(map[string]Subscription),
		ConnectedAt:   time.Now(),
	}
}

// Subscribe adds a subscription for the client.
func (c *Client) Subscribe(subType, resourceID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	key := subType + ":" + resourceID
	c.Subscriptions[key] = Subscription{Type: subType, ResourceID: resourceID}
}

// Unsubscribe removes a subscription.
func (c *Client) Unsubscribe(subType, resourceID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	key := subType + ":" + resourceID
	delete(c.Subscriptions, key)
}

// IsSubscribed checks if client is interested in this message type/resource.
func (c *Client) IsSubscribed(msgType, resourceID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Check exact match first
	key := msgType + ":" + resourceID
	if _, ok := c.Subscriptions[key]; ok {
		return true
	}

	// Check wildcard (subscribed to type with no specific resource)
	wildcardKey := msgType + ":"
	if _, ok := c.Subscriptions[wildcardKey]; ok {
		return true
	}

	return false
}

// Hub manages all connected clients and broadcasts messages.
type Hub struct {
	clients    map[string]*Client         // clientID -> client
	userIndex  map[string]map[string]bool // userID -> set of clientIDs
	register   chan *Client
	unregister chan *Client
	broadcast  chan *Message
	mu         sync.RWMutex
	logger     *zap.Logger
}

// NewHub creates a new hub.
func NewHub(logger *zap.Logger) *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		userIndex:  make(map[string]map[string]bool),
		register:   make(chan *Client, 64),
		unregister: make(chan *Client, 64),
		broadcast:  make(chan *Message, 256),
		logger:     logger,
	}
}

// Run starts the hub event loop.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.addClient(client)
		case client := <-h.unregister:
			h.removeClient(client)
		case msg := <-h.broadcast:
			h.broadcastMessage(msg)
		}
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// Broadcast sends a message to all interested clients.
func (h *Hub) Broadcast(msg *Message) {
	h.broadcast <- msg
}

// ClientCount returns the number of connected clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// UserCount returns the number of unique authenticated users.
func (h *Hub) UserCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.userIndex)
}

func (h *Hub) addClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.clients[client.ID] = client

	if _, ok := h.userIndex[client.UserID]; !ok {
		h.userIndex[client.UserID] = make(map[string]bool)
	}
	h.userIndex[client.UserID][client.ID] = true

	h.logger.Info("client connected",
		zap.String("client_id", client.ID),
		zap.String("user_id", client.UserID),
		zap.Int("total_clients", len(h.clients)),
	)
}

func (h *Hub) removeClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client.ID]; !ok {
		return
	}

	close(client.Send)
	delete(h.clients, client.ID)

	if userClients, ok := h.userIndex[client.UserID]; ok {
		delete(userClients, client.ID)
		if len(userClients) == 0 {
			delete(h.userIndex, client.UserID)
		}
	}

	h.logger.Info("client disconnected",
		zap.String("client_id", client.ID),
		zap.String("user_id", client.UserID),
		zap.Int("total_clients", len(h.clients)),
	)
}

func (h *Hub) broadcastMessage(msg *Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		h.logger.Error("failed to marshal broadcast message", zap.Error(err))
		return
	}

	// Extract message routing info
	msgType, resourceID := extractRouting(msg)

	h.mu.RLock()
	defer h.mu.RUnlock()

	sent := 0
	for _, client := range h.clients {
		if client.IsSubscribed(msgType, resourceID) {
			select {
			case client.Send <- data:
				sent++
			default:
				// Client buffer full — skip
				h.logger.Warn("client send buffer full, dropping message",
					zap.String("client_id", client.ID),
				)
			}
		}
	}

	h.logger.Debug("broadcast message",
		zap.String("type", msg.Type),
		zap.Int("recipients", sent),
	)
}

// extractRouting parses message type for routing.
// Type format: "payment.status_changed", "account.balance_updated", etc.
func extractRouting(msg *Message) (string, string) {
	msgType := msg.Type

	// Try to extract resource ID from payload
	var payload map[string]interface{}
	if err := json.Unmarshal(msg.Payload, &payload); err == nil {
		if id, ok := payload["uetr"].(string); ok {
			return msgType, id
		}
		if id, ok := payload["account_id"].(string); ok {
			return msgType, id
		}
		if id, ok := payload["cycle_id"].(string); ok {
			return msgType, id
		}
		if id, ok := payload["id"].(string); ok {
			return msgType, id
		}
	}

	return msgType, ""
}
