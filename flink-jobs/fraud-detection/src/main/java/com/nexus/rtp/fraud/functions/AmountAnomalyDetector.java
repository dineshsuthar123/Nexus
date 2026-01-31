package com.nexus.rtp.fraud.functions;

import com.nexus.rtp.fraud.model.FraudAlert;
import com.nexus.rtp.fraud.model.PaymentEvent;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Detects transaction amounts that are statistical outliers.
 * Uses z-score analysis over a 30-day window.
 */
public class AmountAnomalyDetector extends ProcessWindowFunction<PaymentEvent, FraudAlert, String, TimeWindow> {
    
    // Minimum transactions needed for statistical analysis
    private static final int MIN_TRANSACTIONS = 10;
    
    // Z-score threshold (3 standard deviations by default)
    private static final double Z_SCORE_THRESHOLD = 3.0;
    
    @Override
    public void process(
            String accountId,
            Context ctx,
            Iterable<PaymentEvent> events,
            Collector<FraudAlert> out
    ) {
        // Collect all transactions
        List<PaymentEvent> transactions = new ArrayList<>();
        for (PaymentEvent event : events) {
            transactions.add(event);
        }
        
        // Need minimum number of transactions for statistical analysis
        if (transactions.size() < MIN_TRANSACTIONS) {
            return;
        }
        
        // Calculate mean
        BigDecimal sum = transactions.stream()
                .map(PaymentEvent::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal mean = sum.divide(
                BigDecimal.valueOf(transactions.size()), 4, RoundingMode.HALF_UP
        );
        
        // Calculate standard deviation
        BigDecimal sumSquaredDiff = BigDecimal.ZERO;
        for (PaymentEvent tx : transactions) {
            BigDecimal diff = tx.getAmount().subtract(mean);
            sumSquaredDiff = sumSquaredDiff.add(diff.multiply(diff));
        }
        double variance = sumSquaredDiff.divide(
                BigDecimal.valueOf(transactions.size()), 4, RoundingMode.HALF_UP
        ).doubleValue();
        double stdDev = Math.sqrt(variance);
        
        // Skip if standard deviation is too small (all amounts are similar)
        if (stdDev < 10.0) {
            return;
        }
        
        BigDecimal stdDevDecimal = BigDecimal.valueOf(stdDev);
        
        // Check each transaction for anomalies
        // Focus on recent transactions (last 10% of window)
        int recentStart = (int) (transactions.size() * 0.9);
        for (int i = recentStart; i < transactions.size(); i++) {
            PaymentEvent event = transactions.get(i);
            
            // Calculate z-score
            double zScore = event.getAmount().subtract(mean)
                    .divide(stdDevDecimal, 4, RoundingMode.HALF_UP)
                    .doubleValue();
            
            // Check if anomalous (both high and low anomalies)
            if (Math.abs(zScore) > Z_SCORE_THRESHOLD) {
                FraudAlert alert = FraudAlert.createAmountAnomalyAlert(
                        event,
                        mean,
                        stdDevDecimal,
                        zScore
                );
                
                out.collect(alert);
            }
        }
    }
}
