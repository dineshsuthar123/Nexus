# Runbook: Service Down / Pod CrashLoop

## Alert: ServiceDown / PodCrashLoopBackOff

### Severity: CRITICAL
### Team: Platform
### SLO Impact: Availability

---

## 1. Overview

This runbook covers scenarios where a Nexus service is down or pods are in CrashLoopBackOff state.

## 2. Services Covered

| Service | Port | Health Endpoint |
|---------|------|-----------------|
| payment-service | 8080 | /health |
| account-service | 8081 | /health |
| reconciliation-service | 8082 | /health |
| fraud-detection (Flink) | 8081 | /overview |

## 3. Immediate Actions

### 3.1 Assess Situation (1 minute)

```bash
# Check all pods
kubectl get pods -n nexus-system

# Check events
kubectl get events -n nexus-system --sort-by='.lastTimestamp' | tail -20

# Check service endpoints
kubectl get endpoints -n nexus-system
```

### 3.2 Identify Failing Pods (1 minute)

```bash
# Get pod status details
kubectl describe pod -l app=<service-name> -n nexus-system

# Check restart count
kubectl get pods -n nexus-system -o custom-columns=NAME:.metadata.name,RESTARTS:.status.containerStatuses[0].restartCount,STATUS:.status.phase

# Check termination reason
kubectl get pods -n nexus-system -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].lastState.terminated.reason}{"\n"}{end}'
```

### 3.3 Get Logs (2 minutes)

```bash
# Current logs
kubectl logs -l app=<service-name> -n nexus-system --tail=100

# Previous container logs (if crashed)
kubectl logs -l app=<service-name> -n nexus-system --previous --tail=100

# All containers in pod
kubectl logs <pod-name> -n nexus-system --all-containers
```

## 4. Common Causes & Fixes

### 4.1 OOMKilled (Out of Memory)

**Symptoms**: `lastState.terminated.reason: OOMKilled`

**Fix**:
```bash
# Check memory usage before crash
kubectl top pods -n nexus-system

# Increase memory limit
kubectl patch deployment <service-name> -n nexus-system \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"<service-name>","resources":{"limits":{"memory":"2Gi"},"requests":{"memory":"1Gi"}}}]}}}}'

# Investigate memory leak (if recurring)
# Enable memory profiling: GODEBUG=madvdontneed=1
```

### 4.2 Liveness Probe Failure

**Symptoms**: `Liveness probe failed` in events

**Fix**:
```bash
# Check probe configuration
kubectl get deployment <service-name> -n nexus-system -o yaml | grep -A10 livenessProbe

# Increase probe timeout/threshold
kubectl patch deployment <service-name> -n nexus-system \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"<service-name>","livenessProbe":{"timeoutSeconds":10,"failureThreshold":5}}]}}}}'

# Check if health endpoint is slow
kubectl exec -it <pod-name> -n nexus-system -- curl -w 'Time: %{time_total}s\n' -s http://localhost:8080/health
```

### 4.3 Dependency Unavailable

**Symptoms**: Connection refused/timeout errors in logs

**Fix**:
```bash
# Check dependency services
kubectl get pods -n nexus-system -l "app in (cockroachdb,kafka,redis)"

# Test connectivity from pod
kubectl exec -it <pod-name> -n nexus-system -- nc -zv cockroachdb 26257
kubectl exec -it <pod-name> -n nexus-system -- nc -zv kafka 9092
kubectl exec -it <pod-name> -n nexus-system -- nc -zv redis 6379

# Check network policies
kubectl get networkpolicy -n nexus-system -o yaml
```

### 4.4 Configuration Error

**Symptoms**: `panic` or config-related errors in logs

**Fix**:
```bash
# Check ConfigMap
kubectl get configmap <service-name>-config -n nexus-system -o yaml

# Check Secrets
kubectl get secret <service-name>-secrets -n nexus-system -o yaml

# Validate config by running locally
kubectl exec -it <pod-name> -n nexus-system -- /app/service --validate-config
```

