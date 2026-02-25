package hub

import (
	"encoding/json"
	"testing"
	"time"

	"go.uber.org/zap"
)

func newTestHub() *Hub {
	logger, _ := zap.NewDevelopment()
	return NewHub(logger)
}

// ============================================================================
// Client Tests
// ============================================================================

func TestNewClient(t *testing.T) {
	c := NewClient("c1", "user1", 16)
	if c.ID != "c1" {
		t.Errorf("expected ID c1, got %s", c.ID)
	}
	if c.UserID != "user1" {
		t.Errorf("expected UserID user1, got %s", c.UserID)
	}
	if cap(c.Send) != 16 {
		t.Errorf("expected buffer size 16, got %d", cap(c.Send))
	}
	if len(c.Subscriptions) != 0 {
		t.Errorf("expected empty subscriptions, got %d", len(c.Subscriptions))
	}
	if c.ConnectedAt.IsZero() {
		t.Error("expected ConnectedAt to be set")
	}
}

func TestClient_Subscribe(t *testing.T) {
	c := NewClient("c1", "user1", 16)

	c.Subscribe("payment", "uetr-123")

	if !c.IsSubscribed("payment", "uetr-123") {
		t.Error("expected client to be subscribed to payment:uetr-123")
	}
	if c.IsSubscribed("payment", "other-uetr") {
		t.Error("should not be subscribed to payment:other-uetr")
	}
	if c.IsSubscribed("account", "uetr-123") {
		t.Error("should not be subscribed to account:uetr-123")
	}
}

func TestClient_Subscribe_Wildcard(t *testing.T) {
	c := NewClient("c1", "user1", 16)

	// Subscribe to "payment" with empty resource ID = wildcard (matches any resource for that type)
	c.Subscribe("payment", "")

	if !c.IsSubscribed("payment", "any-uetr") {
		t.Error("wildcard subscription should match any resource ID")
	}
	if !c.IsSubscribed("payment", "") {
		t.Error("wildcard subscription should match empty resource")
	}
	if c.IsSubscribed("account", "") {
		t.Error("should not match different type")
	}
}

func TestClient_Unsubscribe(t *testing.T) {
	c := NewClient("c1", "user1", 16)

	c.Subscribe("payment", "uetr-123")
	c.Unsubscribe("payment", "uetr-123")

	if c.IsSubscribed("payment", "uetr-123") {
		t.Error("should not be subscribed after unsubscribe")
	}
}

func TestClient_MultipleSubscriptions(t *testing.T) {
	c := NewClient("c1", "user1", 16)

	c.Subscribe("payment", "uetr-1")
	c.Subscribe("payment", "uetr-2")
	c.Subscribe("account", "acc-1")

	if !c.IsSubscribed("payment", "uetr-1") {
		t.Error("expected subscribed to payment:uetr-1")
	}
	if !c.IsSubscribed("payment", "uetr-2") {
		t.Error("expected subscribed to payment:uetr-2")
	}
	if !c.IsSubscribed("account", "acc-1") {
		t.Error("expected subscribed to account:acc-1")
	}
	if c.IsSubscribed("account", "acc-2") {
		t.Error("should not be subscribed to account:acc-2")
	}
}

// ============================================================================
// Hub Tests (using internal methods directly for determinism)
// ============================================================================

func TestHub_AddRemoveClient(t *testing.T) {
	h := newTestHub()
	c := NewClient("c1", "user1", 16)

	h.addClient(c)

	if h.ClientCount() != 1 {
		t.Errorf("expected 1 client, got %d", h.ClientCount())
	}
	if h.UserCount() != 1 {
		t.Errorf("expected 1 user, got %d", h.UserCount())
	}

	h.removeClient(c)

	if h.ClientCount() != 0 {
		t.Errorf("expected 0 clients after remove, got %d", h.ClientCount())
	}
	if h.UserCount() != 0 {
		t.Errorf("expected 0 users after remove, got %d", h.UserCount())
	}
}

func TestHub_MultipleClientsPerUser(t *testing.T) {
	h := newTestHub()
	c1 := NewClient("c1", "user1", 16)
	c2 := NewClient("c2", "user1", 16) // same user, different session

	h.addClient(c1)
	h.addClient(c2)

	if h.ClientCount() != 2 {
		t.Errorf("expected 2 clients, got %d", h.ClientCount())
	}
	if h.UserCount() != 1 {
		t.Errorf("expected 1 unique user, got %d", h.UserCount())
	}

	// Removing one client should NOT remove the user from userIndex
	h.removeClient(c1)
	if h.ClientCount() != 1 {
		t.Errorf("expected 1 client after remove, got %d", h.ClientCount())
	}
	if h.UserCount() != 1 {
		t.Errorf("expected 1 user still (second client active), got %d", h.UserCount())
	}

	h.removeClient(c2)
	if h.UserCount() != 0 {
		t.Errorf("expected 0 users after removing all clients, got %d", h.UserCount())
	}
}

func TestHub_RemoveNonexistentClient(t *testing.T) {
	h := newTestHub()
	c := NewClient("c1", "user1", 16)

	// Should not panic on removing a client that was never added
	h.removeClient(c)
	if h.ClientCount() != 0 {
		t.Errorf("expected 0 clients, got %d", h.ClientCount())
	}
}

