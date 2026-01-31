package com.nexus.rtp.fraud;

import com.nexus.rtp.fraud.config.FlinkConfig;
import com.nexus.rtp.fraud.functions.*;
import com.nexus.rtp.fraud.model.PaymentEvent;
import com.nexus.rtp.fraud.model.FraudAlert;
import com.nexus.rtp.fraud.patterns.SmurfingPattern;
import com.nexus.rtp.fraud.patterns.VelocityPattern;
import com.nexus.rtp.fraud.serde.PaymentEventDeserializer;
import com.nexus.rtp.fraud.serde.FraudAlertSerializer;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.cep.CEP;
import org.apache.flink.cep.PatternStream;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.KeyedStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.SlidingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;

/**
 * Main Flink job for real-time fraud detection in the Nexus payment network.
 * 
 * Implements multiple fraud detection strategies:
 * 1. Velocity-based detection: Monitors transaction frequency and amounts
 * 2. Smurfing detection: Identifies structuring patterns to evade thresholds
 * 3. Geographic anomaly: Detects impossible travel or unusual geo patterns
 * 4. Behavioral analysis: ML-based anomaly detection
 */
public class FraudDetectionJob {
    
    private static final Logger LOG = LoggerFactory.getLogger(FraudDetectionJob.class);
    
    public static void main(String[] args) throws Exception {
        LOG.info("Starting Nexus RTP Fraud Detection Job");
        
        // Load configuration
        FlinkConfig config = FlinkConfig.load();
        
        // Create execution environment
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        
        // Configure checkpointing for exactly-once semantics
        env.enableCheckpointing(config.getCheckpointInterval());
        env.getCheckpointConfig().setCheckpointTimeout(config.getCheckpointTimeout());
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(config.getMinPauseBetweenCheckpoints());
        env.getCheckpointConfig().setMaxConcurrentCheckpoints(1);
        
        // Set parallelism
        env.setParallelism(config.getParallelism());
        
        // Create Kafka source for payment events
        KafkaSource<PaymentEvent> kafkaSource = KafkaSource.<PaymentEvent>builder()
                .setBootstrapServers(config.getKafkaBootstrapServers())
                .setTopics(config.getPaymentsTopic())
                .setGroupId(config.getConsumerGroupId())
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new PaymentEventDeserializer())
                .build();
        
        // Create watermark strategy with bounded out-of-orderness
        WatermarkStrategy<PaymentEvent> watermarkStrategy = WatermarkStrategy
                .<PaymentEvent>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                .withTimestampAssigner((event, timestamp) -> event.getTimestamp().toEpochMilli())
                .withIdleness(Duration.ofMinutes(1));
        
        // Create payment event stream
        DataStream<PaymentEvent> paymentStream = env
                .fromSource(kafkaSource, watermarkStrategy, "Kafka Payment Events")
                .name("Payment Events Source");
        
        // Key by debtor account for account-level fraud detection
        KeyedStream<PaymentEvent, String> keyedByDebtor = paymentStream
                .keyBy(PaymentEvent::getDebtorAccountId);
        
        // =======================================================================
        // Strategy 1: Velocity-Based Detection
        // Detect unusually high transaction frequency or amounts
        // =======================================================================
        SingleOutputStreamOperator<FraudAlert> velocityAlerts = keyedByDebtor
                .window(SlidingEventTimeWindows.of(Time.minutes(5), Time.minutes(1)))
                .aggregate(new VelocityAggregator(), new VelocityWindowFunction())
                .filter(alert -> alert != null)
                .name("Velocity Detection");
        
        // =======================================================================
        // Strategy 2: Smurfing Detection (CEP)
        // Detect multiple small transactions that together exceed thresholds
        // =======================================================================
        PatternStream<PaymentEvent> smurfingPatternStream = CEP.pattern(
                keyedByDebtor,
                SmurfingPattern.create(config.getSmurfingThreshold(), config.getSmurfingWindow())
        );
        
        DataStream<FraudAlert> smurfingAlerts = smurfingPatternStream
                .process(new SmurfingPatternProcessor())
                .name("Smurfing Detection");
        
        // =======================================================================
        // Strategy 3: Geographic Anomaly Detection
        // Detect impossible travel or unusual location patterns
        // =======================================================================
        SingleOutputStreamOperator<FraudAlert> geoAlerts = keyedByDebtor
                .process(new GeoAnomalyDetector(config.getMaxTravelSpeedKmh()))
                .name("Geo Anomaly Detection");
        
        // =======================================================================
        // Strategy 4: Amount Anomaly Detection
        // Detect transactions significantly outside normal patterns
        // =======================================================================
        SingleOutputStreamOperator<FraudAlert> amountAlerts = keyedByDebtor
                .window(SlidingEventTimeWindows.of(Time.days(30), Time.hours(1)))
                .process(new AmountAnomalyDetector())
                .name("Amount Anomaly Detection");
        
        // =======================================================================
        // Merge all alert streams
        // =======================================================================
        DataStream<FraudAlert> allAlerts = velocityAlerts
                .union(smurfingAlerts)
                .union(geoAlerts)
                .union(amountAlerts);
        
        // Deduplicate and enrich alerts
        DataStream<FraudAlert> enrichedAlerts = allAlerts
                .keyBy(FraudAlert::getTransactionId)
                .process(new AlertDeduplicator())
                .name("Alert Deduplication");
        
        // Create Kafka sink for fraud alerts
        KafkaSink<FraudAlert> alertSink = KafkaSink.<FraudAlert>builder()
                .setBootstrapServers(config.getKafkaBootstrapServers())
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic(config.getAlertsTopic())
                        .setValueSerializationSchema(new FraudAlertSerializer())
                        .build())
                .build();
        
        enrichedAlerts.sinkTo(alertSink).name("Fraud Alerts Sink");
        
        // Also sink high-severity alerts to a separate topic
        enrichedAlerts
                .filter(alert -> alert.getSeverity().equals("HIGH") || alert.getSeverity().equals("CRITICAL"))
                .sinkTo(KafkaSink.<FraudAlert>builder()
                        .setBootstrapServers(config.getKafkaBootstrapServers())
                        .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                                .setTopic(config.getCriticalAlertsTopic())
                                .setValueSerializationSchema(new FraudAlertSerializer())
                                .build())
                        .build())
                .name("Critical Alerts Sink");
        
        // Execute the job
        env.execute("Nexus RTP Fraud Detection");
    }
}
