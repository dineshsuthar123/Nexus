// Package api provides HTTP API handlers for the Payment Service
package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nexus-rtp/payment-service/internal/service"
	"go.uber.org/zap"
)

// RegisterRoutes registers all API routes
func RegisterRoutes(router *gin.Engine, paymentService *service.PaymentService, logger *zap.Logger) {
	handler := NewHandler(paymentService, logger)

	// API v1
	v1 := router.Group("/api/v1")
	{
		// Payments
		payments := v1.Group("/payments")
		{
			payments.POST("", handler.CreatePayment)
			payments.GET("/:uetr", handler.GetPaymentStatus)
			payments.GET("/:uetr/status", handler.GetPaymentStatus) // Alias for ISO 20022 style
			payments.POST("/:uetr/settle", handler.SettlePayment)
			payments.POST("/:uetr/return", handler.ReturnPayment)
		}

		// ISO 20022 Message Endpoints
		messages := v1.Group("/messages")
		{
			messages.POST("/pacs.008", handler.CreatePaymentFromPacs008)
			messages.POST("/pacs.004", handler.ProcessPaymentReturn)
		}
	}
}

// Handler handles HTTP requests
type Handler struct {
	paymentService *service.PaymentService
	logger         *zap.Logger
}

// NewHandler creates a new API handler
func NewHandler(paymentService *service.PaymentService, logger *zap.Logger) *Handler {
	return &Handler{
		paymentService: paymentService,
		logger:         logger,
	}
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Code       string    `json:"code"`
	Message    string    `json:"message"`
	Details    string    `json:"details,omitempty"`
	TraceID    string    `json:"traceId,omitempty"`
	Timestamp  time.Time `json:"timestamp"`
}

// CreatePayment handles POST /api/v1/payments
// @Summary Create a new payment
// @Description Initiates a new credit transfer payment (pacs.008)
// @Tags payments
// @Accept json
// @Produce json
// @Param payment body service.CreatePaymentRequest true "Payment request"
// @Success 201 {object} service.CreatePaymentResponse
// @Failure 400 {object} ErrorResponse
// @Failure 422 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/payments [post]
func (h *Handler) CreatePayment(c *gin.Context) {
	var req service.CreatePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Warn("Invalid request body", zap.Error(err))
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_REQUEST",
			Message:   "Invalid request body",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	// Validate UETR
	if req.UETR == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_UETR",
			Message:   "UETR is required",
			Details:   "The Unique End-to-End Transaction Reference (UETR) must be provided",
			Timestamp: time.Now(),
		})
		return
	}

	// Process payment
	response, err := h.paymentService.CreatePayment(c.Request.Context(), &req)
	if err != nil {
		h.logger.Error("Failed to create payment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "PROCESSING_ERROR",
			Message:   "Failed to process payment",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	// Return appropriate status based on payment status
	statusCode := http.StatusCreated
	if response.Status == "REJECTED" {
		statusCode = http.StatusUnprocessableEntity
	}

	c.JSON(statusCode, response)
}

// GetPaymentStatus handles GET /api/v1/payments/:uetr
// @Summary Get payment status
// @Description Retrieves the current status of a payment by UETR
// @Tags payments
// @Produce json
// @Param uetr path string true "UETR (UUID)"
// @Success 200 {object} service.PaymentStatusResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/payments/{uetr} [get]
func (h *Handler) GetPaymentStatus(c *gin.Context) {
	uetr := c.Param("uetr")
	if uetr == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_UETR",
			Message:   "UETR is required",
			Timestamp: time.Now(),
		})
		return
	}

	response, err := h.paymentService.GetPaymentStatus(c.Request.Context(), uetr)
	if err != nil {
		if err.Error() == "transaction not found" {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Code:      "NOT_FOUND",
				Message:   "Payment not found",
				Details:   "No payment found with the specified UETR",
				Timestamp: time.Now(),
			})
			return
		}

		h.logger.Error("Failed to get payment status", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "PROCESSING_ERROR",
			Message:   "Failed to retrieve payment status",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, response)
}

// SettlePayment handles POST /api/v1/payments/:uetr/settle
// @Summary Settle a payment
// @Description Settles a pending/cleared payment
// @Tags payments
// @Produce json
// @Param uetr path string true "UETR (UUID)"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/payments/{uetr}/settle [post]
func (h *Handler) SettlePayment(c *gin.Context) {
	uetr := c.Param("uetr")
	if uetr == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_UETR",
			Message:   "UETR is required",
			Timestamp: time.Now(),
		})
		return
	}

	err := h.paymentService.SettlePayment(c.Request.Context(), uetr)
	if err != nil {
		h.logger.Error("Failed to settle payment", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "SETTLEMENT_ERROR",
			Message:   "Failed to settle payment",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"uetr":      uetr,
		"status":    "SETTLED",
		"settledAt": time.Now(),
	})
}

