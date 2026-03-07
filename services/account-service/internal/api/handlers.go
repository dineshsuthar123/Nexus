// Package api provides HTTP handlers for the Account Service
package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nexus-rtp/account-service/internal/service"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
)

// RegisterRoutes registers API routes
func RegisterRoutes(router *gin.Engine, accountService *service.AccountService, logger *zap.Logger) {
	handler := NewHandler(accountService, logger)

	v1 := router.Group("/api/v1")
	{
		accounts := v1.Group("/accounts")
		{
			accounts.POST("", handler.CreateAccount)
			accounts.GET("", handler.ListAccounts)
			accounts.GET("/:id", handler.GetAccount)
			accounts.GET("/:id/balance", handler.GetBalance)
			accounts.PATCH("/:id/status", handler.UpdateStatus)
			accounts.PATCH("/:id/kyc", handler.UpdateKYCStatus)
			accounts.GET("/:id/audit", handler.GetAuditLog)
		}

		customers := v1.Group("/customers")
		{
			customers.GET("/:customerId/accounts", handler.GetCustomerAccounts)
		}
	}
}

// Handler handles HTTP requests
type Handler struct {
	accountService *service.AccountService
	logger         *zap.Logger
}

// NewHandler creates a new handler
func NewHandler(accountService *service.AccountService, logger *zap.Logger) *Handler {
	return &Handler{
		accountService: accountService,
		logger:         logger,
	}
}

// ErrorResponse represents an error
type ErrorResponse struct {
	Code      string    `json:"code"`
	Message   string    `json:"message"`
	Details   string    `json:"details,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// FrontendCreateAccountRequest accepts both frontend and backend field names
type FrontendCreateAccountRequest struct {
	// Frontend fields
	Name string `json:"name,omitempty"`
	Type string `json:"type,omitempty"`

	// Backend fields (also accepted)
	CustomerID     string          `json:"customerId,omitempty"`
	ExternalID     string          `json:"externalId,omitempty"`
	AccountNumber  string          `json:"accountNumber,omitempty"`
	IBAN           string          `json:"iban,omitempty"`
	BIC            string          `json:"bic,omitempty"`
	Currency       string          `json:"currency"`
	AccountType    string          `json:"accountType,omitempty"`
	InitialBalance json.Number     `json:"initialBalance,omitempty"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
}

// CreateAccount handles POST /api/v1/accounts
func (h *Handler) CreateAccount(c *gin.Context) {
	var frontReq FrontendCreateAccountRequest
	if err := c.ShouldBindJSON(&frontReq); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_REQUEST",
			Message:   "Invalid request body",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	// Map "type" -> "accountType" (frontend sends "type")
	accountType := frontReq.AccountType
	if accountType == "" && frontReq.Type != "" {
		accountType = frontReq.Type
	}
	if accountType == "" {
		accountType = "OPERATING"
	}

	// Map account types from frontend values to DB enum values
	typeMapping := map[string]string{
		"CHECKING":   "OPERATING",
		"SAVINGS":    "OPERATING",
		"TREASURY":   "OPERATING",
		"SETTLEMENT": "OPERATING",
		"MERCHANT":   "OPERATING",
		"INTERNAL":   "OPERATING",
		// These map directly
		"OPERATING":   "OPERATING",
		"NOSTRO":      "NOSTRO",
		"VOSTRO":      "VOSTRO",
		"SUSPENSE":    "SUSPENSE",
		"FEE":         "FEE",
		"FX_POSITION": "FX_POSITION",
	}
	if mapped, ok := typeMapping[accountType]; ok {
		accountType = mapped
	}

	// Handle customerId - auto-generate UUID if "default" or empty
	customerID := frontReq.CustomerID
	if customerID == "" || customerID == "default" {
		customerID = "00000000-0000-0000-0000-000000000001"
	}

	parsedCustomerID, err := uuid.Parse(customerID)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_CUSTOMER_ID",
			Message:   "Invalid customer ID format",
			Details:   "Customer ID must be a valid UUID",
			Timestamp: time.Now(),
		})
		return
	}

	// Parse initialBalance
	var initialBalance decimal.Decimal
	if frontReq.InitialBalance != "" {
		initialBalance, err = decimal.NewFromString(string(frontReq.InitialBalance))
		if err != nil {
			initialBalance = decimal.Zero
		}
	}

	// Store name in metadata if provided
	metadata := frontReq.Metadata
	if frontReq.Name != "" && len(metadata) == 0 {
		metadata = json.RawMessage(`{"name":"` + frontReq.Name + `"}`)
	}

	// Build the internal request
	req := &service.CreateAccountRequest{
		CustomerID:     parsedCustomerID,
		ExternalID:     frontReq.ExternalID,
		AccountNumber:  frontReq.AccountNumber,
		IBAN:           frontReq.IBAN,
		BIC:            frontReq.BIC,
		Currency:       frontReq.Currency,
		AccountType:    accountType,
		InitialBalance: initialBalance,
		Metadata:       metadata,
	}

	actorID := c.GetHeader("X-Actor-ID")
	if actorID == "" {
		actorID = "anonymous"
	}

	response, err := h.accountService.CreateAccount(c.Request.Context(), req, actorID, c.ClientIP())
	if err != nil {
		h.logger.Error("Failed to create account", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "CREATE_ERROR",
			Message:   "Failed to create account",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusCreated, response)
}

