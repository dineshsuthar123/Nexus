// Package api provides HTTP API handlers for the Payment Service
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nexus-rtp/payment-service/internal/db"
	"github.com/nexus-rtp/payment-service/internal/service"
	"github.com/shopspring/decimal"
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
			payments.GET("", handler.ListPayments)
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
	Code      string    `json:"code"`
	Message   string    `json:"message"`
	Details   string    `json:"details,omitempty"`
	TraceID   string    `json:"traceId,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// handleServiceError maps well-known service-layer errors to structured HTTP
// responses with the correct status code. Unknown errors become 500.
func (h *Handler) handleServiceError(c *gin.Context, operation string, err error) {
	switch {
	case errors.Is(err, db.ErrNotFound):
		c.JSON(http.StatusNotFound, ErrorResponse{
			Code:      "NOT_FOUND",
			Message:   "Payment not found",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
	case errors.Is(err, db.ErrInvalidTransition):
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{
			Code:      "INVALID_STATE_TRANSITION",
			Message:   "Payment is not in a valid state for this operation",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
	case errors.Is(err, db.ErrInsufficientFunds):
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{
			Code:      "INSUFFICIENT_FUNDS",
			Message:   "Account has insufficient funds for this operation",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
	case errors.Is(err, db.ErrAccountInactive):
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{
			Code:      "ACCOUNT_INACTIVE",
			Message:   "One or more accounts are not active",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
	case errors.Is(err, db.ErrCurrencyMismatch):
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{
			Code:      "CURRENCY_MISMATCH",
			Message:   "Payment currency does not match account currency",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
	case errors.Is(err, db.ErrTransactionLimitExceeded):
		c.JSON(http.StatusUnprocessableEntity, ErrorResponse{
			Code:      "TRANSACTION_LIMIT_EXCEEDED",
			Message:   "Amount exceeds the account transaction limit",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
	default:
		h.logger.Error(operation+" failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "INTERNAL_ERROR",
			Message:   "An unexpected error occurred. Please try again later.",
			Timestamp: time.Now(),
		})
	}
}

// ListPayments handles GET /api/v1/payments
func (h *Handler) ListPayments(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	result, err := h.paymentService.ListPayments(c.Request.Context(), page, pageSize)
	if err != nil {
		h.logger.Error("Failed to list payments", zap.Error(err))
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Code:      "LIST_FAILED",
			Message:   "Failed to list payments",
			Timestamp: time.Now(),
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

// FrontendPaymentRequest accepts the simplified frontend format
type FrontendPaymentRequest struct {
	// Frontend fields
	Amount          json.Number `json:"amount"`
	Currency        string      `json:"currency"`
	DebtorName      string      `json:"debtorName"`
	DebtorAccount   string      `json:"debtorAccount,omitempty"` // IBAN
	DebtorBic       string      `json:"debtorBic,omitempty"`     // BIC
	CreditorName    string      `json:"creditorName"`
	CreditorAccount string      `json:"creditorAccount,omitempty"` // IBAN
	CreditorBic     string      `json:"creditorBic,omitempty"`     // BIC
	Type            string      `json:"type,omitempty"`            // INSTANT, STANDARD, SCHEDULED
	RemittanceInfo  string      `json:"remittanceInfo,omitempty"`
	EndToEndId      string      `json:"endToEndId,omitempty"`
	ScheduledDate   string      `json:"scheduledDate,omitempty"`
	Priority        string      `json:"priority,omitempty"`
	IdempotencyKey  string      `json:"idempotencyKey,omitempty"`

	// ISO 20022 fields (if provided directly, use them)
	MessageID         string `json:"messageId,omitempty"`
	UETR              string `json:"uetr,omitempty"`
	DebtorAccountId   string `json:"debtorAccountId,omitempty"`
	CreditorAccountId string `json:"creditorAccountId,omitempty"`
}

// CreatePayment handles POST /api/v1/payments
// @Summary Create a new payment
// @Description Initiates a new credit transfer payment (pacs.008)
// @Tags payments
// @Accept json
// @Produce json
// @Param payment body FrontendPaymentRequest true "Payment request"
// @Success 201 {object} service.CreatePaymentResponse
// @Failure 400 {object} ErrorResponse
// @Failure 422 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /api/v1/payments [post]
func (h *Handler) CreatePayment(c *gin.Context) {
	var frontReq FrontendPaymentRequest
	if err := c.ShouldBindJSON(&frontReq); err != nil {
		h.logger.Warn("Invalid request body", zap.Error(err))
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_REQUEST",
			Message:   "Invalid request body",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	// Parse amount
	amount, err := decimal.NewFromString(string(frontReq.Amount))
	if err != nil || amount.LessThanOrEqual(decimal.Zero) {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_AMOUNT",
			Message:   "Amount must be a positive number",
			Timestamp: time.Now(),
		})
		return
	}

	// Validate currency
	if len(frontReq.Currency) != 3 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_CURRENCY",
			Message:   "Currency must be a 3-letter ISO code",
			Timestamp: time.Now(),
		})
		return
	}

	// Validate names
	if frontReq.DebtorName == "" || frontReq.CreditorName == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_NAMES",
			Message:   "Debtor and creditor names are required",
			Timestamp: time.Now(),
		})
		return
	}

	// Auto-generate ISO 20022 fields if not provided
	uetr := frontReq.UETR
	if uetr == "" {
		uetr = uuid.New().String()
	}

	messageId := frontReq.MessageID
	if messageId == "" {
		messageId = fmt.Sprintf("MSG-%s", uuid.New().String()[:8])
	}

	endToEndId := frontReq.EndToEndId
	if endToEndId == "" {
		endToEndId = fmt.Sprintf("E2E-%s", uuid.New().String()[:12])
	}

	// Resolve account IDs - use provided UUIDs or look up by IBAN
	debtorAccountID := frontReq.DebtorAccountId
	creditorAccountID := frontReq.CreditorAccountId

	if debtorAccountID == "" && frontReq.DebtorAccount != "" {
		// Look up by IBAN
		acct, lookupErr := h.paymentService.LookupAccountByIBAN(c.Request.Context(), frontReq.DebtorAccount)
		if lookupErr != nil {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Code:      "DEBTOR_NOT_FOUND",
				Message:   "Debtor account not found for the provided IBAN",
				Details:   fmt.Sprintf("IBAN: %s", frontReq.DebtorAccount),
				Timestamp: time.Now(),
			})
			return
		}
		debtorAccountID = acct
	}

	if creditorAccountID == "" && frontReq.CreditorAccount != "" {
		// Look up by IBAN
		acct, lookupErr := h.paymentService.LookupAccountByIBAN(c.Request.Context(), frontReq.CreditorAccount)
		if lookupErr != nil {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Code:      "CREDITOR_NOT_FOUND",
				Message:   "Creditor account not found for the provided IBAN",
				Details:   fmt.Sprintf("IBAN: %s", frontReq.CreditorAccount),
				Timestamp: time.Now(),
			})
			return
		}
		creditorAccountID = acct
	}

	if debtorAccountID == "" || creditorAccountID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_ACCOUNTS",
			Message:   "Debtor and creditor account IDs or IBANs are required",
			Timestamp: time.Now(),
		})
		return
	}

	// Build remittance info as JSON
	var remittanceJSON json.RawMessage
	if frontReq.RemittanceInfo != "" {
		remittanceJSON = json.RawMessage(`{"unstructured":"` + frontReq.RemittanceInfo + `"}`)
	}

	// Build the internal ISO 20022 request
	req := &service.CreatePaymentRequest{
		MessageID:         messageId,
		CreationDateTime:  time.Now(),
		EndToEndID:        endToEndId,
		UETR:              uetr,
		Amount:            amount,
		Currency:          frontReq.Currency,
		DebtorAccountID:   debtorAccountID,
		CreditorAccountID: creditorAccountID,
		DebtorName:        frontReq.DebtorName,
		CreditorName:      frontReq.CreditorName,
		RemittanceInfo:    remittanceJSON,
	}

	// Process payment
	response, err := h.paymentService.CreatePayment(c.Request.Context(), req)
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
		h.logger.Error("Failed to settle payment", zap.String("uetr", uetr), zap.Error(err))
		h.handleServiceError(c, "SettlePayment", err)
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

	result, err := h.paymentService.ReturnPayment(c.Request.Context(), uetr, req.ReasonCode)
	if err != nil {
		h.logger.Error("Failed to return payment", zap.String("uetr", uetr), zap.Error(err))
		h.handleServiceError(c, "ReturnPayment", err)
		return
	}

	c.JSON(http.StatusOK, result)
}

// ReturnPaymentRequest represents a payment return request
type ReturnPaymentRequest struct {
	ReasonCode   string `json:"reasonCode" binding:"required"`
	ReasonText   string `json:"reasonText,omitempty"`
	ReturnAmount string `json:"returnAmount,omitempty"` // Optional partial return
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

	// Validate group header
	if req.GroupHeader.MessageID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "MISSING_MSG_ID",
			Message:   "grpHdr.msgId is required",
			Timestamp: time.Now(),
		})
		return
	}

	if len(req.CreditTransfers) == 0 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "NO_TRANSACTIONS",
			Message:   "At least one credit transfer is required in cdtTrfTxInf",
			Timestamp: time.Now(),
		})
		return
	}

	// Process each credit transfer in the batch
	var results []interface{}
	for i, ct := range req.CreditTransfers {
		// Parse amount
		amount, err := decimal.NewFromString(ct.Amount.Value)
		if err != nil || amount.LessThanOrEqual(decimal.Zero) {
			results = append(results, ErrorResponse{
				Code:      "INVALID_AMOUNT",
				Message:   fmt.Sprintf("Invalid amount in transfer %d", i),
				Timestamp: time.Now(),
			})
			continue
		}

		// Validate currency
		if len(ct.Amount.Currency) != 3 {
			results = append(results, ErrorResponse{
				Code:      "INVALID_CURRENCY",
				Message:   fmt.Sprintf("Invalid currency in transfer %d", i),
				Timestamp: time.Now(),
			})
			continue
		}

		// Generate UETR if not provided
		uetr := ct.PaymentID.UETR
		if uetr == "" {
			uetr = uuid.New().String()
		}

		endToEndId := ct.PaymentID.EndToEndID
		if endToEndId == "" {
			endToEndId = fmt.Sprintf("E2E-%s", uuid.New().String()[:12])
		}

		// Resolve debtor/creditor accounts by IBAN if provided
		debtorAccountID := ct.DebtorAccount.ID
		creditorAccountID := ct.CreditorAccount.ID

		if debtorAccountID == "" && ct.DebtorAccount.IBAN != "" {
			acct, lookupErr := h.paymentService.LookupAccountByIBAN(c.Request.Context(), ct.DebtorAccount.IBAN)
			if lookupErr != nil {
				results = append(results, ErrorResponse{
					Code:      "DEBTOR_NOT_FOUND",
					Message:   fmt.Sprintf("Debtor account not found for transfer %d", i),
					Timestamp: time.Now(),
				})
				continue
			}
			debtorAccountID = acct
		}

		if creditorAccountID == "" && ct.CreditorAccount.IBAN != "" {
			acct, lookupErr := h.paymentService.LookupAccountByIBAN(c.Request.Context(), ct.CreditorAccount.IBAN)
			if lookupErr != nil {
				results = append(results, ErrorResponse{
					Code:      "CREDITOR_NOT_FOUND",
					Message:   fmt.Sprintf("Creditor account not found for transfer %d", i),
					Timestamp: time.Now(),
				})
				continue
			}
			creditorAccountID = acct
		}

		if debtorAccountID == "" || creditorAccountID == "" {
			results = append(results, ErrorResponse{
				Code:      "MISSING_ACCOUNTS",
				Message:   fmt.Sprintf("Debtor/creditor account required for transfer %d", i),
				Timestamp: time.Now(),
			})
			continue
		}

		// Transform to internal CreatePaymentRequest
		payReq := &service.CreatePaymentRequest{
			MessageID:         req.GroupHeader.MessageID,
			CreationDateTime:  time.Now(),
			InstructionID:     ct.PaymentID.InstructionID,
			EndToEndID:        endToEndId,
			UETR:              uetr,
			Amount:            amount,
			Currency:          ct.Amount.Currency,
			DebtorAccountID:   debtorAccountID,
			CreditorAccountID: creditorAccountID,
			DebtorName:        ct.Debtor.Name,
			CreditorName:      ct.Creditor.Name,
		}

		response, err := h.paymentService.CreatePayment(c.Request.Context(), payReq)
		if err != nil {
			h.logger.Error("pacs.008 payment creation failed",
				zap.Int("index", i),
				zap.Error(err),
			)
			results = append(results, ErrorResponse{
				Code:      "PROCESSING_ERROR",
				Message:   fmt.Sprintf("Failed to process transfer %d: %s", i, err.Error()),
				Timestamp: time.Now(),
			})
			continue
		}

		results = append(results, response)
	}

	// If single transfer, return the first result directly
	if len(req.CreditTransfers) == 1 && len(results) == 1 {
		if resp, ok := results[0].(*service.CreatePaymentResponse); ok {
			c.JSON(http.StatusCreated, resp)
			return
		}
		// If it was an error
		c.JSON(http.StatusUnprocessableEntity, results[0])
		return
	}

	// Batch response
	c.JSON(http.StatusCreated, gin.H{
		"messageId":    req.GroupHeader.MessageID,
		"transactions": results,
		"total":        len(req.CreditTransfers),
		"processed":    len(results),
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
	var req Pacs004Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "INVALID_MESSAGE",
			Message:   "Invalid pacs.004 message",
			Details:   err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	if len(req.TransactionInfo) == 0 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Code:      "NO_RETURNS",
			Message:   "At least one transaction info entry is required",
			Timestamp: time.Now(),
		})
		return
	}

	var results []interface{}
	for i, txInfo := range req.TransactionInfo {
		if txInfo.OriginalUETR == "" {
			results = append(results, ErrorResponse{
				Code:      "MISSING_UETR",
				Message:   fmt.Sprintf("orgnlUETR is required for return %d", i),
				Timestamp: time.Now(),
			})
			continue
		}

		reasonCode := txInfo.ReturnReason.Code
		if reasonCode == "" {
			reasonCode = "FOCR" // Following Cancellation Request (default)
		}

		returnResult, err := h.paymentService.ReturnPayment(
			c.Request.Context(),
			txInfo.OriginalUETR,
			reasonCode,
		)
		if err != nil {
			h.logger.Error("pacs.004 return failed",
				zap.Int("index", i),
				zap.String("uetr", txInfo.OriginalUETR),
				zap.Error(err),
			)
			results = append(results, ErrorResponse{
				Code:      "RETURN_FAILED",
				Message:   fmt.Sprintf("Failed to process return %d: %s", i, err.Error()),
				Timestamp: time.Now(),
			})
			continue
		}

		results = append(results, returnResult)
	}

	// Single return — return directly
	if len(req.TransactionInfo) == 1 && len(results) == 1 {
		if _, ok := results[0].(ErrorResponse); ok {
			c.JSON(http.StatusUnprocessableEntity, results[0])
			return
		}
		c.JSON(http.StatusOK, results[0])
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"messageId": req.GroupHeader.MessageID,
		"returns":   results,
		"total":     len(req.TransactionInfo),
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
	DebtorAccount struct {
		ID   string `json:"id,omitempty"`
		IBAN string `json:"iban,omitempty"`
	} `json:"dbtrAcct,omitempty"`
	Creditor struct {
		Name string `json:"nm"`
	} `json:"cdtr"`
	CreditorAccount struct {
		ID   string `json:"id,omitempty"`
		IBAN string `json:"iban,omitempty"`
	} `json:"cdtrAcct,omitempty"`
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
