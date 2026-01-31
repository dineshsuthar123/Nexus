package com.nexus.rtp.fraud.functions;

import com.nexus.rtp.fraud.model.FraudAlert;
import com.nexus.rtp.fraud.model.PaymentEvent;
import org.apache.flink.api.common.functions.AggregateFunction;

import java.math.BigDecimal;

/**
 * Aggregate function for velocity-based fraud detection.
 * Tracks transaction count and total amount within a window.
 */
public class VelocityAggregator implements AggregateFunction<PaymentEvent, VelocityAccumulator, VelocityResult> {
    
    @Override
    public VelocityAccumulator createAccumulator() {
        return new VelocityAccumulator();
    }
    
    @Override
    public VelocityAccumulator add(PaymentEvent event, VelocityAccumulator acc) {
        acc.count++;
        acc.totalAmount = acc.totalAmount.add(event.getAmount());
        acc.lastEvent = event;
        
        if (acc.firstEvent == null) {
            acc.firstEvent = event;
        }
        
        return acc;
    }
    
    @Override
    public VelocityResult getResult(VelocityAccumulator acc) {
        return new VelocityResult(
                acc.count,
                acc.totalAmount,
                acc.firstEvent,
                acc.lastEvent
        );
    }
    
    @Override
    public VelocityAccumulator merge(VelocityAccumulator a, VelocityAccumulator b) {
        VelocityAccumulator merged = new VelocityAccumulator();
        merged.count = a.count + b.count;
        merged.totalAmount = a.totalAmount.add(b.totalAmount);
        
        // Keep the earliest first event and latest last event
        if (a.firstEvent != null && b.firstEvent != null) {
            merged.firstEvent = a.firstEvent.getTimestamp().isBefore(b.firstEvent.getTimestamp()) 
                    ? a.firstEvent : b.firstEvent;
            merged.lastEvent = a.lastEvent.getTimestamp().isAfter(b.lastEvent.getTimestamp()) 
                    ? a.lastEvent : b.lastEvent;
        } else {
            merged.firstEvent = a.firstEvent != null ? a.firstEvent : b.firstEvent;
            merged.lastEvent = a.lastEvent != null ? a.lastEvent : b.lastEvent;
        }
        
        return merged;
    }
}

/**
 * Accumulator for velocity aggregation.
 */
class VelocityAccumulator {
    int count = 0;
    BigDecimal totalAmount = BigDecimal.ZERO;
    PaymentEvent firstEvent;
    PaymentEvent lastEvent;
}

/**
 * Result of velocity aggregation.
 */
class VelocityResult {
    final int count;
    final BigDecimal totalAmount;
    final PaymentEvent firstEvent;
    final PaymentEvent lastEvent;
    
    VelocityResult(int count, BigDecimal totalAmount, PaymentEvent firstEvent, PaymentEvent lastEvent) {
        this.count = count;
        this.totalAmount = totalAmount;
        this.firstEvent = firstEvent;
        this.lastEvent = lastEvent;
    }
}