// GetAccount handles GET /api/v1/accounts/:id
func (h *Handler) GetAccount(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_ID",
			Message:   "Account ID is required",
			Timestamp: time.Now(),
		})
		return
	}

	response, err := h.accountService.GetAccount(c.Request.Context(), accountID)
	if err != nil {
		if err.Error() == "account not found" {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Code:      "NOT_FOUND",
				Message:   "Account not found",
				Timestamp: time.Now(),
			})
			return
		}
		h.logger.Error("Failed to get account", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "GET_ERROR",
			Message:   "Failed to get account",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetBalance handles GET /api/v1/accounts/:id/balance
func (h *Handler) GetBalance(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_ID",
			Message:   "Account ID is required",
			Timestamp: time.Now(),
		})
		return
	}

	balance, err := h.accountService.GetBalance(c.Request.Context(), accountID)
	if err != nil {
		h.logger.Error("Failed to get balance", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "BALANCE_ERROR",
			Message:   "Failed to get balance",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, balance)
}

// ListAccounts handles GET /api/v1/accounts
func (h *Handler) ListAccounts(c *gin.Context) {
	// Support both page/pageSize (from frontend) and limit/offset (legacy)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "0"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	status := c.Query("status")

	// If page/pageSize provided, convert to limit/offset
	if page > 0 && pageSize > 0 {
		limit = pageSize
		offset = (page - 1) * pageSize
	} else if page == 0 {
		page = 1
	}

	if limit > 100 {
		limit = 100
	}
	if pageSize == 0 {
		pageSize = limit
	}

	accounts, total, err := h.accountService.ListAccounts(c.Request.Context(), limit, offset, status)
	if err != nil {
		h.logger.Error("Failed to list accounts", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "LIST_ERROR",
			Message:   "Failed to list accounts",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	totalPages := int(total) / pageSize
	if int(total)%pageSize > 0 {
		totalPages++
	}

	c.JSON(http.StatusOK, gin.H{
		"data": accounts,
		"pagination": gin.H{
			"page":        page,
			"pageSize":    pageSize,
			"totalItems":  total,
			"totalPages":  totalPages,
			"hasNext":     page < totalPages,
			"hasPrevious": page > 1,
		},
		// Also include legacy fields for backward compatibility
		"accounts": accounts,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// UpdateStatus handles PATCH /api/v1/accounts/:id/status
func (h *Handler) UpdateStatus(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_ID",
			Message:   "Account ID is required",
			Timestamp: time.Now(),
		})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_REQUEST",
			Message:   "Invalid request body",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	// Validate status
	validStatuses := map[string]bool{
		"ACTIVE": true, "SUSPENDED": true, "CLOSED": true, "FROZEN": true,
	}
	if !validStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_STATUS",
			Message:   "Invalid status value",
			Details:   "Status must be one of: ACTIVE, SUSPENDED, CLOSED, FROZEN",
			Timestamp: time.Now(),
		})
		return
	}

	actorID := c.GetHeader("X-Actor-ID")
	if actorID == "" {
		actorID = "anonymous"
	}

	if err := h.accountService.UpdateAccountStatus(c.Request.Context(), accountID, req.Status, actorID, c.ClientIP()); err != nil {
		h.logger.Error("Failed to update status", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "UPDATE_ERROR",
			Message:   "Failed to update status",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"accountId": accountID,
		"status":    req.Status,
		"updatedAt": time.Now(),
	})
}

// UpdateKYCStatus handles PATCH /api/v1/accounts/:id/kyc
func (h *Handler) UpdateKYCStatus(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_ID",
			Message:   "Account ID is required",
			Timestamp: time.Now(),
		})
		return
	}

	var req struct {
		KYCStatus string `json:"kycStatus" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_REQUEST",
			Message:   "Invalid request body",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	// Validate KYC status
	validStatuses := map[string]bool{
		"PENDING": true, "VERIFIED": true, "REJECTED": true, "EXPIRED": true,
	}
	if !validStatuses[req.KYCStatus] {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_KYC_STATUS",
			Message:   "Invalid KYC status value",
			Details:   "KYC status must be one of: PENDING, VERIFIED, REJECTED, EXPIRED",
			Timestamp: time.Now(),
		})
		return
	}

	actorID := c.GetHeader("X-Actor-ID")
	if actorID == "" {
		actorID = "anonymous"
	}

	if err := h.accountService.UpdateKYCStatus(c.Request.Context(), accountID, req.KYCStatus, actorID, c.ClientIP()); err != nil {
		h.logger.Error("Failed to update KYC status", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "UPDATE_ERROR",
			Message:   "Failed to update KYC status",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"accountId": accountID,
		"kycStatus": req.KYCStatus,
		"updatedAt": time.Now(),
	})
}

// GetCustomerAccounts handles GET /api/v1/customers/:customerId/accounts
func (h *Handler) GetCustomerAccounts(c *gin.Context) {
	customerID := c.Param("customerId")
	if customerID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_CUSTOMER_ID",
			Message:   "Customer ID is required",
			Timestamp: time.Now(),
		})
		return
	}

	accounts, err := h.accountService.GetAccountsByCustomer(c.Request.Context(), customerID)
	if err != nil {
		h.logger.Error("Failed to get customer accounts", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "GET_ERROR",
			Message:   "Failed to get customer accounts",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"customerId": customerID,
		"accounts":   accounts,
		"count":      len(accounts),
	})
}

// GetAuditLog handles GET /api/v1/accounts/:id/audit
func (h *Handler) GetAuditLog(c *gin.Context) {
	accountID := c.Param("id")
	if accountID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_ID",
			Message:   "Account ID is required",
			Timestamp: time.Now(),
		})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit > 100 {
		limit = 100
	}

	logs, err := h.accountService.GetAuditLog(c.Request.Context(), accountID, limit)
	if err != nil {
		h.logger.Error("Failed to get audit log", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "AUDIT_ERROR",
			Message:   "Failed to get audit log",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"accountId": accountID,
		"logs":      logs,
		"count":     len(logs),
	})
}
