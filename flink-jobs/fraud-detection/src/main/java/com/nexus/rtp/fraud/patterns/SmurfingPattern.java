package com.nexus.rtp.fraud.patterns;

import com.nexus.rtp.fraud.model.PaymentEvent;
import org.apache.flink.cep.pattern.Pattern;
import org.apache.flink.cep.pattern.conditions.IterativeCondition;
import org.apache.flink.cep.pattern.conditions.SimpleCondition;
import org.apache.flink.streaming.api.windowing.time.Time;

import java.math.BigDecimal;

/**
 * CEP pattern for detecting smurfing (structuring) behavior.
 * 
 * Smurfing is the practice of making multiple small transactions
 * to avoid reporting thresholds (e.g., $10,000 in the US).
 */
public class SmurfingPattern {
    
    /**
     * Creates a CEP pattern for smurfing detection.
     * 
     * Pattern: 3+ transactions within windowMinutes where:
     * - Each transaction is below the threshold
     * - Total amount exceeds the threshold
     * 
     * @param threshold The reporting threshold to detect evasion
     * @param windowMinutes Time window for pattern matching
     * @return CEP Pattern for smurfing detection
     */
    public static Pattern<PaymentEvent, ?> create(double threshold, int windowMinutes) {
        BigDecimal thresholdDecimal = BigDecimal.valueOf(threshold);
        
        return Pattern.<PaymentEvent>begin("first")
                // First transaction: below threshold
                .where(new SimpleCondition<PaymentEvent>() {
                    @Override
                    public boolean filter(PaymentEvent event) {
                        return event.getAmount().compareTo(thresholdDecimal) < 0
                               && event.getAmount().compareTo(BigDecimal.valueOf(100)) > 0; // Min $100
                    }
                })
                // Followed by more transactions below threshold
                .followedBy("middle")
                .where(new SimpleCondition<PaymentEvent>() {
                    @Override
                    public boolean filter(PaymentEvent event) {
                        return event.getAmount().compareTo(thresholdDecimal) < 0
                               && event.getAmount().compareTo(BigDecimal.valueOf(100)) > 0;
                    }
                })
                .oneOrMore()
                .greedy()
                // Final transaction that makes total exceed threshold
                .followedBy("last")
                .where(new IterativeCondition<PaymentEvent>() {
                    @Override
                    public boolean filter(PaymentEvent event, Context<PaymentEvent> ctx) throws Exception {
                        // Check if this transaction is below threshold
                        if (event.getAmount().compareTo(thresholdDecimal) >= 0) {
                            return false;
                        }
                        
                        // Calculate total including all matched transactions
                        BigDecimal total = event.getAmount();
                        
                        // Add first transaction
                        for (PaymentEvent first : ctx.getEventsForPattern("first")) {
                            total = total.add(first.getAmount());
                        }
                        
                        // Add middle transactions
                        for (PaymentEvent middle : ctx.getEventsForPattern("middle")) {
                            total = total.add(middle.getAmount());
                        }
                        
                        // Pattern matches if total exceeds threshold
                        return total.compareTo(thresholdDecimal) >= 0;
                    }
                })
                .within(Time.minutes(windowMinutes));
    }
}
