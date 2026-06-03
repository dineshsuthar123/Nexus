// Package observability provides logging, tracing, and metrics
package observability

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
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

// ============================================================================
// Logging
// ============================================================================

// NewLogger creates a new zap logger
func NewLogger(level string) (*zap.Logger, error) {
	var zapLevel zapcore.Level
	if err := zapLevel.UnmarshalText([]byte(level)); err != nil {
		zapLevel = zapcore.InfoLevel
	}

	config := zap.Config{
		Level:       zap.NewAtomicLevelAt(zapLevel),
		Development: false,
		Encoding:    "json",
		EncoderConfig: zapcore.EncoderConfig{
			TimeKey:        "timestamp",
			LevelKey:       "level",
			NameKey:        "logger",
			CallerKey:      "caller",
			FunctionKey:    zapcore.OmitKey,
			MessageKey:     "message",
			StacktraceKey:  "stacktrace",
			LineEnding:     zapcore.DefaultLineEnding,
			EncodeLevel:    zapcore.LowercaseLevelEncoder,
			EncodeTime:     zapcore.ISO8601TimeEncoder,
			EncodeDuration: zapcore.MillisDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		},
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
	}

	return config.Build()
}

// GinLogger returns a Gin middleware for structured logging
func GinLogger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		fields := []zap.Field{
			zap.Int("status", status),
			zap.String("method", c.Request.Method),
			zap.String("path", path),
			zap.String("query", query),
			zap.String("ip", c.ClientIP()),
			zap.String("user-agent", c.Request.UserAgent()),
			zap.Duration("latency", latency),
			zap.Int("body_size", c.Writer.Size()),
		}

		if len(c.Errors) > 0 {
			fields = append(fields, zap.String("errors", c.Errors.String()))
		}

		if traceID := GetTraceID(c.Request.Context()); traceID != "" {
			fields = append(fields, zap.String("trace_id", traceID))
		}

		if status >= 500 {
			logger.Error("Request failed", fields...)
		} else if status >= 400 {
			logger.Warn("Request error", fields...)
		} else {
			logger.Info("Request completed", fields...)
		}
	}
}

// ============================================================================
// Tracing
// ============================================================================

// InitTracer initializes OpenTelemetry tracing with OTLP HTTP exporter.
// otlpEndpoint should be host:port (e.g. "jaeger:4318").
func InitTracer(otlpEndpoint, serviceName string) (func(context.Context) error, error) {
	// Normalize endpoint input: support full URL (http(s)://host:port/path)
	endpoint, urlPath, insecure := parseOTLPEndpoint(otlpEndpoint)

	// Build OTLP HTTP exporter options
	opts := []otlptracehttp.Option{otlptracehttp.WithEndpoint(endpoint)}
	if insecure {
		opts = append(opts, otlptracehttp.WithInsecure())
	}
	if urlPath != "" && urlPath != "/" {
		opts = append(opts, otlptracehttp.WithURLPath(urlPath))
	}

	// Create OTLP HTTP exporter (Jaeger natively accepts OTLP on port 4318)
	exp, err := otlptracehttp.New(context.Background(), opts...)
	if err != nil {
		return nil, err
	}

	// Create trace provider
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion("1.0.0"),
		)),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)

	// Set global trace provider
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return tp.Shutdown, nil
}

// parseOTLPEndpoint accepts either a host:port (e.g. "jaeger:4318") or a full
// URL (e.g. "http://localhost:4318/v1/traces") and returns the normalized
// endpoint (host:port), the URL path (if any) and whether the connection should
// be insecure (true for http scheme or unknown inputs).
func parseOTLPEndpoint(raw string) (endpoint, urlPath string, insecure bool) {
	if raw == "" {
		return "", "", true
	}

	// Fast path: if it looks like host:port, return as-is
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		return raw, "", true
	}

	u, err := url.Parse(raw)
	if err != nil {
		// If parse fails, fall back to original string and mark insecure
		return raw, "", true
	}

	host := u.Host
	path := u.Path
	insecure = (u.Scheme == "http")
	return host, path, insecure
}

// TracingMiddleware returns a Gin middleware for distributed tracing
func TracingMiddleware() gin.HandlerFunc {
	tracer := otel.Tracer("payment-service")

	return func(c *gin.Context) {
		ctx := c.Request.Context()

		// Extract trace context from headers
		ctx = otel.GetTextMapPropagator().Extract(ctx, propagation.HeaderCarrier(c.Request.Header))

		// Start span
		spanName := c.Request.Method + " " + c.FullPath()
		ctx, span := tracer.Start(ctx, spanName,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				attribute.String("http.method", c.Request.Method),
				attribute.String("http.url", c.Request.URL.String()),
				attribute.String("http.route", c.FullPath()),
				attribute.String("http.client_ip", c.ClientIP()),
			),
		)
		defer span.End()

		// Update request context
		c.Request = c.Request.WithContext(ctx)

		// Process request
		c.Next()

		// Set response attributes
		span.SetAttributes(
			attribute.Int("http.status_code", c.Writer.Status()),
			attribute.Int("http.response_size", c.Writer.Size()),
		)

		// Record errors
		if len(c.Errors) > 0 {
			span.SetAttributes(attribute.String("error", c.Errors.String()))
		}
	}
}

