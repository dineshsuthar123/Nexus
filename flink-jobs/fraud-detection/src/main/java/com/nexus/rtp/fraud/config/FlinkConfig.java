package com.nexus.rtp.fraud.config;

import java.io.Serializable;

/**
 * Configuration for the Flink fraud detection job.
 */
public class FlinkConfig implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    // Kafka configuration
    private String kafkaBootstrapServers;
    private String paymentsTopic;
    private String alertsTopic;
    private String criticalAlertsTopic;
    private String consumerGroupId;
    
    // Flink configuration
    private int parallelism;
    private long checkpointInterval;
    private long checkpointTimeout;
    private long minPauseBetweenCheckpoints;
    
    // Fraud detection thresholds
    private int velocityTransactionThreshold;
    private double velocityAmountThreshold;
    private double smurfingThreshold;
    private int smurfingWindow;
    private double maxTravelSpeedKmh;
    private double amountAnomalyZScoreThreshold;
    
    /**
     * Load configuration from environment variables with defaults.
     */
    public static FlinkConfig load() {
        FlinkConfig config = new FlinkConfig();
        
        // Kafka
        config.kafkaBootstrapServers = getEnv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092");
        config.paymentsTopic = getEnv("PAYMENTS_TOPIC", "nexus.payments.initiated");
        config.alertsTopic = getEnv("ALERTS_TOPIC", "nexus.fraud.alerts");
        config.criticalAlertsTopic = getEnv("CRITICAL_ALERTS_TOPIC", "nexus.fraud.alerts.critical");
        config.consumerGroupId = getEnv("CONSUMER_GROUP_ID", "nexus-fraud-detection");
        
        // Flink
        config.parallelism = getEnvInt("PARALLELISM", 4);
        config.checkpointInterval = getEnvLong("CHECKPOINT_INTERVAL_MS", 60000L);
        config.checkpointTimeout = getEnvLong("CHECKPOINT_TIMEOUT_MS", 120000L);
        config.minPauseBetweenCheckpoints = getEnvLong("MIN_PAUSE_BETWEEN_CHECKPOINTS_MS", 30000L);
        
        // Fraud detection
        config.velocityTransactionThreshold = getEnvInt("VELOCITY_TX_THRESHOLD", 10);
        config.velocityAmountThreshold = getEnvDouble("VELOCITY_AMOUNT_THRESHOLD", 100000.0);
        config.smurfingThreshold = getEnvDouble("SMURFING_THRESHOLD", 10000.0);
        config.smurfingWindow = getEnvInt("SMURFING_WINDOW_MINUTES", 60);
        config.maxTravelSpeedKmh = getEnvDouble("MAX_TRAVEL_SPEED_KMH", 1000.0); // ~600mph (fast jet)
        config.amountAnomalyZScoreThreshold = getEnvDouble("AMOUNT_ANOMALY_ZSCORE", 3.0);
        
        return config;
    }
    
    private static String getEnv(String name, String defaultValue) {
        String value = System.getenv(name);
        return value != null ? value : defaultValue;
    }
    
    private static int getEnvInt(String name, int defaultValue) {
        String value = System.getenv(name);
        return value != null ? Integer.parseInt(value) : defaultValue;
    }
    
    private static long getEnvLong(String name, long defaultValue) {
        String value = System.getenv(name);
        return value != null ? Long.parseLong(value) : defaultValue;
    }
    
    private static double getEnvDouble(String name, double defaultValue) {
        String value = System.getenv(name);
        return value != null ? Double.parseDouble(value) : defaultValue;
    }
    
    // Getters
    public String getKafkaBootstrapServers() { return kafkaBootstrapServers; }
    public String getPaymentsTopic() { return paymentsTopic; }
    public String getAlertsTopic() { return alertsTopic; }
    public String getCriticalAlertsTopic() { return criticalAlertsTopic; }
    public String getConsumerGroupId() { return consumerGroupId; }
    public int getParallelism() { return parallelism; }
    public long getCheckpointInterval() { return checkpointInterval; }
    public long getCheckpointTimeout() { return checkpointTimeout; }
    public long getMinPauseBetweenCheckpoints() { return minPauseBetweenCheckpoints; }
    public int getVelocityTransactionThreshold() { return velocityTransactionThreshold; }
    public double getVelocityAmountThreshold() { return velocityAmountThreshold; }
    public double getSmurfingThreshold() { return smurfingThreshold; }
    public int getSmurfingWindow() { return smurfingWindow; }
    public double getMaxTravelSpeedKmh() { return maxTravelSpeedKmh; }
    public double getAmountAnomalyZScoreThreshold() { return amountAnomalyZScoreThreshold; }
}
