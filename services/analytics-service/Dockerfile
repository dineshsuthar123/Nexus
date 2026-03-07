FROM golang:1.22-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /analytics-service ./cmd/server

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata curl
RUN adduser -D -u 1001 appuser
WORKDIR /app
COPY --from=builder /analytics-service .
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD curl -f http://localhost:8080/health || exit 1
ENTRYPOINT ["./analytics-service"]
