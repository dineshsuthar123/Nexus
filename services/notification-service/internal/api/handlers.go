package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/nexus-rtp/notification-service/internal/service"
)

// Handler holds API dependencies.
type Handler struct {
	svc    *service.NotificationService
	logger *zap.Logger
}

// NewHandler creates a new Handler.
func NewHandler(svc *service.NotificationService, logger *zap.Logger) *Handler {
	return &Handler{svc: svc, logger: logger}
}

// ErrorResponse is the standard error format.
type ErrorResponse struct {
	Code      string    `json:"code"`
	Message   string    `json:"message"`
	Details   string    `json:"details,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

func errorResponse(code, message string, details ...string) ErrorResponse {
	resp := ErrorResponse{
		Code:      code,
		Message:   message,
		Timestamp: time.Now().UTC(),
	}
	if len(details) > 0 {
		resp.Details = details[0]
	}
	return resp
}

// RegisterRoutes sets up all notification API routes.
func RegisterRoutes(router *gin.Engine, svc *service.NotificationService, logger *zap.Logger) {
	h := NewHandler(svc, logger)

	v1 := router.Group("/api/v1/notifications")
	{
		v1.GET("", h.ListNotifications)
		v1.POST("", h.CreateNotification)
		v1.PATCH("/:id/read", h.MarkRead)
		v1.PATCH("/read-all", h.MarkAllRead)
		v1.GET("/preferences", h.GetPreferences)
		v1.PUT("/preferences", h.UpdatePreferences)
	}
}

// getUserID extracts user ID from X-User-ID header (set by Kong/auth middleware).
func getUserID(c *gin.Context) string {
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		// Fallback: query param for dev/testing
		userID = c.Query("userId")
	}
	return userID
}

// ListNotifications handles GET /api/v1/notifications
func (h *Handler) ListNotifications(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	var readFilter *bool
	if readStr := c.Query("read"); readStr != "" {
		r := readStr == "true"
		readFilter = &r
	}

	var notifType *string
	if t := c.Query("type"); t != "" {
		notifType = &t
	}

	result, err := h.svc.List(c.Request.Context(), userID, readFilter, notifType, page, pageSize)
	if err != nil {
		h.logger.Error("Failed to list notifications", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to list notifications"))
		return
	}

	c.JSON(http.StatusOK, result)
}

// CreateNotification handles POST /api/v1/notifications
func (h *Handler) CreateNotification(c *gin.Context) {
	var req service.CreateNotificationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	// Allow overriding userID from header for internal callers
	if headerUserID := getUserID(c); headerUserID != "" && req.UserID == "" {
		req.UserID = headerUserID
	}

	n, err := h.svc.Create(c.Request.Context(), &req)
	if err != nil {
		switch err {
		case service.ErrInvalidRequest:
			c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", err.Error()))
		default:
			h.logger.Error("Failed to create notification", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to create notification"))
		}
		return
	}

	c.JSON(http.StatusCreated, n)
}

// MarkRead handles PATCH /api/v1/notifications/:id/read
func (h *Handler) MarkRead(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Notification ID required"))
		return
	}

	err := h.svc.MarkRead(c.Request.Context(), id, userID)
	if err != nil {
		switch err {
		case service.ErrNotificationNotFound:
			c.JSON(http.StatusNotFound, errorResponse("NOT_FOUND", "Notification not found"))
		case service.ErrUnauthorized:
			c.JSON(http.StatusForbidden, errorResponse("FORBIDDEN", "You don't own this notification"))
		default:
			h.logger.Error("Failed to mark notification read", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to mark notification read"))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification marked as read"})
}

// MarkAllRead handles PATCH /api/v1/notifications/read-all
func (h *Handler) MarkAllRead(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	count, err := h.svc.MarkAllRead(c.Request.Context(), userID)
	if err != nil {
		h.logger.Error("Failed to mark all read", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to mark all read"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "All notifications marked as read",
		"updatedCount": count,
	})
}

// GetPreferences handles GET /api/v1/notifications/preferences
func (h *Handler) GetPreferences(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	prefs, err := h.svc.GetPreferences(c.Request.Context(), userID)
	if err != nil {
		h.logger.Error("Failed to get preferences", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to get preferences"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"preferences": prefs})
}

// UpdatePreferences handles PUT /api/v1/notifications/preferences
func (h *Handler) UpdatePreferences(c *gin.Context) {
	userID := getUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	var body struct {
		Preferences []service.UpdatePreferenceRequest `json:"preferences" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	prefs, err := h.svc.UpdatePreferences(c.Request.Context(), userID, body.Preferences)
	if err != nil {
		h.logger.Error("Failed to update preferences", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to update preferences"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"preferences": prefs})
}
