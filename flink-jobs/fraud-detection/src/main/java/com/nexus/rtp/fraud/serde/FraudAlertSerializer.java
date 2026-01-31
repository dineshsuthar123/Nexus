package com.nexus.rtp.fraud.serde;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.nexus.rtp.fraud.model.FraudAlert;
import org.apache.flink.api.common.serialization.SerializationSchema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Kafka serializer for FraudAlert messages.
 */
public class FraudAlertSerializer implements SerializationSchema<FraudAlert> {
    
    private static final Logger LOG = LoggerFactory.getLogger(FraudAlertSerializer.class);
    private static final long serialVersionUID = 1L;
    
    private transient ObjectMapper objectMapper;
    
    @Override
    public void open(InitializationContext context) {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
    }
    
    @Override
    public byte[] serialize(FraudAlert alert) {
        if (objectMapper == null) {
            objectMapper = new ObjectMapper();
            objectMapper.registerModule(new JavaTimeModule());
        }
        
        try {
            return objectMapper.writeValueAsBytes(alert);
        } catch (JsonProcessingException e) {
            LOG.error("Failed to serialize fraud alert: {}", alert, e);
            throw new RuntimeException("Failed to serialize fraud alert", e);
        }
    }
}
