# Build stage
FROM golang:1.21-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy the shared idempotency package (referenced via replace directive)
COPY pkg/idempotency /build/pkg/idempotency

# Copy the service
COPY services/reconciliation-service /build/services/reconciliation-service

WORKDIR /build/services/reconciliation-service

# Download deps
RUN go mod download

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags '-w -s' -o /reconciliation-service ./cmd/server

# Final stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /reconciliation-service .

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 8082

ENTRYPOINT ["./reconciliation-service"]
