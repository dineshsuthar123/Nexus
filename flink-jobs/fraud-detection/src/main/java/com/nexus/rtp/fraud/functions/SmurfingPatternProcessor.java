package com.nexus.rtp.fraud.functions;

import com.nexus.rtp.fraud.model.FraudAlert;
import com.nexus.rtp.fraud.model.PaymentEvent;
import org.apache.flink.cep.functions.PatternProcessFunction;
import org.apache.flink.util.Collector;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Processes smurfing pattern matches and generates fraud alerts.
 */
public class SmurfingPatternProcessor extends PatternProcessFunction<PaymentEvent, FraudAlert> {
    
    private static final BigDecimal THRESHOLD = new BigDecimal("10000");
    
    @Override
    public void processMatch(
            Map<String, List<PaymentEvent>> match,
            Context ctx,
            Collector<FraudAlert> out
    ) {
        // Collect all matched transactions
        List<PaymentEvent> allTransactions = new ArrayList<>();
        
        // Add first transaction
        List<PaymentEvent> first = match.get("first");
        if (first != null) {
            allTransactions.addAll(first);
        }
        
        // Add middle transactions
        List<PaymentEvent> middle = match.get("middle");
        if (middle != null) {
            allTransactions.addAll(middle);
        }
        
        // Add last transaction
        List<PaymentEvent> last = match.get("last");
        if (last != null) {
            allTransactions.addAll(last);
        }
        
        if (allTransactions.isEmpty()) {
            return;
        }
        
        // Calculate total amount
        BigDecimal totalAmount = allTransactions.stream()
                .map(PaymentEvent::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        // Calculate fraud score based on:
        // 1. How many transactions (more = more suspicious)
        // 2. How close each transaction is to threshold
        // 3. Total amount relative to threshold
        double txCountFactor = Math.min(1.0, allTransactions.size() / 10.0);
        double amountFactor = Math.min(1.0, totalAmount.divide(THRESHOLD.multiply(new BigDecimal("2")), 2, java.math.RoundingMode.HALF_UP).doubleValue());
        
        // Check for suspicious patterns
        double avgAmount = totalAmount.divide(
                new BigDecimal(allTransactions.size()), 2, java.math.RoundingMode.HALF_UP
        ).doubleValue();
        
        // Are amounts suspiciously similar? (indicator of automated structuring)
        double variance = calculateVariance(allTransactions, avgAmount);
        double varianceFactor = variance < 100 ? 0.3 : 0.0; // Low variance is suspicious
        
        double score = (txCountFactor * 0.3) + (amountFactor * 0.4) + varianceFactor + 0.3;
        score = Math.min(1.0, score);
        
        // Generate alert
        FraudAlert alert = FraudAlert.createSmurfingAlert(
                allTransactions,
                totalAmount,
                THRESHOLD,
                score
        );
        
        out.collect(alert);
    }
    
    private double calculateVariance(List<PaymentEvent> transactions, double mean) {
        if (transactions.size() < 2) {
            return 0.0;
        }
        
        double sumSquaredDiff = 0.0;
        for (PaymentEvent tx : transactions) {
            double diff = tx.getAmountAsDouble() - mean;
            sumSquaredDiff += diff * diff;
        }
        
        return sumSquaredDiff / transactions.size();
    }
}
