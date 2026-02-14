package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nexus-rtp/auth-service/internal/service"
	"go.uber.org/zap"
)

// RegisterUserRoutes sets up all user/settings API routes (protected by JWT).
func RegisterUserRoutes(router *gin.Engine, h *Handler) {
	v1 := router.Group("/api/v1/users")
	v1.Use(h.AuthMiddleware())
	{
		v1.GET("/profile", h.GetProfile)
		v1.PUT("/profile", h.UpdateProfile)
		v1.POST("/password", h.ChangePassword)
		v1.GET("/api-keys", h.ListAPIKeys)
		v1.POST("/api-keys", h.CreateAPIKey)
		v1.DELETE("/api-keys/:id", h.RevokeAPIKey)
	}
}

// GetProfile handles GET /api/v1/users/profile
func (h *Handler) GetProfile(c *gin.Context) {
	userID := getUserIDFromContext(c)
	if userID == uuid.Nil {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	profile, err := h.authService.GetProfile(c.Request.Context(), userID)
	if err != nil {
		h.logger.Error("GetProfile failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to get profile"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": profile})
}

// UpdateProfile handles PUT /api/v1/users/profile
func (h *Handler) UpdateProfile(c *gin.Context) {
	userID := getUserIDFromContext(c)
	if userID == uuid.Nil {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	var req service.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	profile, err := h.authService.UpdateProfile(c.Request.Context(), userID, &req)
	if err != nil {
		h.logger.Error("UpdateProfile failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to update profile"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": profile})
}

// ChangePassword handles POST /api/v1/users/password
func (h *Handler) ChangePassword(c *gin.Context) {
	userID := getUserIDFromContext(c)
	if userID == uuid.Nil {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	var req service.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	err := h.authService.ChangePassword(c.Request.Context(), userID, &req)
	if err != nil {
		switch err {
		case service.ErrWrongPassword:
			c.JSON(http.StatusBadRequest, errorResponse("WRONG_PASSWORD", "Current password is incorrect"))
		default:
			h.logger.Error("ChangePassword failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to change password"))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

// ListAPIKeys handles GET /api/v1/users/api-keys
func (h *Handler) ListAPIKeys(c *gin.Context) {
	userID := getUserIDFromContext(c)
	if userID == uuid.Nil {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	keys, err := h.authService.ListAPIKeys(c.Request.Context(), userID)
	if err != nil {
		h.logger.Error("ListAPIKeys failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to list API keys"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"apiKeys": keys})
}

// CreateAPIKey handles POST /api/v1/users/api-keys
func (h *Handler) CreateAPIKey(c *gin.Context) {
	userID := getUserIDFromContext(c)
	if userID == uuid.Nil {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	var req service.CreateAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	resp, err := h.authService.CreateAPIKey(c.Request.Context(), userID, &req)
	if err != nil {
		h.logger.Error("CreateAPIKey failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to create API key"))
		return
	}

	c.JSON(http.StatusCreated, resp)
}

// RevokeAPIKey handles DELETE /api/v1/users/api-keys/:id
func (h *Handler) RevokeAPIKey(c *gin.Context) {
	userID := getUserIDFromContext(c)
	if userID == uuid.Nil {
		c.JSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "User ID required"))
		return
	}

	keyID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid API key ID"))
		return
	}

	err = h.authService.RevokeAPIKey(c.Request.Context(), userID, keyID)
	if err != nil {
		switch err {
		case service.ErrAPIKeyNotFound:
			c.JSON(http.StatusNotFound, errorResponse("NOT_FOUND", "API key not found"))
		default:
			h.logger.Error("RevokeAPIKey failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to revoke API key"))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "API key revoked"})
}
