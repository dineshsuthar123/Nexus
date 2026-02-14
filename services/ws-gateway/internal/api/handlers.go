package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/nexus-rtp/ws-gateway/internal/config"
	"github.com/nexus-rtp/ws-gateway/internal/hub"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

var (
	wsConnectionsActive = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "ws_connections_active",
		Help: "Number of active WebSocket connections",
	})
	wsMessagesReceived = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ws_messages_received_total",
		Help: "Total WebSocket messages received from clients",
	}, []string{"type"})
	wsMessagesSent = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ws_messages_sent_total",
		Help: "Total WebSocket messages sent to clients",
	}, []string{"type"})
	wsConnectionsTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "ws_connections_total",
		Help: "Total WebSocket connections made",
	})
)

func init() {
	prometheus.MustRegister(wsConnectionsActive, wsMessagesReceived, wsMessagesSent, wsConnectionsTotal)
}

// Handler manages WebSocket connections.
type Handler struct {
	hub      *hub.Hub
	cfg      *config.Config
	upgrader websocket.Upgrader
	logger   *zap.Logger
}

// NewHandler creates a new WebSocket handler.
func NewHandler(h *hub.Hub, cfg *config.Config, logger *zap.Logger) *Handler {
	return &Handler{
		hub: h,
		cfg: cfg,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  cfg.ReadBufferSize,
			WriteBufferSize: cfg.WriteBufferSize,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				for _, allowed := range cfg.AllowedOrigins {
					if origin == allowed {
						return true
					}
				}
				return false
			},
		},
		logger: logger,
	}
}

// RegisterRoutes registers HTTP and WebSocket routes.
func (h *Handler) RegisterRoutes(r *gin.Engine) {
	r.GET("/ws", h.HandleWebSocket)
	r.GET("/health", h.Health)
	r.GET("/ready", h.Ready)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))
	r.GET("/status", h.Status)
}

// HandleWebSocket upgrades HTTP to WebSocket and manages the connection.
func (h *Handler) HandleWebSocket(c *gin.Context) {
	// Authenticate via query param or Authorization header
	token := c.Query("token")
	if token == "" {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = authHeader[7:]
		}
	}

	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	userID, err := h.validateToken(token)
	if err != nil {
		h.logger.Warn("invalid token on ws connect", zap.Error(err))
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	// Upgrade to WebSocket
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Error("websocket upgrade failed", zap.Error(err))
		return
	}

	clientID := uuid.New().String()
	client := hub.NewClient(clientID, userID, 256)

	// Default subscriptions (subscribe to all events for this user)
	client.Subscribe("payment.status_changed", "")
	client.Subscribe("payment.created", "")
	client.Subscribe("account.balance_updated", "")
	client.Subscribe("reconciliation.updated", "")
	client.Subscribe("notification", "")
	client.Subscribe("fraud.alert", "")
	client.Subscribe("event.raw", "")

	h.hub.Register(client)
	wsConnectionsActive.Inc()
	wsConnectionsTotal.Inc()

	h.logger.Info("websocket client connected",
		zap.String("client_id", clientID),
		zap.String("user_id", userID),
		zap.String("remote_addr", c.ClientIP()),
	)

	// Start read and write pumps
	go h.writePump(conn, client)
	go h.readPump(conn, client)
}

// readPump reads messages from the WebSocket connection.
func (h *Handler) readPump(conn *websocket.Conn, client *hub.Client) {
	defer func() {
		h.hub.Unregister(client)
		conn.Close()
		wsConnectionsActive.Dec()
	}()

	conn.SetReadLimit(h.cfg.MaxMessageSize)
	conn.SetReadDeadline(time.Now().Add(time.Duration(h.cfg.PingInterval+h.cfg.PongTimeout) * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(time.Duration(h.cfg.PingInterval+h.cfg.PongTimeout) * time.Second))
		return nil
	})

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				h.logger.Warn("websocket read error",
					zap.String("client_id", client.ID),
					zap.Error(err),
				)
			}
			return
		}

		h.handleClientMessage(client, message)
	}
}

// writePump sends messages to the WebSocket connection.
func (h *Handler) writePump(conn *websocket.Conn, client *hub.Client) {
	ticker := time.NewTicker(time.Duration(h.cfg.PingInterval) * time.Second)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.Send:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				h.logger.Warn("websocket write error",
					zap.String("client_id", client.ID),
					zap.Error(err),
				)
				return
			}
			wsMessagesSent.WithLabelValues("data").Inc()

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleClientMessage processes incoming messages from clients.
func (h *Handler) handleClientMessage(client *hub.Client, data []byte) {
	var msg struct {
		Type       string `json:"type"`
		Channel    string `json:"channel,omitempty"`
		ResourceID string `json:"resourceId,omitempty"`
	}
	if err := json.Unmarshal(data, &msg); err != nil {
		h.logger.Warn("invalid client message", zap.String("client_id", client.ID))
		return
	}

	wsMessagesReceived.WithLabelValues(msg.Type).Inc()

	switch msg.Type {
	case "subscribe":
		client.Subscribe(msg.Channel, msg.ResourceID)
		h.logger.Debug("client subscribed",
			zap.String("client_id", client.ID),
			zap.String("channel", msg.Channel),
			zap.String("resource_id", msg.ResourceID),
		)
		h.sendAck(client, "subscribed", msg.Channel)

	case "unsubscribe":
		client.Unsubscribe(msg.Channel, msg.ResourceID)
		h.logger.Debug("client unsubscribed",
			zap.String("client_id", client.ID),
			zap.String("channel", msg.Channel),
		)
		h.sendAck(client, "unsubscribed", msg.Channel)

	case "ping":
		h.sendPong(client)

	default:
		h.logger.Debug("unknown client message type",
			zap.String("client_id", client.ID),
			zap.String("type", msg.Type),
		)
	}
}

func (h *Handler) sendAck(client *hub.Client, action, channel string) {
	ack := map[string]string{
		"type":    action,
		"channel": channel,
	}
	data, _ := json.Marshal(ack)
	select {
	case client.Send <- data:
	default:
	}
}

func (h *Handler) sendPong(client *hub.Client) {
	pong := map[string]string{
		"type":      "pong",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	data, _ := json.Marshal(pong)
	select {
	case client.Send <- data:
	default:
	}
}

func (h *Handler) validateToken(tokenString string) (string, error) {
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return h.cfg.JWTPublicKey, nil
	})
	if err != nil {
		return "", err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return "", fmt.Errorf("invalid token claims")
	}

	sub, err := claims.GetSubject()
	if err != nil || sub == "" {
		return "", fmt.Errorf("missing subject claim")
	}

	return sub, nil
}

// Health returns service health.
func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "ws-gateway",
	})
}

// Ready returns readiness status.
func (h *Handler) Ready(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ready",
		"service": "ws-gateway",
	})
}

// Status returns connection statistics.
func (h *Handler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"service":       "ws-gateway",
		"clients":       h.hub.ClientCount(),
		"unique_users":  h.hub.UserCount(),
	})
}
