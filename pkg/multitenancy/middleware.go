// Package multitenancy provides Gin middleware for extracting and enforcing
// tenant isolation from JWT tokens and request context.
//
// JWT tokens are expected to carry a "tid" (tenant ID) claim. The middleware
// extracts this claim and injects it into the Gin context as "tenant_id".
//
// Downstream handlers and repository layers MUST include tenant_id in all
// queries (SELECT/UPDATE/DELETE WHERE tenant_id = $N) to enforce isolation.
package multitenancy

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// ContextKey is the key used to store tenant_id in context.
const ContextKey = "tenant_id"

// DefaultTenantID is used for backward compatibility with single-tenant deployments.
const DefaultTenantID = "00000000-0000-0000-0000-000000000000"

// Config holds middleware configuration.
type Config struct {
	// Logger for structured logging.
	Logger *zap.Logger

	// RequireTenantID if true, requests without a tenant_id in JWT are rejected.
	// If false, DefaultTenantID is used for backward compatibility.
	RequireTenantID bool

	// SkipPaths are paths that skip tenant enforcement (e.g., /health, /metrics).
	SkipPaths []string
}

// ExtractorMiddleware extracts tenant_id from JWT claims in the Gin context.
//
// This middleware expects that auth middleware has already validated the JWT
// and set "claims" or "user_claims" in the Gin context (or uses the "tid"
// claim from a parsed token). It can also read from the X-Tenant-ID header
// for service-to-service calls with mTLS.
func ExtractorMiddleware(cfg Config) gin.HandlerFunc {
	skipSet := make(map[string]bool, len(cfg.SkipPaths))
	for _, p := range cfg.SkipPaths {
		skipSet[p] = true
	}

	return func(c *gin.Context) {
		// Skip health/metrics/readiness paths
		if skipSet[c.Request.URL.Path] {
			c.Next()
			return
		}

		var tenantID string

		// Strategy 1: Extract from JWT claims (set by auth middleware)
		if claims, exists := c.Get("jwt_claims"); exists {
			if claimsMap, ok := claims.(map[string]interface{}); ok {
				if tid, ok := claimsMap["tid"].(string); ok && tid != "" {
					tenantID = tid
				}
			}
		}

		// Strategy 2: Extract from parsed user context
		if tenantID == "" {
			if tid, exists := c.Get("tenant_id"); exists {
				if tidStr, ok := tid.(string); ok && tidStr != "" {
					tenantID = tidStr
				}
			}
		}

		// Strategy 3: Extract from X-Tenant-ID header (service-to-service with mTLS)
		if tenantID == "" {
			tenantID = c.GetHeader("X-Tenant-ID")
		}

		// Apply default or reject
		if tenantID == "" {
			if cfg.RequireTenantID {
				cfg.Logger.Warn("Request without tenant_id rejected",
					zap.String("path", c.Request.URL.Path),
					zap.String("method", c.Request.Method),
				)
				c.JSON(http.StatusForbidden, gin.H{
					"error": "Tenant identification required",
					"code":  "MISSING_TENANT_ID",
				})
				c.Abort()
				return
			}
			tenantID = DefaultTenantID
		}

		// Inject tenant_id into Gin context and Go context
		c.Set(ContextKey, tenantID)
		ctx := context.WithValue(c.Request.Context(), contextKeyType{}, tenantID)
		c.Request = c.Request.WithContext(ctx)

		cfg.Logger.Debug("Tenant context established",
			zap.String("tenant_id", maskTenantID(tenantID)),
			zap.String("path", c.Request.URL.Path),
		)

		c.Next()
	}
}

// IsolationMiddleware validates that data access is tenant-scoped.
// It intercepts responses and checks for cross-tenant access attempts.
// This is a secondary safety net — primary enforcement is at the query level.
func IsolationMiddleware(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// Post-handler check: if a handler explicitly flagged a cross-tenant violation
		if violation, exists := c.Get("tenant_violation"); exists {
			cfg.Logger.Error("Cross-tenant access attempt detected",
				zap.Any("violation", violation),
				zap.String("path", c.Request.URL.Path),
			)
			// Response already sent by handler — log for audit
		}
	}
}

// contextKeyType is an unexported type for context keys to avoid collisions.
type contextKeyType struct{}

// FromContext extracts tenant_id from a Go context.
func FromContext(ctx context.Context) string {
	if tid, ok := ctx.Value(contextKeyType{}).(string); ok {
		return tid
	}
	return DefaultTenantID
}

// FromGin extracts tenant_id from a Gin context.
func FromGin(c *gin.Context) string {
	if tid, exists := c.Get(ContextKey); exists {
		if tidStr, ok := tid.(string); ok {
			return tidStr
		}
	}
	return DefaultTenantID
}

// ValidateTenantAccess checks if the requested tenant_id matches the context tenant.
// Returns true if access is allowed, false if cross-tenant access is detected.
func ValidateTenantAccess(c *gin.Context, resourceTenantID string) bool {
	contextTenant := FromGin(c)
	if contextTenant == DefaultTenantID {
		return true // Default tenant has access to legacy data
	}
	return strings.EqualFold(contextTenant, resourceTenantID)
}

// RejectCrossTenantAccess sends a 403 Forbidden response for cross-tenant access.
func RejectCrossTenantAccess(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{
		"error": "Cross-tenant access denied",
		"code":  "TENANT_ISOLATION_VIOLATION",
	})
	c.Abort()
}

// maskTenantID masks the tenant ID for logging.
func maskTenantID(tid string) string {
	if tid == DefaultTenantID || len(tid) <= 8 {
		return tid
	}
	return tid[:8] + "..."
}
