package com.nexus.rtp.fraud.patterns;

import com.nexus.rtp.fraud.model.PaymentEvent;
import org.apache.flink.cep.pattern.Pattern;
import org.apache.flink.cep.pattern.conditions.IterativeCondition;
import org.apache.flink.streaming.api.windowing.time.Time;

/**
 * CEP pattern for detecting velocity-based fraud.
 * 
 * Velocity fraud involves making many transactions in a short time
 * to drain an account before fraud can be detected.
 */
public class VelocityPattern {
    
    /**
     * Creates a CEP pattern for rapid successive transactions.
     * 
     * @param maxTransactions Maximum allowed transactions in window
     * @param windowMinutes Time window in minutes
     * @return CEP Pattern for velocity detection
     */
    public static Pattern<PaymentEvent, ?> createRapidFirePattern(int maxTransactions, int windowMinutes) {
        return Pattern.<PaymentEvent>begin("transactions")
                .times(maxTransactions)
                .within(Time.minutes(windowMinutes));
    }
    
    /**
     * Creates a pattern for detecting escalating amounts.
     * Each transaction is larger than the previous.
     */
    public static Pattern<PaymentEvent, ?> createEscalatingAmountPattern(int minTransactions) {
        return Pattern.<PaymentEvent>begin("first")
                .next("escalating")
                .where(new IterativeCondition<PaymentEvent>() {
                    @Override
                    public boolean filter(PaymentEvent event, Context<PaymentEvent> ctx) throws Exception {
                        // Get the previous transaction
                        Iterable<PaymentEvent> previousEvents = ctx.getEventsForPattern("escalating");
                        PaymentEvent lastEvent = null;
                        
                        for (PaymentEvent e : previousEvents) {
                            lastEvent = e;
                        }
                        
                        if (lastEvent == null) {
                            // Compare with first event
                            for (PaymentEvent first : ctx.getEventsForPattern("first")) {
                                return event.getAmount().compareTo(first.getAmount()) > 0;
                            }
                        }
                        
                        return lastEvent != null && 
                               event.getAmount().compareTo(lastEvent.getAmount()) > 0;
                    }
                })
                .timesOrMore(minTransactions - 1)
                .within(Time.hours(1));
    }
    
    /**
     * Creates a pattern for round-amount transactions.
     * Fraudsters often use round amounts for quick entry.
     */
    public static Pattern<PaymentEvent, ?> createRoundAmountPattern(int minCount) {
        return Pattern.<PaymentEvent>begin("round_amounts")
                .where(event -> {
                    // Check if amount is a round number (ends in 00)
                    double amount = event.getAmountAsDouble();
                    return amount >= 100 && amount % 100 == 0;
                })
                .times(minCount)
                .within(Time.minutes(30));
    }
}