func TestHub_BroadcastToSubscribed(t *testing.T) {
	h := newTestHub()

	c1 := NewClient("c1", "user1", 16)
	c1.Subscribe("payment.status_changed", "")

	c2 := NewClient("c2", "user2", 16)
	c2.Subscribe("account.balance_updated", "")

	h.addClient(c1)
	h.addClient(c2)

	msg := &Message{
		Type:      "payment.status_changed",
		Payload:   json.RawMessage(`{"uetr":"abc-123","status":"SETTLED"}`),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	h.broadcastMessage(msg)

	// c1 should receive (subscribed to payment.status_changed)
	select {
	case data := <-c1.Send:
		var received Message
		if err := json.Unmarshal(data, &received); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if received.Type != "payment.status_changed" {
			t.Errorf("expected type payment.status_changed, got %s", received.Type)
		}
	default:
		t.Error("c1 should have received the broadcast message")
	}

	// c2 should NOT receive (subscribed to different type)
	select {
	case <-c2.Send:
		t.Error("c2 should not have received the payment message")
	default:
		// expected
	}
}

func TestHub_BroadcastWithResourceFilter(t *testing.T) {
	h := newTestHub()

	c1 := NewClient("c1", "user1", 16)
	c1.Subscribe("payment.status_changed", "abc-123")

	c2 := NewClient("c2", "user2", 16)
	c2.Subscribe("payment.status_changed", "def-456")

	h.addClient(c1)
	h.addClient(c2)

	msg := &Message{
		Type:      "payment.status_changed",
		Payload:   json.RawMessage(`{"uetr":"abc-123","status":"SETTLED"}`),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	h.broadcastMessage(msg)

	select {
	case <-c1.Send:
		// expected — subscribed to uetr abc‑123
	default:
		t.Error("c1 should have received message for uetr abc-123")
	}

	select {
	case <-c2.Send:
		t.Error("c2 should not receive message for uetr abc-123")
	default:
		// expected
	}
}

func TestHub_BroadcastDropsOnFullBuffer(t *testing.T) {
	h := newTestHub()

	// Create client with buffer of 1
	c := NewClient("c1", "user1", 1)
	c.Subscribe("payment", "")
	h.addClient(c)

	// Fill the buffer
	msg1 := &Message{Type: "payment", Payload: json.RawMessage(`{"id":"1"}`), Timestamp: "t"}
	h.broadcastMessage(msg1)

	// Buffer is now full; next broadcast should be dropped (not block)
	msg2 := &Message{Type: "payment", Payload: json.RawMessage(`{"id":"2"}`), Timestamp: "t"}
	h.broadcastMessage(msg2)

	// Only the first message should be in the channel
	select {
	case <-c.Send:
		// consumed msg1
	default:
		t.Error("expected first message in buffer")
	}

	select {
	case <-c.Send:
		t.Error("expected second message to be dropped (buffer was full)")
	default:
		// expected
	}
}

// ============================================================================
// Hub Run() integration test
// ============================================================================

func TestHub_RunIntegration(t *testing.T) {
	h := newTestHub()
	go h.Run()

	c := NewClient("c1", "user1", 16)
	c.Subscribe("payment", "")

	h.Register(c)
	time.Sleep(10 * time.Millisecond) // let event loop process

	if h.ClientCount() != 1 {
		t.Errorf("expected 1 client after register, got %d", h.ClientCount())
	}

	msg := &Message{
		Type:      "payment",
		Payload:   json.RawMessage(`{"uetr":"test"}`),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	h.Broadcast(msg)
	time.Sleep(10 * time.Millisecond)

	select {
	case data := <-c.Send:
		var received Message
		if err := json.Unmarshal(data, &received); err != nil {
			t.Fatalf("failed to unmarshal: %v", err)
		}
		if received.Type != "payment" {
			t.Errorf("expected type payment, got %s", received.Type)
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("timed out waiting for broadcast message")
	}

	h.Unregister(c)
	time.Sleep(10 * time.Millisecond)

	if h.ClientCount() != 0 {
		t.Errorf("expected 0 clients after unregister, got %d", h.ClientCount())
	}
}

// ============================================================================
// extractRouting Tests
// ============================================================================

func TestExtractRouting_UETR(t *testing.T) {
	msg := &Message{
		Type:    "payment.status_changed",
		Payload: json.RawMessage(`{"uetr":"abc-123","status":"SETTLED"}`),
	}
	msgType, resourceID := extractRouting(msg)
	if msgType != "payment.status_changed" {
		t.Errorf("expected type payment.status_changed, got %s", msgType)
	}
	if resourceID != "abc-123" {
		t.Errorf("expected resourceID abc-123, got %s", resourceID)
	}
}

func TestExtractRouting_AccountID(t *testing.T) {
	msg := &Message{
		Type:    "account.balance_updated",
		Payload: json.RawMessage(`{"account_id":"acc-456","balance":"1000"}`),
	}
	_, resourceID := extractRouting(msg)
	if resourceID != "acc-456" {
		t.Errorf("expected resourceID acc-456, got %s", resourceID)
	}
}

func TestExtractRouting_NoPayload(t *testing.T) {
	msg := &Message{
		Type:    "system.ping",
		Payload: json.RawMessage(`{}`),
	}
	msgType, resourceID := extractRouting(msg)
	if msgType != "system.ping" {
		t.Errorf("expected type system.ping, got %s", msgType)
	}
	if resourceID != "" {
		t.Errorf("expected empty resourceID, got %s", resourceID)
	}
}

func TestExtractRouting_InvalidJSON(t *testing.T) {
	msg := &Message{
		Type:    "bad",
		Payload: json.RawMessage(`not-json`),
	}
	msgType, resourceID := extractRouting(msg)
	if msgType != "bad" {
		t.Errorf("expected type bad, got %s", msgType)
	}
	if resourceID != "" {
		t.Errorf("expected empty resourceID for bad JSON, got %s", resourceID)
	}
}
