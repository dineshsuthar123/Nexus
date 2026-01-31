#!/bin/bash
# Script to register Debezium connectors with Kafka Connect

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"

echo "=== Nexus Debezium Connector Setup ==="
echo "Connect URL: $CONNECT_URL"

# Wait for Kafka Connect to be ready
echo "Waiting for Kafka Connect to be ready..."
while true; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$CONNECT_URL/")
    if [ "$status" == "200" ]; then
        echo "Kafka Connect is ready!"
        break
    fi
    echo "Waiting... (status: $status)"
    sleep 5
done

# Function to deploy a connector
deploy_connector() {
    local file=$1
    local name=$(jq -r '.name' "$file")
    
    echo ""
    echo "Deploying connector: $name"
    
    # Check if connector exists
    existing=$(curl -s -o /dev/null -w "%{http_code}" "$CONNECT_URL/connectors/$name")
    
    if [ "$existing" == "200" ]; then
        echo "Connector $name already exists. Updating..."
        response=$(curl -s -X PUT \
            -H "Content-Type: application/json" \
            -d @"$file" \
            "$CONNECT_URL/connectors/$name/config")
    else
        echo "Creating new connector: $name"
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -d @"$file" \
            "$CONNECT_URL/connectors")
    fi
    
    echo "Response: $response"
    
    # Check status
    sleep 2
    status=$(curl -s "$CONNECT_URL/connectors/$name/status")
    echo "Status: $status"
}

# Deploy connectors
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "=== Deploying Outbox Connector ==="
deploy_connector "$SCRIPT_DIR/connectors/outbox-connector.json"

echo ""
echo "=== Deploying Transactions Connector ==="
deploy_connector "$SCRIPT_DIR/connectors/transactions-connector.json"

echo ""
echo "=== All connectors deployed ==="

# List all connectors
echo ""
echo "Registered connectors:"
curl -s "$CONNECT_URL/connectors" | jq .

echo ""
echo "Done!"
