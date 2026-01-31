package com.nexus.rtp.fraud.functions;

import com.nexus.rtp.fraud.model.FraudAlert;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

import java.time.Duration;
import java.time.Instant;

/**
 * Deduplicates fraud alerts within a time window.
 * Prevents multiple alerts for the same transaction.
 */
public class AlertDeduplicator extends KeyedProcessFunction<String, FraudAlert, FraudAlert> {
    
    // Deduplication window
    private static final long DEDUP_WINDOW_MS = 60000; // 1 minute
    
    // State: last alert timestamp for this transaction
    private ValueState<Instant> lastAlertState;
    
    @Override
    public void open(Configuration parameters) {
        ValueStateDescriptor<Instant> descriptor = new ValueStateDescriptor<>(
                "lastAlert",
                TypeInformation.of(Instant.class)
        );
        lastAlertState = getRuntimeContext().getState(descriptor);
    }
    
    @Override
    public void processElement(
            FraudAlert alert,
            Context ctx,
            Collector<FraudAlert> out
    ) throws Exception {
        Instant lastAlert = lastAlertState.value();
        Instant now = Instant.now();
        
        // Check if we've recently sent an alert for this transaction
        if (lastAlert != null) {
            Duration sinceLastAlert = Duration.between(lastAlert, now);
            if (sinceLastAlert.toMillis() < DEDUP_WINDOW_MS) {
                // Skip duplicate
                return;
            }
        }
        
        // Update state
        lastAlertState.update(now);
        
        // Register timer to clear state after dedup window
        ctx.timerService().registerProcessingTimeTimer(
                ctx.timerService().currentProcessingTime() + DEDUP_WINDOW_MS + 1000
        );
        
        // Emit alert
        out.collect(alert);
    }
    
    @Override
    public void onTimer(
            long timestamp,
            OnTimerContext ctx,
            Collector<FraudAlert> out
    ) throws Exception {
        // Clear old state
        lastAlertState.clear();
    }
}
