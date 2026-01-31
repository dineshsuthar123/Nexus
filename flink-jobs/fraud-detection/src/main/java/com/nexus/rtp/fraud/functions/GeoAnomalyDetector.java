package com.nexus.rtp.fraud.functions;

import com.nexus.rtp.fraud.model.FraudAlert;
import com.nexus.rtp.fraud.model.PaymentEvent;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.Serializable;
import java.time.Duration;
import java.time.Instant;

/**
 * Detects geographic anomalies (impossible travel) between transactions.
 * 
 * Impossible travel occurs when transactions are made from locations that
 * would require faster-than-possible travel between them.
 */
public class GeoAnomalyDetector extends KeyedProcessFunction<String, PaymentEvent, FraudAlert> {
    
    private static final Logger LOG = LoggerFactory.getLogger(GeoAnomalyDetector.class);
    
    // Maximum travel speed in km/h (default: 1000 km/h for commercial jets)
    private final double maxTravelSpeedKmh;
    
    // State: last known location and timestamp
    private ValueState<LocationState> lastLocationState;
    
    public GeoAnomalyDetector(double maxTravelSpeedKmh) {
        this.maxTravelSpeedKmh = maxTravelSpeedKmh;
    }
    
    @Override
    public void open(Configuration parameters) {
        ValueStateDescriptor<LocationState> descriptor = new ValueStateDescriptor<>(
                "lastLocation",
                TypeInformation.of(LocationState.class)
        );
        lastLocationState = getRuntimeContext().getState(descriptor);
    }
    
    @Override
    public void processElement(
            PaymentEvent event,
            Context ctx,
            Collector<FraudAlert> out
    ) throws Exception {
        // Skip if no geo data
        if (event.getDebtorLatitude() == null || event.getDebtorLongitude() == null) {
            return;
        }
        
        LocationState lastLocation = lastLocationState.value();
        
        if (lastLocation != null) {
            // Calculate distance between locations
            double distanceKm = haversineDistance(
                    lastLocation.latitude, lastLocation.longitude,
                    event.getDebtorLatitude(), event.getDebtorLongitude()
            );
            
            // Calculate time elapsed
            Duration elapsed = Duration.between(lastLocation.timestamp, event.getTimestamp());
            double hoursElapsed = elapsed.toMinutes() / 60.0;
            
            // Calculate required speed
            if (hoursElapsed > 0 && distanceKm > 50) { // Only check if > 50km
                double requiredSpeedKmh = distanceKm / hoursElapsed;
                
                if (requiredSpeedKmh > maxTravelSpeedKmh) {
                    LOG.info("Impossible travel detected for account {}: {} km in {} hours = {} km/h",
                            event.getDebtorAccountId(), distanceKm, hoursElapsed, requiredSpeedKmh);
                    
                    // Create previous event for alert
                    PaymentEvent previousEvent = PaymentEvent.builder()
                            .transactionId(lastLocation.transactionId)
                            .debtorLatitude(lastLocation.latitude)
                            .debtorLongitude(lastLocation.longitude)
                            .debtorCountry(lastLocation.country)
                            .timestamp(lastLocation.timestamp)
                            .build();
                    
                    FraudAlert alert = FraudAlert.createGeoAnomalyAlert(
                            event,
                            previousEvent,
                            distanceKm,
                            hoursElapsed,
                            requiredSpeedKmh
                    );
                    
                    out.collect(alert);
                }
            }
        }
        
        // Update state with current location
        LocationState newState = new LocationState();
        newState.transactionId = event.getTransactionId();
        newState.latitude = event.getDebtorLatitude();
        newState.longitude = event.getDebtorLongitude();
        newState.country = event.getDebtorCountry();
        newState.timestamp = event.getTimestamp();
        
        lastLocationState.update(newState);
    }
    
    /**
     * Calculate distance between two points using Haversine formula.
     */
    private double haversineDistance(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371.0; // Earth's radius in km
        
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    }
    
    /**
     * State class for tracking last known location.
     */
    public static class LocationState implements Serializable {
        private static final long serialVersionUID = 1L;
        
        String transactionId;
        Double latitude;
        Double longitude;
        String country;
        Instant timestamp;
    }
}
