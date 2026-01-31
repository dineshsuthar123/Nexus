// Package api provides HTTP handlers
package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nexus-rtp/reconciliation-service/internal/reconciler"
	"go.uber.org/zap"
)

// RegisterRoutes registers API routes
func RegisterRoutes(router *gin.Engine, engine *reconciler.Engine, logger *zap.Logger) {
	api := router.Group("/api/v1")
	{
		// Reconciliation endpoints
		api.POST("/reconciliation/run", runReconciliation(engine, logger))
		api.GET("/reconciliation/cycles", getCycles(engine, logger))
		api.GET("/reconciliation/cycles/:id", getCycle(engine, logger))
		api.GET("/reconciliation/cycles/:id/discrepancies", getDiscrepancies(engine, logger))
		api.POST("/reconciliation/discrepancies/:id/resolve", resolveDiscrepancy(engine, logger))
	}
}

// RunReconciliationRequest is the request body
type RunReconciliationRequest struct {
	Date string `json:"date" binding:"required"` // Format: 2006-01-02
}

// runReconciliation handles POST /api/v1/reconciliation/run
func runReconciliation(engine *reconciler.Engine, logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RunReconciliationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		date, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Use YYYY-MM-DD"})
			return
		}

		result, err := engine.RunReconciliation(c.Request.Context(), date)
		if err != nil {
			logger.Error("Reconciliation failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, result)
	}
}

// getCycles handles GET /api/v1/reconciliation/cycles
func getCycles(engine *reconciler.Engine, logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get query params for date range
		startStr := c.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
		endStr := c.DefaultQuery("end", time.Now().Format("2006-01-02"))

		start, err := time.Parse("2006-01-02", startStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid start date"})
			return
		}

		end, err := time.Parse("2006-01-02", endStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid end date"})
			return
		}

		// This would call engine.GetCycles()
		_ = start
		_ = end
		c.JSON(http.StatusOK, gin.H{"cycles": []interface{}{}})
	}
}

// getCycle handles GET /api/v1/reconciliation/cycles/:id
func getCycle(engine *reconciler.Engine, logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		id, err := uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cycle ID"})
			return
		}

		cycle, err := engine.GetCycleStatus(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Cycle not found"})
			return
		}

		c.JSON(http.StatusOK, cycle)
	}
}

// getDiscrepancies handles GET /api/v1/reconciliation/cycles/:id/discrepancies
func getDiscrepancies(engine *reconciler.Engine, logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		id, err := uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cycle ID"})
			return
		}

		discrepancies, err := engine.GetDiscrepancies(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"discrepancies": discrepancies})
	}
}

// ResolveDiscrepancyRequest is the request body
type ResolveDiscrepancyRequest struct {
	Resolution string `json:"resolution" binding:"required"`
	ResolvedBy string `json:"resolvedBy" binding:"required"`
}

// resolveDiscrepancy handles POST /api/v1/reconciliation/discrepancies/:id/resolve
func resolveDiscrepancy(engine *reconciler.Engine, logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		id, err := uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid discrepancy ID"})
			return
		}

		var req ResolveDiscrepancyRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := engine.ResolveDiscrepancy(c.Request.Context(), id, req.Resolution, req.ResolvedBy); err != nil {
			logger.Error("Failed to resolve discrepancy", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "resolved"})
	}
}
