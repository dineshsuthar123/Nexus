package multitenancy

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func testLogger() *zap.Logger {
	l, _ := zap.NewDevelopment()
	return l
}

func TestExtractorMiddleware_FromJWTClaims(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	cfg := Config{Logger: testLogger(), RequireTenantID: false}

	// Simulate auth middleware setting claims
	r.Use(func(c *gin.Context) {
		c.Set("jwt_claims", map[string]interface{}{
			"sub": "user-1",
			"tid": "tenant-abc-123",
		})
		c.Next()
	})
	r.Use(ExtractorMiddleware(cfg))
	r.GET("/test", func(c *gin.Context) {
		tid := FromGin(c)
		c.JSON(200, gin.H{"tenant_id": tid})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !contains(body, "tenant-abc-123") {
		t.Errorf("expected tenant-abc-123 in response, got %s", body)
	}
}

func TestExtractorMiddleware_FromHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	cfg := Config{Logger: testLogger(), RequireTenantID: false}
	r.Use(ExtractorMiddleware(cfg))
	r.GET("/test", func(c *gin.Context) {
		tid := FromGin(c)
		c.JSON(200, gin.H{"tenant_id": tid})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Tenant-ID", "header-tenant-456")
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !contains(w.Body.String(), "header-tenant-456") {
		t.Errorf("expected header-tenant-456 in response, got %s", w.Body.String())
	}
}

func TestExtractorMiddleware_DefaultTenant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	cfg := Config{Logger: testLogger(), RequireTenantID: false}
	r.Use(ExtractorMiddleware(cfg))
	r.GET("/test", func(c *gin.Context) {
		tid := FromGin(c)
		c.JSON(200, gin.H{"tenant_id": tid})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !contains(w.Body.String(), DefaultTenantID) {
		t.Errorf("expected default tenant ID, got %s", w.Body.String())
	}
}

func TestExtractorMiddleware_RequireTenant_Rejects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	cfg := Config{Logger: testLogger(), RequireTenantID: true}
	r.Use(ExtractorMiddleware(cfg))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestExtractorMiddleware_SkipPaths(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	cfg := Config{
		Logger:          testLogger(),
		RequireTenantID: true,
		SkipPaths:       []string{"/health", "/metrics"},
	}
	r.Use(ExtractorMiddleware(cfg))
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })
	r.GET("/metrics", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	for _, path := range []string{"/health", "/metrics"} {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", path, nil)
		r.ServeHTTP(w, req)
		if w.Code != 200 {
			t.Errorf("path %s should be skipped (200), got %d", path, w.Code)
		}
	}
}

func TestValidateTenantAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Default tenant → access allowed
	c1, _ := gin.CreateTestContext(httptest.NewRecorder())
	c1.Set(ContextKey, DefaultTenantID)
	if !ValidateTenantAccess(c1, "any-tenant") {
		t.Error("default tenant should have access")
	}

	// Same tenant → access allowed
	c2, _ := gin.CreateTestContext(httptest.NewRecorder())
	c2.Set(ContextKey, "tenant-A")
	if !ValidateTenantAccess(c2, "tenant-A") {
		t.Error("same tenant should have access")
	}

	// Different tenant → access denied
	c3, _ := gin.CreateTestContext(httptest.NewRecorder())
	c3.Set(ContextKey, "tenant-A")
	if ValidateTenantAccess(c3, "tenant-B") {
		t.Error("different tenant should NOT have access")
	}
}

func TestFromContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	cfg := Config{Logger: testLogger(), RequireTenantID: false}
	r.Use(func(c *gin.Context) {
		c.Set("jwt_claims", map[string]interface{}{"tid": "ctx-tenant"})
		c.Next()
	})
	r.Use(ExtractorMiddleware(cfg))
	r.GET("/test", func(c *gin.Context) {
		tid := FromContext(c.Request.Context())
		c.JSON(200, gin.H{"tenant_id": tid})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if !contains(w.Body.String(), "ctx-tenant") {
		t.Errorf("expected ctx-tenant from context, got %s", w.Body.String())
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