// GetTraceID extracts the trace ID from context
func GetTraceID(ctx context.Context) string {
	span := trace.SpanFromContext(ctx)
	if span.SpanContext().IsValid() {
		return span.SpanContext().TraceID().String()
	}
	return ""
}

// StartSpan starts a new span
func StartSpan(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	tracer := otel.Tracer("payment-service")
	return tracer.Start(ctx, name, opts...)
}

// ============================================================================
// Metrics
// ============================================================================

var (
	// HTTP request metrics
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "path", "status"},
	)

	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		},
		[]string{"method", "path"},
	)

	// Payment metrics
	PaymentsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "payments_total",
			Help: "Total number of payments processed",
		},
		[]string{"status", "currency"},
	)

	PaymentLatency = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "payment_processing_duration_seconds",
			Help:    "Payment processing duration in seconds",
			Buckets: []float64{0.05, 0.1, 0.25, 0.5, 0.75, 1.0}, // Target: < 1 second
		},
		[]string{"stage"},
	)

	PaymentAmount = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "payment_amount",
			Help:    "Payment amount distribution",
			Buckets: prometheus.ExponentialBuckets(100, 10, 8), // 100 to 1B
		},
		[]string{"currency"},
	)

	// Sanctions screening metrics
	SanctionsScreeningTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "sanctions_screening_total",
			Help: "Total sanctions screening requests",
		},
		[]string{"status"},
	)

	SanctionsScreeningLatency = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "sanctions_screening_duration_seconds",
			Help:    "Sanctions screening duration in seconds",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1}, // Target: < 100ms
		},
	)

	// Database metrics
	DBQueryLatency = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "db_query_duration_seconds",
			Help:    "Database query duration in seconds",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25},
		},
		[]string{"query_type"},
	)

	DBTransactionRetries = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "db_transaction_retries_total",
			Help: "Total number of transaction retries due to conflicts",
		},
	)

	// Kafka metrics
	KafkaMessagesPublished = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kafka_messages_published_total",
			Help: "Total Kafka messages published",
		},
		[]string{"topic"},
	)

	KafkaPublishLatency = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "kafka_publish_duration_seconds",
			Help:    "Kafka publish duration in seconds",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1},
		},
		[]string{"topic"},
	)

	// Active connections
	ActiveConnections = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "active_connections",
			Help: "Number of active connections",
		},
		[]string{"type"},
	)

	// Outbox pending gauge
	OutboxEventsPending = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "outbox_events_pending",
			Help: "Number of pending/failed outbox events",
		},
	)

	// Balance drift gauge — tracks accounts where account.balance != SUM(shard.balance)
	BalanceDriftCount = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "balance_drift_accounts_total",
			Help: "Number of accounts where master balance drifts from shard sum",
		},
	)

	// Sanctions refresh gauge — last successful refresh timestamp
	SanctionsLastRefresh = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "sanctions_last_refresh_timestamp",
			Help: "Unix timestamp of the last successful sanctions list refresh",
		},
	)
)

// RegisterMetricsHandler registers the Prometheus metrics endpoint
func RegisterMetricsHandler(router *gin.Engine) {
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))
}

// MetricsMiddleware records HTTP metrics
func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		duration := time.Since(start).Seconds()
		status := c.Writer.Status()
		path := c.FullPath()
		if path == "" {
			path = "unknown"
		}

		httpRequestsTotal.WithLabelValues(c.Request.Method, path, http.StatusText(status)).Inc()
		httpRequestDuration.WithLabelValues(c.Request.Method, path).Observe(duration)
	}
}

// RecordPaymentMetrics records payment-related metrics
func RecordPaymentMetrics(stage string, duration time.Duration, status, currency string, amount float64) {
	PaymentLatency.WithLabelValues(stage).Observe(duration.Seconds())
	PaymentsTotal.WithLabelValues(status, currency).Inc()
	if amount > 0 {
		PaymentAmount.WithLabelValues(currency).Observe(amount)
	}
}

// RecordSanctionsMetrics records sanctions screening metrics
func RecordSanctionsMetrics(status string, duration time.Duration) {
	SanctionsScreeningTotal.WithLabelValues(status).Inc()
	SanctionsScreeningLatency.Observe(duration.Seconds())
}
