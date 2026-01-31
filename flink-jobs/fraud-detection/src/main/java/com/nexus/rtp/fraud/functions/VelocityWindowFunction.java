package com.nexus.rtp.fraud.functions;

import com.nexus.rtp.fraud.model.FraudAlert;
import org.apache.flink.streaming.api.functions.windowing.WindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.math.BigDecimal;

/**
 * Window function that evaluates velocity aggregation results
 * and generates fraud alerts when thresholds are exceeded.
 */
public class VelocityWindowFunction implements WindowFunction<VelocityResult, FraudAlert, String, TimeWindow> {
    
    // Thresholds for velocity detection
    private static final int TRANSACTION_COUNT_THRESHOLD = 10;
    private static final BigDecimal AMOUNT_THRESHOLD = new BigDecimal("100000");
    
    @Override
    public void apply(
            String accountId,
            TimeWindow window,
            Iterable<VelocityResult> input,
            Collector<FraudAlert> out
    ) {
        for (VelocityResult result : input) {
            if (result.lastEvent == null) {
                continue;
            }
            
            // Check if thresholds are exceeded
            boolean countExceeded = result.count >= TRANSACTION_COUNT_THRESHOLD;
            boolean amountExceeded = result.totalAmount.compareTo(AMOUNT_THRESHOLD) >= 0;
            
            if (countExceeded || amountExceeded) {
                // Calculate fraud score based on how much thresholds are exceeded
                double countScore = countExceeded 
                        ? Math.min(1.0, (double) result.count / TRANSACTION_COUNT_THRESHOLD / 2.0) 
                        : 0.0;
                double amountScore = amountExceeded 
                        ? Math.min(1.0, result.totalAmount.divide(AMOUNT_THRESHOLD, 2, java.math.RoundingMode.HALF_UP).doubleValue() / 2.0)
                        : 0.0;
                double score = Math.max(countScore, amountScore);
                
                // Generate alert
                FraudAlert alert = FraudAlert.createVelocityAlert(
                        result.lastEvent,
                        result.count,
                        result.totalAmount,
                        score
                );
                
                out.collect(alert);
            }
        }
    }
}
