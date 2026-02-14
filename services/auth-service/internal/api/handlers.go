package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nexus-rtp/auth-service/internal/auth"
	"github.com/nexus-rtp/auth-service/internal/service"
	"go.uber.org/zap"
)

// Handler holds API dependencies.
type Handler struct {
	authService  *service.AuthService
	tokenService *auth.TokenService
	logger       *zap.Logger
}

// NewHandler creates a new Handler.
func NewHandler(authService *service.AuthService, tokenService *auth.TokenService, logger *zap.Logger) *Handler {
	return &Handler{
		authService:  authService,
		tokenService: tokenService,
		logger:       logger,
	}
}

// RegisterRoutes sets up all auth API routes.
func RegisterRoutes(router *gin.Engine, authSvc *service.AuthService, tokenSvc *auth.TokenService, logger *zap.Logger) {
	h := NewHandler(authSvc, tokenSvc, logger)

	v1 := router.Group("/api/v1/auth")
	{
		// Public endpoints
		v1.POST("/register", h.Register)
		v1.POST("/login", h.Login)
		v1.POST("/refresh", h.RefreshToken)
		v1.POST("/request-password-reset", h.RequestPasswordReset)
		v1.POST("/reset-password", h.ResetPassword)
		v1.POST("/verify-email", h.VerifyEmail)
		v1.POST("/mfa/verify", h.VerifyMFA)

		// Protected endpoints (require JWT)
		protected := v1.Group("")
		protected.Use(h.AuthMiddleware())
		{
			protected.GET("/me", h.GetMe)
			protected.POST("/logout", h.Logout)
			protected.POST("/mfa/setup", h.SetupMFA)
			protected.POST("/mfa/confirm", h.ConfirmMFA)
			protected.POST("/mfa/disable", h.DisableMFA)
		}
	}
}

// --- Error Response ---

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

// --- Handlers ---

// Register handles POST /api/v1/auth/register
func (h *Handler) Register(c *gin.Context) {
	var req service.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	resp, err := h.authService.Register(c.Request.Context(), &req)
	if err != nil {
		switch err {
		case service.ErrEmailExists:
			c.JSON(http.StatusConflict, errorResponse("EMAIL_EXISTS", "Email already registered"))
		default:
			h.logger.Error("Registration failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Registration failed"))
		}
		return
	}

	c.JSON(http.StatusCreated, resp)
}

// Login handles POST /api/v1/auth/login
func (h *Handler) Login(c *gin.Context) {
	var req service.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	ip := c.ClientIP()
	ua := c.GetHeader("User-Agent")

	resp, err := h.authService.Login(c.Request.Context(), &req, ip, ua)
	if err != nil {
		switch err {
		case service.ErrInvalidCredentials:
			c.JSON(http.StatusUnauthorized, errorResponse("INVALID_CREDENTIALS", "Invalid email or password"))
		case service.ErrAccountSuspended:
			c.JSON(http.StatusForbidden, errorResponse("ACCOUNT_SUSPENDED", "Account is suspended"))
		case service.ErrEmailNotVerified:
			c.JSON(http.StatusForbidden, errorResponse("EMAIL_NOT_VERIFIED", "Email not verified"))
		default:
			h.logger.Error("Login failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Login failed"))
		}
		return
	}

	c.JSON(http.StatusOK, resp)
}

// VerifyMFA handles POST /api/v1/auth/mfa/verify
func (h *Handler) VerifyMFA(c *gin.Context) {
	var req service.MFAVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	ip := c.ClientIP()
	ua := c.GetHeader("User-Agent")

	resp, err := h.authService.VerifyMFA(c.Request.Context(), &req, ip, ua)
	if err != nil {
		switch err {
		case service.ErrInvalidMFACode:
			c.JSON(http.StatusUnauthorized, errorResponse("INVALID_MFA_CODE", "Invalid MFA code"))
		case service.ErrInvalidCredentials:
			c.JSON(http.StatusUnauthorized, errorResponse("INVALID_CREDENTIALS", "Invalid credentials"))
		default:
			h.logger.Error("MFA verification failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "MFA verification failed"))
		}
		return
	}

	c.JSON(http.StatusOK, resp)
}

// RefreshToken handles POST /api/v1/auth/refresh
func (h *Handler) RefreshToken(c *gin.Context) {
	var req service.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	tokens, err := h.authService.RefreshToken(c.Request.Context(), req.RefreshToken)
	if err != nil {
		switch err {
		case service.ErrInvalidToken:
			c.JSON(http.StatusUnauthorized, errorResponse("INVALID_TOKEN", "Invalid or expired refresh token"))
		case service.ErrTokenRevoked:
			c.JSON(http.StatusUnauthorized, errorResponse("TOKEN_REVOKED", "Refresh token has been revoked"))
		default:
			h.logger.Error("Token refresh failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Token refresh failed"))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"tokens": tokens})
}

