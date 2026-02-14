package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nexus-rtp/audit-service/internal/audit"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

var (
	httpRequests = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "audit_http_requests_total",
		Help: "Total HTTP requests to audit service",
	}, []string{"method", "path", "status"})
)

func init() {
	prometheus.MustRegister(httpRequests)
}

type Handler struct {
	service *audit.Service
	logger  *zap.Logger
}

func NewHandler(svc *audit.Service, logger *zap.Logger) *Handler {
	return &Handler{service: svc, logger: logger}
}

func (h *Handler) RegisterRoutes(r *gin.Engine) {
	r.GET("/health", h.Health)
	r.GET("/ready", h.Ready)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	api := r.Group("/api/v1/audit")
	{
		api.GET("/bundles", h.ListBundles)
		api.POST("/bundles", h.CreateBundle)
		api.GET("/bundles/:id", h.GetBundle)
		api.GET("/bundles/:id/verify", h.VerifyBundle)
		api.GET("/bundles/:id/download", h.DownloadBundle)
		api.GET("/bundles/reference/:type/:refId", h.GetBundleByReference)
	}
}

func (h *Handler) ListBundles(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit <= 0 || limit > 100 {
		limit = 20
	}

	bundles, total, err := h.service.ListBundles(c.Request.Context(), limit, offset)
	if err != nil {
		h.logger.Error("failed to list bundles", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list bundles"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":   bundles,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *Handler) CreateBundle(c *gin.Context) {
	var req struct {
		RequestID   string `json:"request_id" binding:"required"`
		RequestType string `json:"request_type" binding:"required"`
		Requester   struct {
			Name         string `json:"name" binding:"required"`
			Organization string `json:"organization" binding:"required"`
			Jurisdiction string `json:"jurisdiction" binding:"required"`
			ContactEmail string `json:"contact_email"`
		} `json:"requester" binding:"required"`
		Scope struct {
			PeriodStart    string   `json:"period_start" binding:"required"`
			PeriodEnd      string   `json:"period_end" binding:"required"`
			AccountIDs     []string `json:"account_ids"`
			TransactionIDs []string `json:"transaction_ids"`
			Currencies     []string `json:"currencies"`
		} `json:"scope" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	periodStart, err := time.Parse(time.RFC3339, req.Scope.PeriodStart)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid period_start format, use RFC3339"})
		return
	}
	periodEnd, err := time.Parse(time.RFC3339, req.Scope.PeriodEnd)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid period_end format, use RFC3339"})
		return
	}

	auditReq := audit.AuditRequest{
		RequestID:   req.RequestID,
		RequestType: audit.RequestType(req.RequestType),
		Requester: audit.Requester{
			Name:         req.Requester.Name,
			Organization: req.Requester.Organization,
			Jurisdiction: req.Requester.Jurisdiction,
			ContactEmail: req.Requester.ContactEmail,
		},
		Scope: audit.Scope{
			PeriodStart:    periodStart,
			PeriodEnd:      periodEnd,
			AccountIDs:     req.Scope.AccountIDs,
			TransactionIDs: req.Scope.TransactionIDs,
			Currencies:     req.Scope.Currencies,
		},
		ReceivedAt: time.Now().UTC(),
	}

	bundle, err := h.service.GenerateBundle(c.Request.Context(), auditReq)
	if err != nil {
		h.logger.Error("failed to generate bundle", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate audit bundle"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": bundle})
}

func (h *Handler) GetBundle(c *gin.Context) {
	bundleID := c.Param("id")
	bundle, err := h.service.GetBundle(c.Request.Context(), bundleID)
	if err != nil {
		h.logger.Error("failed to get bundle", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to retrieve bundle"})
		return
	}
	if bundle == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bundle not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": bundle})
}

func (h *Handler) VerifyBundle(c *gin.Context) {
	bundleID := c.Param("id")
	result, err := h.service.VerifyBundle(c.Request.Context(), bundleID)
	if err != nil {
		h.logger.Error("failed to verify bundle", zap.Error(err))
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (h *Handler) DownloadBundle(c *gin.Context) {
	bundleID := c.Param("id")
	bundle, err := h.service.GetBundle(c.Request.Context(), bundleID)
	if err != nil || bundle == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bundle not found"})
		return
	}

	data, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to serialize bundle"})
		return
	}

	c.Header("Content-Disposition", "attachment; filename=audit-bundle-"+bundleID+".json")
	c.Data(http.StatusOK, "application/json", data)
}

func (h *Handler) GetBundleByReference(c *gin.Context) {
	refType := c.Param("type")
	refID := c.Param("refId")

	bundle, err := h.service.GetBundleByReference(c.Request.Context(), refType, refID)
	if err != nil {
		h.logger.Error("failed to find bundle by reference", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to find bundle"})
		return
	}
	if bundle == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no bundle found for reference"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": bundle})
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "audit-service"})
}

func (h *Handler) Ready(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ready", "service": "audit-service"})
}
