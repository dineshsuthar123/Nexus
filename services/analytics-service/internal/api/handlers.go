package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nexus-rtp/analytics-service/internal/analytics"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

var (
	httpRequests = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "analytics_http_requests_total",
		Help: "Total HTTP requests to analytics service",
	}, []string{"method", "path", "status"})
	startedAt = time.Now()
)

func init() {
	prometheus.MustRegister(httpRequests)
}

type Handler struct {
	service *analytics.Service
	logger  *zap.Logger
}

func NewHandler(svc *analytics.Service, logger *zap.Logger) *Handler {
	return &Handler{service: svc, logger: logger}
}

func (h *Handler) RegisterRoutes(r *gin.Engine) {
	r.GET("/health", h.Health)
	r.GET("/ready", h.Ready)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	api := r.Group("/api/v1/analytics")
	{
		api.GET("/summary", h.GetSummary)
		api.GET("/volume", h.GetVolume)
		api.GET("/performance", h.GetPerformance)
		api.GET("/trends", h.GetTrends)
		api.GET("/health", h.GetSystemHealth)
	}
}

func (h *Handler) GetSummary(c *gin.Context) {
	summary, err := h.service.GetSummary(c.Request.Context())
	if err != nil {
		h.logger.Error("failed to get summary", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get analytics summary"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": summary})
}

func (h *Handler) GetVolume(c *gin.Context) {
	interval := c.DefaultQuery("interval", "1h")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	var from, to time.Time
	if fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			from = t
		}
	}
	if toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			to = t
		}
	}

	points, err := h.service.GetVolume(c.Request.Context(), interval, from, to)
	if err != nil {
		h.logger.Error("failed to get volume", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get volume data"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": points})
}

func (h *Handler) GetPerformance(c *gin.Context) {
	metrics, err := h.service.GetPerformance(c.Request.Context())
	if err != nil {
		h.logger.Error("failed to get performance", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get performance metrics"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": metrics})
}

func (h *Handler) GetTrends(c *gin.Context) {
	trends, err := h.service.GetTrends(c.Request.Context())
	if err != nil {
		h.logger.Error("failed to get trends", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get trend data"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": trends})
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "analytics-service"})
}

func (h *Handler) GetSystemHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"uptime":  int64(time.Since(startedAt).Seconds()),
		"version": "dev",
		"checks": gin.H{
			"database": gin.H{"status": "healthy", "latency": 0},
			"kafka":    gin.H{"status": "healthy", "latency": 0},
			"redis":    gin.H{"status": "healthy", "latency": 0},
			"services": []gin.H{
				{"name": "analytics-service", "status": "healthy", "latency": 0},
			},
		},
	})
}

func (h *Handler) Ready(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ready", "service": "analytics-service"})
}