### 4.5 Image Pull Error

**Symptoms**: `ImagePullBackOff`, `ErrImagePull`

**Fix**:
```bash
# Check image name
kubectl get deployment <service-name> -n nexus-system -o jsonpath='{.spec.template.spec.containers[0].image}'

# Check image pull secrets
kubectl get serviceaccount default -n nexus-system -o yaml

# Manually pull image to verify
docker pull <image-name>

# Update image if wrong
kubectl set image deployment/<service-name> <service-name>=<correct-image>:tag -n nexus-system
```

### 4.6 Resource Quota Exceeded

**Symptoms**: `Forbidden: exceeded quota` in events

**Fix**:
```bash
# Check resource quotas
kubectl get resourcequota -n nexus-system

# Check current usage
kubectl describe resourcequota -n nexus-system

# Request quota increase or reduce resource requests
```

### 4.7 Init Container Failure

**Symptoms**: Pod stuck in `Init:CrashLoopBackOff`

**Fix**:
```bash
# Check init container logs
kubectl logs <pod-name> -n nexus-system -c <init-container-name>

# Common: waiting for dependency
# Fix: ensure dependency is ready
kubectl wait --for=condition=Ready pod -l app=cockroachdb -n nexus-system --timeout=300s
```

## 5. Emergency Procedures

### 5.1 Quick Pod Restart

```bash
# Delete pod (deployment will recreate)
kubectl delete pod <pod-name> -n nexus-system

# Or rollout restart
kubectl rollout restart deployment/<service-name> -n nexus-system
```

### 5.2 Rollback to Previous Version

```bash
# Check rollout history
kubectl rollout history deployment/<service-name> -n nexus-system

# Rollback to previous
kubectl rollout undo deployment/<service-name> -n nexus-system

# Rollback to specific revision
kubectl rollout undo deployment/<service-name> -n nexus-system --to-revision=2
```

### 5.3 Scale to Zero and Back

```bash
# Scale down
kubectl scale deployment/<service-name> -n nexus-system --replicas=0

# Wait for termination
sleep 10

# Scale up
kubectl scale deployment/<service-name> -n nexus-system --replicas=3
```

### 5.4 Emergency Bypass (if config issue)

```bash
# Create emergency pod with minimal config
kubectl run emergency-<service-name> -n nexus-system \
  --image=<service-image> \
  --env="MINIMAL_MODE=true" \
  --port=8080
```

## 6. Verification

```bash
# Check pods running
kubectl get pods -n nexus-system -l app=<service-name>

# Check health endpoint
kubectl exec -it <pod-name> -n nexus-system -- curl -s http://localhost:8080/health

# Check service is accessible
kubectl run test-curl --rm -it --image=curlimages/curl -n nexus-system -- curl http://<service-name>:8080/health

# Check logs are clean
kubectl logs -l app=<service-name> -n nexus-system --tail=50 | grep -i error
```

## 7. Escalation

| Situation | Time | Escalate To |
|-----------|------|-------------|
| Single pod crash | 5 min | On-call |
| All pods down | Immediate | Team lead |
| Can't recover | 15 min | Engineering manager |
| Customer impact | Immediate | Incident commander |

## 8. Post-Incident

1. Capture logs and events for analysis
2. Identify root cause
3. Create fix (code, config, or infrastructure)
4. Update monitoring to detect earlier
5. Document in incident retrospective

## 9. Service-Specific Notes

### Payment Service
- Critical path - escalate immediately
- Check sanctions service dependency
- Verify Kafka connectivity

### Account Service
- Check Redis cache health
- Verify database migrations ran

### Reconciliation Service
- Can tolerate brief downtime (batch processing)
- Check cron job schedules
- Verify settlement file access

### Fraud Detection (Flink)
- Check Flink job manager
- Verify checkpointing works
- Check for savepoint to recover from
