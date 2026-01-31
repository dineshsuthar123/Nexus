#!/bin/bash
# Setup script for Kind cluster with local registry

set -e

CLUSTER_NAME="nexus-rtp"
REGISTRY_NAME="kind-registry"
REGISTRY_PORT="5001"

echo "=== Nexus RTP Kind Cluster Setup ==="

# 1. Create local container registry if not exists
if [ "$(docker inspect -f '{{.State.Running}}' "${REGISTRY_NAME}" 2>/dev/null || true)" != 'true' ]; then
    echo "Creating local container registry..."
    docker run -d --restart=always -p "127.0.0.1:${REGISTRY_PORT}:5000" --name "${REGISTRY_NAME}" registry:2
else
    echo "Registry already running"
fi

# 2. Create Kind cluster if not exists
if ! kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo "Creating Kind cluster: ${CLUSTER_NAME}"
    kind create cluster --config kind-config.yaml
else
    echo "Cluster ${CLUSTER_NAME} already exists"
fi

# 3. Connect registry to cluster network
if [ "$(docker inspect -f='{{json .NetworkSettings.Networks.kind}}' "${REGISTRY_NAME}")" = 'null' ]; then
    echo "Connecting registry to Kind network..."
    docker network connect "kind" "${REGISTRY_NAME}" || true
fi

# 4. Configure registry for cluster
echo "Configuring cluster to use local registry..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:${REGISTRY_PORT}"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
EOF

# 5. Create namespaces
echo "Creating namespaces..."
kubectl create namespace nexus-system --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace nexus-data --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace nexus-monitoring --dry-run=client -o yaml | kubectl apply -f -

# 6. Install Nginx Ingress Controller
echo "Installing Nginx Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

echo "Waiting for ingress controller..."
kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=90s

# 7. Install metrics-server for HPA
echo "Installing metrics-server..."
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type='json' \
    -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value": "--kubelet-insecure-tls"}]'

echo ""
echo "=== Kind cluster setup complete! ==="
echo ""
echo "Cluster: ${CLUSTER_NAME}"
echo "Registry: localhost:${REGISTRY_PORT}"
echo ""
echo "To push images to the registry:"
echo "  docker tag myimage localhost:${REGISTRY_PORT}/myimage"
echo "  docker push localhost:${REGISTRY_PORT}/myimage"
echo ""
echo "Next steps:"
echo "  1. cd helm/nexus-platform"
echo "  2. helm dependency update"
echo "  3. helm install nexus . -n nexus-system"
