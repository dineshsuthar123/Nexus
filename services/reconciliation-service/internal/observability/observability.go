// Package observability provides telemetry
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

var tracer trace.Tracer

// Metrics
var (
	reconciliationDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "reconciliation_duration_seconds",
		Help:    "Duration of reconciliation cycles",
		Buckets: []float64{1, 5, 10, 30, 60, 120, 300, 600},
	}, []string{"status"})

	reconciliationRecords = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "reconciliation_records_total",
		Help: "Total reconciliation records processed",
	}, []string{"status"})

	discrepanciesFound = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "reconciliation_discrepancies_total",
		Help: "Total discrepancies found",
	}, []string{"type"})

	autoResolutions = promauto.NewCounter(prometheus.CounterOpts{
		Name: "reconciliation_auto_resolutions_total",
		Help: "Total auto-resolved discrepancies",
	})

	manualReviewRequired = promauto.NewCounter(prometheus.CounterOpts{
		Name: "reconciliation_manual_review_total",
		Help: "Total discrepancies requiring manual review",
	})

	activeCycles = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "reconciliation_active_cycles",
		Help: "Number of active reconciliation cycles",
	})
)

// Initialize sets up observability
func Initialize(serviceName, environment, jaegerEndpoint string) (*zap.Logger, func(), error) {
	// Initialize logger
	config := zap.NewProductionConfig()
	if environment != "production" {
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	logger, err := config.Build()
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
			attribute.String("deployment.environment", environment),
		)),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	tracer = tp.Tracer(serviceName)

	cleanup := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := tp.Shutdown(ctx); err != nil {
			logger.Error("Failed to shutdown tracer", zap.Error(err))
		}
		logger.Sync()
	}

	return logger, cleanup, nil
}

// StartSpan starts a new span
func StartSpan(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	return tracer.Start(ctx, name, opts...)
}

// GinMiddleware returns a Gin middleware for tracing
func GinMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, span := StartSpan(c.Request.Context(), c.FullPath(),
			trace.WithAttributes(
				attribute.String("http.method", c.Request.Method),
				attribute.String("http.url", c.Request.URL.String()),
			),
		)
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		span.SetAttributes(attribute.Int("http.status_code", c.Writer.Status()))
		span.End()
	}
}

// ReconciliationResult for metrics
type ReconciliationResult interface {
	GetStatus() string
	GetTotalRecords() int
	GetMatchedRecords() int
	GetDiscrepantCount() int
	GetAutoResolved() int
	GetManualReview() int
	GetProcessingTimeMs() int64
}

// RecordReconciliationMetrics records metrics for a reconciliation result
func RecordReconciliationMetrics(result interface{}) {
	// Type assert to get metrics
	type metricsResult struct {
		Status           string `json:"status"`
		TotalRecords     int    `json:"totalRecords"`
		MatchedRecords   int    `json:"matchedRecords"`
		DiscrepantCount  int    `json:"discrepantCount"`
		AutoResolved     int    `json:"autoResolved"`
		ManualReview     int    `json:"manualReview"`
		ProcessingTimeMs int64  `json:"processingTimeMs"`
	}

	if r, ok := result.(*metricsResult); ok {
		reconciliationDuration.WithLabelValues(r.Status).Observe(float64(r.ProcessingTimeMs) / 1000)
		reconciliationRecords.WithLabelValues("matched").Add(float64(r.MatchedRecords))
		reconciliationRecords.WithLabelValues("discrepant").Add(float64(r.DiscrepantCount))
		autoResolutions.Add(float64(r.AutoResolved))
		manualReviewRequired.Add(float64(r.ManualReview))
	}
}

// IncrementActiveCycles increments active cycles
func IncrementActiveCycles() {
	activeCycles.Inc()
}

// DecrementActiveCycles decrements active cycles
func DecrementActiveCycles() {
	activeCycles.Dec()
}

// RecordDiscrepancy records a discrepancy
func RecordDiscrepancy(discrepancyType string) {
	discrepanciesFound.WithLabelValues(discrepancyType).Inc()
}
