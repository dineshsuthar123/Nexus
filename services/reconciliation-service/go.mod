module github.com/nexus-rtp/reconciliation-service

go 1.21

require (
	github.com/IBM/sarama v1.42.1
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.4.0
	github.com/jackc/pgx/v5 v5.5.0
	github.com/prometheus/client_golang v1.17.0
	github.com/robfig/cron/v3 v3.0.1
	github.com/shopspring/decimal v1.3.1
	github.com/spf13/viper v1.17.0
	go.opentelemetry.io/otel v1.21.0
	go.opentelemetry.io/otel/exporters/jaeger v1.17.0
	go.opentelemetry.io/otel/sdk v1.21.0
	go.opentelemetry.io/otel/trace v1.21.0
	go.uber.org/zap v1.26.0
)
