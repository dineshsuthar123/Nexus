FROM flink:1.18.0-java17

LABEL org.opencontainers.image.title="Nexus RTP Fraud Detection"
LABEL org.opencontainers.image.description="Apache Flink fraud detection job for real-time payment processing"
LABEL org.opencontainers.image.vendor="Nexus"

# Install curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy the fraud detection fat JAR
COPY target/fraud-detection-1.0.0.jar /opt/flink/usrlib/fraud-detection.jar

# Copy Flink configuration
COPY src/main/resources/flink-conf.yaml /opt/flink/conf/flink-conf.yaml
COPY src/main/resources/log4j2.xml /opt/flink/conf/log4j2.xml

# Environment variables with production defaults
ENV KAFKA_BOOTSTRAP_SERVERS=kafka:9092
ENV PAYMENTS_TOPIC=nexus.payments.initiated
ENV ALERTS_TOPIC=nexus.fraud.alerts
ENV CRITICAL_ALERTS_TOPIC=nexus.fraud.alerts.critical
ENV CONSUMER_GROUP_ID=nexus-fraud-detection
ENV PARALLELISM=4
ENV CHECKPOINT_INTERVAL_MS=60000
ENV CHECKPOINT_TIMEOUT_MS=120000
ENV MIN_PAUSE_BETWEEN_CHECKPOINTS_MS=30000
ENV VELOCITY_TX_THRESHOLD=10
ENV VELOCITY_AMOUNT_THRESHOLD=100000.0
ENV SMURFING_THRESHOLD=10000.0
ENV SMURFING_WINDOW_MINUTES=60
ENV MAX_TRAVEL_SPEED_KMH=1000.0
ENV AMOUNT_ANOMALY_ZSCORE=3.0

# Health check via Flink REST API
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8081/overview || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["standalone-job", "--job-classname", "com.nexus.rtp.fraud.FraudDetectionJob"]
