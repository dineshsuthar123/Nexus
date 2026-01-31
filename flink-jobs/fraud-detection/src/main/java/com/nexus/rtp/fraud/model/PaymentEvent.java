package com.nexus.rtp.fraud.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Represents a payment event received from Kafka.
 * Maps to the outbox event structure from payment-service.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PaymentEvent implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    @JsonProperty("transactionId")
    private String transactionId;
    
    @JsonProperty("uetr")
    private String uetr;
    
    @JsonProperty("messageId")
    private String messageId;
    
    @JsonProperty("debtorAccountId")
    private String debtorAccountId;
    
    @JsonProperty("creditorAccountId")
    private String creditorAccountId;
    
    @JsonProperty("debtorName")
    private String debtorName;
    
    @JsonProperty("creditorName")
    private String creditorName;
    
    @JsonProperty("amount")
    private BigDecimal amount;
    
    @JsonProperty("currency")
    private String currency;
    
    @JsonProperty("status")
    private String status;
    
    @JsonProperty("sanctionsStatus")
    private String sanctionsStatus;
    
    @JsonProperty("timestamp")
    private Instant timestamp;
    
    @JsonProperty("debtorCountry")
    private String debtorCountry;
    
    @JsonProperty("creditorCountry")
    private String creditorCountry;
    
    @JsonProperty("debtorLatitude")
    private Double debtorLatitude;
    
    @JsonProperty("debtorLongitude")
    private Double debtorLongitude;
    
    @JsonProperty("deviceFingerprint")
    private String deviceFingerprint;
    
    @JsonProperty("ipAddress")
    private String ipAddress;
    
    @JsonProperty("channel")
    private String channel;
    
    /**
     * Check if this is a high-value transaction.
     */
    public boolean isHighValue(BigDecimal threshold) {
        return amount != null && amount.compareTo(threshold) > 0;
    }
    
    /**
     * Check if this is a cross-border transaction.
     */
    public boolean isCrossBorder() {
        return debtorCountry != null && creditorCountry != null 
               && !debtorCountry.equals(creditorCountry);
    }
    
    /**
     * Get the amount as double for calculations.
     */
    public double getAmountAsDouble() {
        return amount != null ? amount.doubleValue() : 0.0;
    }
}
