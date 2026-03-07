// Package observability provides logging, tracing, and metrics
package observability

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	// AccountOperations tracks account operation counts
	AccountOperations = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "account_operations_total",
			Help: "Total number of account operations",
		},
		[]string{"operation", "status"},
	)

	// AccountBalanceQueries tracks balance query latency
	AccountBalanceQueries = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "account_balance_query_duration_seconds",
			Help:    "Duration of balance queries",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0},
		},
		[]string{"cached"},
	)

	// CacheHits tracks cache hit/miss ratio
	CacheHits = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "account_cache_hits_total",
			Help: "Total number of cache hits/misses",
		},
		[]string{"type", "result"},
	)

	// ActiveAccounts tracks the number of active accounts
	ActiveAccounts = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "active_accounts",
			Help: "Number of active accounts",
		},
		[]string{"currency", "type"},
	)

	// KYCStatus tracks KYC status distribution
	KYCStatus = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "account_kyc_status",
			Help: "Distribution of KYC statuses",
		},
		[]string{"status"},
	)

	// RequestLatency tracks HTTP request latency
	RequestLatency = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Duration of HTTP requests",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path", "status"},
	)
)

var tracer trace.Tracer

// InitNoop sets up a no-op tracer for unit testing.
func InitNoop() {
	tracer = otel.Tracer("test-noop")
}

// Initialize sets up observability stack
func Initialize(serviceName, environment, jaegerEndpoint string) (*zap.Logger, func(), error) {
	// Initialize logger
	var logger *zap.Logger
	var err error

	if environment == "production" {
		config := zap.NewProductionConfig()
		config.EncoderConfig.TimeKey = "timestamp"
		config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
		logger, err = config.Build()
	} else {
		config := zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		logger, err = config.Build()
	}
	if err != nil {
		return nil, nil, err
	}

	// Initialize tracer — OTLP HTTP exporter (Jaeger accepts OTLP on port 4318)
	exp, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpoint(jaegerEndpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		logger.Warn("Failed to create OTLP exporter", zap.Error(err))
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
			attribute.String("environment", environment),
		)),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	tracer = tp.Tracer(serviceName)

	cleanup := func() {
		logger.Sync()
		tp.Shutdown(context.Background())
	}

	return logger, cleanup, nil
}

// StartSpan starts a new trace span
func StartSpan(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	return tracer.Start(ctx, name, opts...)
}

// GinMiddleware returns Gin middleware for observability
func GinMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		// Start span
		ctx, span := StartSpan(c.Request.Context(), "HTTP "+c.Request.Method+" "+path,
			trace.WithAttributes(
				attribute.String("http.method", c.Request.Method),
				attribute.String("http.path", path),
				attribute.String("http.user_agent", c.Request.UserAgent()),
			),
		)
		c.Request = c.Request.WithContext(ctx)

		// Process request
		c.Next()

		// Record metrics
		duration := time.Since(start)
		status := c.Writer.Status()

		span.SetAttributes(
			attribute.Int("http.status_code", status),
			attribute.Float64("http.duration_ms", float64(duration.Milliseconds())),
		)
		span.End()

		RequestLatency.WithLabelValues(
			c.Request.Method,
			path,
			string(rune(status/100)),
		).Observe(duration.Seconds())
	}
}

// RecordAccountOperation records an account operation metric
func RecordAccountOperation(operation, status string) {
	AccountOperations.WithLabelValues(operation, status).Inc()
}

// RecordBalanceQuery records a balance query latency
func RecordBalanceQuery(cached bool, duration time.Duration) {
	cachedStr := "false"
	if cached {
		cachedStr = "true"
	}
	AccountBalanceQueries.WithLabelValues(cachedStr).Observe(duration.Seconds())
}

// RecordCacheHit records a cache hit or miss
func RecordCacheHit(cacheType string, hit bool) {
	result := "miss"
	if hit {
		result = "hit"
	}
	CacheHits.WithLabelValues(cacheType, result).Inc()
}
