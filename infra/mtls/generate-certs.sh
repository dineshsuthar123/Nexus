#!/bin/bash
# Generate mTLS certificates for local development
# Uses cfssl for certificate generation

set -e

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

echo "=== Generating mTLS Certificates for Nexus RTP Platform ==="

# Check for cfssl
if ! command -v cfssl &> /dev/null; then
    echo "cfssl not found. Installing..."
    go install github.com/cloudflare/cfssl/cmd/cfssl@latest
    go install github.com/cloudflare/cfssl/cmd/cfssljson@latest
fi

# CA Configuration
cat > "$CERT_DIR/ca-config.json" <<EOF
{
  "signing": {
    "default": {
      "expiry": "87600h"
    },
    "profiles": {
      "server": {
        "usages": ["signing", "key encipherment", "server auth"],
        "expiry": "8760h"
      },
      "client": {
        "usages": ["signing", "key encipherment", "client auth"],
        "expiry": "8760h"
      },
      "peer": {
        "usages": ["signing", "key encipherment", "server auth", "client auth"],
        "expiry": "8760h"
      }
    }
  }
}
EOF

# CA CSR
cat > "$CERT_DIR/ca-csr.json" <<EOF
{
  "CN": "Nexus RTP CA",
  "key": {
    "algo": "ecdsa",
    "size": 256
  },
  "names": [
    {
      "C": "US",
      "ST": "California",
      "L": "San Francisco",
      "O": "Nexus RTP",
      "OU": "Infrastructure"
    }
  ],
  "ca": {
    "expiry": "87600h"
  }
}
EOF

# Generate CA
echo "Generating CA certificate..."
cfssl gencert -initca "$CERT_DIR/ca-csr.json" | cfssljson -bare "$CERT_DIR/ca"

# Function to generate service certificate
generate_service_cert() {
    local service_name=$1
    local dns_names=$2
    
    echo "Generating certificate for $service_name..."
    
    cat > "$CERT_DIR/${service_name}-csr.json" <<EOF
{
  "CN": "${service_name}",
  "key": {
    "algo": "ecdsa",
    "size": 256
  },
  "names": [
    {
      "C": "US",
      "ST": "California",
      "L": "San Francisco",
      "O": "Nexus RTP",
      "OU": "${service_name}"
    }
  ],
  "hosts": [
    "127.0.0.1",
    "localhost",
    ${dns_names}
  ]
}
EOF

    cfssl gencert \
        -ca="$CERT_DIR/ca.pem" \
        -ca-key="$CERT_DIR/ca-key.pem" \
        -config="$CERT_DIR/ca-config.json" \
        -profile=peer \
        "$CERT_DIR/${service_name}-csr.json" | cfssljson -bare "$CERT_DIR/${service_name}"
}

# Generate service certificates
generate_service_cert "payment-service" '"payment-service", "payment-service.nexus-system", "payment-service.nexus-system.svc.cluster.local"'
generate_service_cert "account-service" '"account-service", "account-service.nexus-system", "account-service.nexus-system.svc.cluster.local"'
generate_service_cert "reconciliation-service" '"reconciliation-service", "reconciliation-service.nexus-system", "reconciliation-service.nexus-system.svc.cluster.local"'
generate_service_cert "cockroachdb" '"cockroachdb", "cockroachdb-1", "cockroachdb-2", "cockroachdb-3", "*.cockroachdb.nexus-system"'
generate_service_cert "kafka" '"kafka", "kafka-1", "kafka-2", "kafka-3", "*.kafka.nexus-system"'
generate_service_cert "redis" '"redis", "redis.nexus-system"'

# Generate client certificate for services
echo "Generating client certificate..."
cat > "$CERT_DIR/client-csr.json" <<EOF
{
  "CN": "nexus-client",
  "key": {
    "algo": "ecdsa",
    "size": 256
  },
  "names": [
    {
      "C": "US",
      "ST": "California",
      "L": "San Francisco",
      "O": "Nexus RTP",
      "OU": "Client"
    }
  ]
}
EOF

cfssl gencert \
    -ca="$CERT_DIR/ca.pem" \
    -ca-key="$CERT_DIR/ca-key.pem" \
    -config="$CERT_DIR/ca-config.json" \
    -profile=client \
    "$CERT_DIR/client-csr.json" | cfssljson -bare "$CERT_DIR/client"

# Clean up CSR JSON files
rm -f "$CERT_DIR"/*.json

echo ""
echo "=== Certificate Generation Complete ==="
echo "Certificates generated in: $CERT_DIR"
echo ""
echo "Files:"
ls -la "$CERT_DIR"/*.pem
echo ""
echo "To verify certificates:"
echo "  openssl x509 -in $CERT_DIR/ca.pem -text -noout"
echo "  openssl verify -CAfile $CERT_DIR/ca.pem $CERT_DIR/payment-service.pem"