// Logout handles POST /api/v1/auth/logout
func (h *Handler) Logout(c *gin.Context) {
	userID := getUserIDFromContext(c)
	ip := c.ClientIP()
	ua := c.GetHeader("User-Agent")

	if err := h.authService.Logout(c.Request.Context(), userID, ip, ua); err != nil {
		h.logger.Error("Logout failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Logout failed"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// GetMe handles GET /api/v1/auth/me
func (h *Handler) GetMe(c *gin.Context) {
	userID := getUserIDFromContext(c)

	user, err := h.authService.GetMe(c.Request.Context(), userID)
	if err != nil {
		h.logger.Error("GetMe failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to get user"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": user})
}

// RequestPasswordReset handles POST /api/v1/auth/request-password-reset
func (h *Handler) RequestPasswordReset(c *gin.Context) {
	var req service.PasswordResetRequestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	// Always return success (security best practice — don't reveal email existence)
	_ = h.authService.RequestPasswordReset(c.Request.Context(), &req)

	c.JSON(http.StatusOK, gin.H{"message": "If the email exists, a password reset link has been sent."})
}

// ResetPassword handles POST /api/v1/auth/reset-password
func (h *Handler) ResetPassword(c *gin.Context) {
	var req service.PasswordResetReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	if err := h.authService.ResetPassword(c.Request.Context(), &req); err != nil {
		switch err {
		case service.ErrInvalidToken:
			c.JSON(http.StatusBadRequest, errorResponse("INVALID_TOKEN", "Invalid or expired reset token"))
		default:
			h.logger.Error("Password reset failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Password reset failed"))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password has been reset successfully."})
}

// VerifyEmail handles POST /api/v1/auth/verify-email
func (h *Handler) VerifyEmail(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	if err := h.authService.VerifyEmail(c.Request.Context(), req.Token); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_TOKEN", "Invalid verification token"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Email verified successfully."})
}

// SetupMFA handles POST /api/v1/auth/mfa/setup
func (h *Handler) SetupMFA(c *gin.Context) {
	userID := getUserIDFromContext(c)

	resp, err := h.authService.SetupMFA(c.Request.Context(), userID)
	if err != nil {
		switch err {
		case service.ErrMFAAlreadyEnabled:
			c.JSON(http.StatusConflict, errorResponse("MFA_ALREADY_ENABLED", "MFA is already enabled"))
		default:
			h.logger.Error("MFA setup failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "MFA setup failed"))
		}
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ConfirmMFA handles POST /api/v1/auth/mfa/confirm
func (h *Handler) ConfirmMFA(c *gin.Context) {
	userID := getUserIDFromContext(c)

	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("INVALID_REQUEST", "Invalid request body", err.Error()))
		return
	}

	if err := h.authService.ConfirmMFA(c.Request.Context(), userID, req.Code); err != nil {
		switch err {
		case service.ErrInvalidMFACode:
			c.JSON(http.StatusUnauthorized, errorResponse("INVALID_MFA_CODE", "Invalid MFA code"))
		default:
			h.logger.Error("MFA confirm failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "MFA confirmation failed"))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "MFA enabled successfully."})
}

// DisableMFA handles POST /api/v1/auth/mfa/disable
func (h *Handler) DisableMFA(c *gin.Context) {
	userID := getUserIDFromContext(c)

	if err := h.authService.DisableMFA(c.Request.Context(), userID); err != nil {
		h.logger.Error("MFA disable failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, errorResponse("INTERNAL_ERROR", "Failed to disable MFA"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "MFA disabled successfully."})
}

// --- Auth Middleware ---

// AuthMiddleware validates JWT from the Authorization header.
func (h *Handler) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "Missing authorization header"))
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "Invalid authorization header format"))
			return
		}

		claims, err := h.tokenService.ValidateAccessToken(parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "Invalid or expired token"))
			return
		}

		userID, err := uuid.Parse(claims.UID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, errorResponse("UNAUTHORIZED", "Invalid token claims"))
			return
		}

		c.Set("userID", userID)
		c.Set("email", claims.Email)
		c.Set("roles", claims.Roles)
		c.Next()
	}
}

func getUserIDFromContext(c *gin.Context) uuid.UUID {
	val, exists := c.Get("userID")
	if !exists {
		return uuid.Nil
	}
	return val.(uuid.UUID)
}
