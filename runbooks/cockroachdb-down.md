# Runbook: CockroachDB Cluster Down

## Alert: CockroachDBNodeDown

### Severity: CRITICAL
### Team: Platform/DBA
### SLO Impact: Availability

---

## 1. Overview

This alert fires when one or more CockroachDB nodes are unreachable or have stopped responding to health checks.

## 2. Impact

- **Partial outage**: 1 node down - cluster remains available with degraded performance
- **Critical outage**: 2+ nodes down - possible loss of quorum, cluster may be read-only
- **Full outage**: All nodes down - complete database unavailability

## 3. Immediate Actions

### 3.1 Assess Situation (2 minutes)

```bash
# Check cluster status
kubectl get pods -n nexus-system -l app=cockroachdb

# Check node status via SQL (if any node accessible)
cockroach node status --host=cockroachdb-0:26257 --certs-dir=/certs

# Check for recent events
kubectl get events -n nexus-system --sort-by='.lastTimestamp' | grep cockroach
```

### 3.2 Check Node Health (3 minutes)

```bash
# View pod logs
kubectl logs cockroachdb-0 -n nexus-system --tail=100

# Check resource usage
kubectl top pods -n nexus-system -l app=cockroachdb

# Check disk space
kubectl exec cockroachdb-0 -n nexus-system -- df -h /cockroach/cockroach-data
```

### 3.3 Check Network Connectivity

```bash
# Test inter-node connectivity
kubectl exec cockroachdb-0 -n nexus-system -- ping -c 3 cockroachdb-1.cockroachdb

# Check for network policies blocking traffic
kubectl get networkpolicy -n nexus-system
```

## 4. Common Causes & Fixes

### 4.1 Out of Disk Space

**Symptoms**: Pod in CrashLoopBackOff, logs show disk full errors

**Fix**:
```bash
# Expand PVC (if supported)
kubectl patch pvc cockroachdb-data-cockroachdb-0 -n nexus-system \
  -p '{"spec":{"resources":{"requests":{"storage":"200Gi"}}}}'

# Or manually clean up old data
kubectl exec cockroachdb-0 -n nexus-system -- \
  cockroach debug compact /cockroach/cockroach-data --certs-dir=/certs
```

### 4.2 Out of Memory

**Symptoms**: OOMKilled in pod status

**Fix**:
```bash
# Increase memory limits
kubectl patch statefulset cockroachdb -n nexus-system \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"cockroachdb","resources":{"limits":{"memory":"8Gi"}}}]}}}}'
```

### 4.3 Network Partition

**Symptoms**: Nodes can't reach each other, split-brain suspected

**Fix**:
1. Identify which partition has quorum
2. Restart nodes in minority partition
3. If manual intervention needed:

```bash
# Force-remove a dead node (CAUTION!)
cockroach node decommission <node_id> --host=cockroachdb-0:26257 --certs-dir=/certs
```

### 4.4 Certificate Expiration

**Symptoms**: TLS handshake failures in logs

**Fix**:
```bash
# Check certificate expiration
kubectl get certificate -n nexus-system

# Force certificate renewal
kubectl delete secret cockroachdb-tls-secret -n nexus-system
# cert-manager will regenerate
```

## 5. Recovery Procedures

### 5.1 Single Node Recovery

```bash
# Delete and recreate the pod
kubectl delete pod cockroachdb-X -n nexus-system

# Wait for pod to be ready
kubectl wait --for=condition=Ready pod/cockroachdb-X -n nexus-system --timeout=300s

# Verify node rejoined cluster
cockroach node status --host=cockroachdb-0:26257 --certs-dir=/certs
```

### 5.2 Full Cluster Recovery

```bash
# If cluster is completely down, start with node 0
kubectl delete sts cockroachdb -n nexus-system --cascade=orphan
kubectl delete pod cockroachdb-0 cockroachdb-1 cockroachdb-2 -n nexus-system

# Recreate statefulset
kubectl apply -f k8s/cockroachdb/

# Monitor recovery
watch kubectl get pods -n nexus-system -l app=cockroachdb
```

### 5.3 Restore from Backup

If data is corrupted or unrecoverable:

```bash
# See restore runbook
./infra/backup/restore-cockroachdb.sh list
./infra/backup/restore-cockroachdb.sh restore <backup_name>
```

## 6. Verification

After recovery:

```bash
# Check all nodes healthy
cockroach node status --host=cockroachdb-0:26257 --certs-dir=/certs

# Verify ranges are healthy
cockroach debug check-store /cockroach/cockroach-data --certs-dir=/certs

# Run application health check
curl -s http://payment-service:8080/health | jq .

# Verify recent payments succeeded
cockroach sql --host=cockroachdb-0:26257 --certs-dir=/certs \
  -e "SELECT count(*), status FROM nexus.payments WHERE created_at > now() - interval '1 hour' GROUP BY status;"
```

## 7. Escalation

| Time | Action |
|------|--------|
| 5 min | Page on-call DBA |
| 15 min | Page Platform Engineering lead |
| 30 min | Notify engineering director |
| 1 hour | Incident bridge, all hands |

## 8. Prevention

- Monitor disk usage proactively (alert at 70%)
- Ensure adequate resource limits
- Regular backup verification
- Certificate rotation before expiry
- Load testing to identify capacity limits
