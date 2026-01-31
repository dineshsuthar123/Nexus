package com.nexus.rtp.fraud.serde;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.nexus.rtp.fraud.model.PaymentEvent;
import org.apache.flink.api.common.serialization.DeserializationSchema;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;

/**
 * Kafka deserializer for PaymentEvent messages.
 */
public class PaymentEventDeserializer implements DeserializationSchema<PaymentEvent> {
    
    private static final Logger LOG = LoggerFactory.getLogger(PaymentEventDeserializer.class);
    private static final long serialVersionUID = 1L;
    
    private transient ObjectMapper objectMapper;
    
    @Override
    public void open(InitializationContext context) {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
    }
    
    @Override
    public PaymentEvent deserialize(byte[] message) throws IOException {
        if (objectMapper == null) {
            objectMapper = new ObjectMapper();
            objectMapper.registerModule(new JavaTimeModule());
        }
        
        try {
            return objectMapper.readValue(message, PaymentEvent.class);
        } catch (IOException e) {
            LOG.error("Failed to deserialize payment event: {}", new String(message), e);
            throw e;
        }
    }
    
    @Override
    public boolean isEndOfStream(PaymentEvent nextElement) {
        return false;
    }
    
    @Override
    public TypeInformation<PaymentEvent> getProducedType() {
        return TypeInformation.of(PaymentEvent.class);
    }
}