// ReturnPayment handles POST /api/v1/payments/:uetr/return
// @Summary Return a payment
// @Description Initiates a payment return (pacs.004)
// @Tags payments
// @Accept json
// @Produce json
// @Param uetr path string true "UETR (UUID)"
// @Param return body ReturnPaymentRequest true "Return request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/payments/{uetr}/return [post]
func (h *Handler) ReturnPayment(c *gin.Context) {
	uetr := c.Param("uetr")
	if uetr == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_UETR",
			Message:   "UETR is required",
			Timestamp: time.Now(),
		})
		return
	}

	var req ReturnPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_REQUEST",
			Message:   "Invalid request body",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	// TODO: Implement payment return logic
	c.JSON(http.StatusOK, gin.H{
		"uetr":         uetr,
		"returnId":     "RTN-" + uetr[:8],
		"status":       "RETURN_INITIATED",
		"reasonCode":   req.ReasonCode,
		"initiatedAt":  time.Now(),
	})
}

// ReturnPaymentRequest represents a payment return request
type ReturnPaymentRequest struct {
	ReasonCode     string `json:"reasonCode" binding:"required"`
	ReasonText     string `json:"reasonText,omitempty"`
	ReturnAmount   string `json:"returnAmount,omitempty"` // Optional partial return
}

// CreatePaymentFromPacs008 handles POST /api/v1/messages/pacs.008
// @Summary Process pacs.008 message
// @Description Processes an ISO 20022 pacs.008 FI-to-FI Customer Credit Transfer
// @Tags messages
// @Accept json
// @Produce json
// @Param message body Pacs008Request true "pacs.008 message"
// @Success 201 {object} service.CreatePaymentResponse
// @Failure 400 {object} ErrorResponse
// @Failure 422 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/messages/pacs.008 [post]
func (h *Handler) CreatePaymentFromPacs008(c *gin.Context) {
	var req Pacs008Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_MESSAGE",
			Message:   "Invalid pacs.008 message",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	// Transform pacs.008 to internal format
	// TODO: Implement full pacs.008 parsing and validation

	c.JSON(http.StatusNotImplemented, ErrorResponse{
		Code:      "NOT_IMPLEMENTED",
		Message:   "pacs.008 endpoint not yet implemented",
		Timestamp: time.Now(),
	})
}

// ProcessPaymentReturn handles POST /api/v1/messages/pacs.004
// @Summary Process pacs.004 message
// @Description Processes an ISO 20022 pacs.004 Payment Return
// @Tags messages
// @Accept json
// @Produce json
// @Param message body Pacs004Request true "pacs.004 message"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/messages/pacs.004 [post]
func (h *Handler) ProcessPaymentReturn(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, ErrorResponse{
		Code:      "NOT_IMPLEMENTED",
		Message:   "pacs.004 endpoint not yet implemented",
		Timestamp: time.Now(),
	})
}

// Pacs008Request represents a pacs.008 message request
type Pacs008Request struct {
	GroupHeader     GroupHeader      `json:"grpHdr"`
	CreditTransfers []CreditTransfer `json:"cdtTrfTxInf"`
}

// GroupHeader represents the group header of ISO 20022 messages
type GroupHeader struct {
	MessageID            string `json:"msgId"`
	CreationDateTime     string `json:"creDtTm"`
	NumberOfTransactions int    `json:"nbOfTxs"`
	SettlementInfo       struct {
		SettlementMethod string `json:"sttlmMtd"`
	} `json:"sttlmInf"`
}

// CreditTransfer represents a credit transfer transaction
type CreditTransfer struct {
	PaymentID struct {
		InstructionID string `json:"instrId,omitempty"`
		EndToEndID    string `json:"endToEndId"`
		UETR          string `json:"uetr"`
	} `json:"pmtId"`
	Amount struct {
		Value    string `json:"value"`
		Currency string `json:"ccy"`
	} `json:"intrBkSttlmAmt"`
	Debtor struct {
		Name string `json:"nm"`
	} `json:"dbtr"`
	Creditor struct {
		Name string `json:"nm"`
	} `json:"cdtr"`
}

// Pacs004Request represents a pacs.004 message request
type Pacs004Request struct {
	GroupHeader struct {
		MessageID        string `json:"msgId"`
		CreationDateTime string `json:"creDtTm"`
	} `json:"grpHdr"`
	TransactionInfo []struct {
		ReturnID     string `json:"rtrId"`
		OriginalUETR string `json:"orgnlUETR"`
		ReturnReason struct {
			Code string `json:"cd"`
		} `json:"rtrRsnInf"`
	} `json:"txInf"`
}
