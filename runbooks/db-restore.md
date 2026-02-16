# Runbook: Database Restore

## Alert: Manual procedure — invoked during DR or data corruption incident

### Severity: CRITICAL
### Team: SRE + DBA
### Pre-requisites: CockroachDB access, S3 backup credentials, cluster admin

---

## 1. When to Use This Runbook

- Full cluster failure (all nodes lost)
- Data corruption detected
- Accidental data deletion
- Point-in-time recovery required
- DR drill / compliance test

## 2. Backup Inventory

```bash
# List available backups (S3)
aws s3 ls s3://nexus-backups/cockroachdb/ --recursive | tail -20

# Latest full backup
aws s3 ls s3://nexus-backups/cockroachdb/full/ | tail -5

# Latest incremental
aws s3 ls s3://nexus-backups/cockroachdb/incremental/ | tail -5

# Verify backup metadata
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SHOW BACKUPS IN 's3://nexus-backups/cockroachdb/full?AUTH=implicit';
"
```

## 3. Restore Procedures

### 3.1 Full Cluster Restore (Disaster Recovery)

⚠️ **This is destructive. All current data will be replaced.**

```bash
# Step 1: Ensure all applications are stopped
kubectl scale deployment --all -n nexus-system --replicas=0

# Step 2: Verify CockroachDB is running
cockroach node status --host=cockroachdb:26257 --certs-dir=/certs

# Step 3: Drop existing databases (if corrupted)
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  DROP DATABASE IF EXISTS nexus_auth CASCADE;
  DROP DATABASE IF EXISTS nexus_ledger CASCADE;
"

# Step 4: Restore from latest full backup
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  RESTORE DATABASE nexus_auth, nexus_ledger
  FROM LATEST IN 's3://nexus-backups/cockroachdb/full?AUTH=implicit'
  WITH new_db_name = 'nexus_auth', new_db_name = 'nexus_ledger';
"

# Step 5: Verify restore
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT table_name, estimated_row_count
  FROM [SHOW TABLES FROM nexus_ledger WITH COMMENT];
  SELECT table_name, estimated_row_count
  FROM [SHOW TABLES FROM nexus_auth WITH COMMENT];
"

# Step 6: Run smoke tests
bash scripts/restore_and_smoke.sh

# Step 7: Restart applications
kubectl scale deployment --all -n nexus-system --replicas=2
```

### 3.2 Point-in-Time Recovery (PITR)

```bash
# List available restore points
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SHOW BACKUPS IN 's3://nexus-backups/cockroachdb/full?AUTH=implicit';
"

# Restore to specific timestamp
# Use a non-conflicting database name first
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  RESTORE DATABASE nexus_ledger
  FROM LATEST IN 's3://nexus-backups/cockroachdb/full?AUTH=implicit'
  AS OF SYSTEM TIME '2025-01-15 10:30:00'
  WITH new_db_name = 'nexus_ledger_pitr';
"

# Compare data between current and restored
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  -- Count differences
  SELECT 'current' as source, COUNT(*) FROM nexus_ledger.payments
  UNION ALL
  SELECT 'pitr' as source, COUNT(*) FROM nexus_ledger_pitr.payments;
"

# If PITR data is correct, swap databases
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  ALTER DATABASE nexus_ledger RENAME TO nexus_ledger_old;
  ALTER DATABASE nexus_ledger_pitr RENAME TO nexus_ledger;
"
```

### 3.3 Single Table Restore

```bash
# Restore specific table only
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  RESTORE TABLE nexus_ledger.payments
  FROM LATEST IN 's3://nexus-backups/cockroachdb/full?AUTH=implicit'
  WITH into_db = 'nexus_ledger_recovery';
"

# Copy recovered data back to production table
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  INSERT INTO nexus_ledger.payments
  SELECT * FROM nexus_ledger_recovery.payments
  WHERE id NOT IN (SELECT id FROM nexus_ledger.payments);
"
```

## 4. Post-Restore Verification

### 4.1 Schema Verification

```bash
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  -- Verify all expected tables exist
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_catalog IN ('nexus_auth', 'nexus_ledger')
  ORDER BY table_catalog, table_name;
"
```

Expected tables:
- `nexus_auth`: users, api_keys, sessions, mfa_secrets
- `nexus_ledger`: payments, ledger_entries, accounts, reconciliation_results, audit_log, notifications

### 4.2 Referential Integrity

```sql
-- Orphaned ledger entries (should be 0)
SELECT COUNT(*) as orphaned_entries
FROM nexus_ledger.ledger_entries le
LEFT JOIN nexus_ledger.payments p ON le.payment_id = p.id
WHERE p.id IS NULL;

-- Orphaned reconciliation results (should be 0)
SELECT COUNT(*) as orphaned_recon
FROM nexus_ledger.reconciliation_results r
LEFT JOIN nexus_ledger.payments p ON r.payment_id = p.id
WHERE p.id IS NULL;
```

### 4.3 Balance Invariant (INV-1: Conservation of Value)

```sql
-- Sum of all debits must equal sum of all credits
SELECT
  SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as total_debits,
  SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as total_credits,
  SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) -
  SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as imbalance
FROM nexus_ledger.ledger_entries;
-- imbalance MUST be 0.00
```

### 4.4 Application Health

```bash
# Restart services and verify health
for svc in payment-service account-service reconciliation-service auth-service \
           notification-service analytics-service audit-service ws-gateway; do
  kubectl rollout restart deployment/$svc -n nexus-system
done

# Wait for rollout
kubectl rollout status deployment --all -n nexus-system --timeout=300s

# Health check all services
for port in 8085 8086 8087 8088 8089 8090 8091 8092; do
  echo "Port $port: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$port/health)"
done
```

## 5. Recovery Time Tracking

| Step | Expected Duration | Notes |
|------|-------------------|-------|
| Stop applications | 1 min | Scale to 0 |
| Download backup from S3 | 5–15 min | Depends on backup size |
| CockroachDB RESTORE | 10–30 min | Depends on data volume |
| Schema verification | 1 min | Automated checks |
| Integrity checks | 2 min | SQL queries |
| Smoke tests | 5 min | restore_and_smoke.sh |
| Restart applications | 3 min | Rolling restart |
| End-to-end validation | 5 min | Test payment flow |
| **Total** | **27–62 min** | **Within 1h RTO** |

## 6. Troubleshooting

| Problem | Solution |
|---------|----------|
| RESTORE fails with "table already exists" | Use `WITH new_db_name` or drop existing first |
| S3 auth failure | Verify IAM role on CockroachDB pods, check `AWS_REGION` |
| "no backup found" | Check S3 path, verify backup schedule ran |
| Restore hangs | Check CockroachDB logs: `kubectl logs cockroachdb-0` |
| Post-restore imbalance | CRITICAL: Do not start services. Page DBA + payments lead. |

## 7. Escalation

| Time | Action |
|------|--------|
| 0 min | SRE begins restore procedure |
| 15 min | If restore not progressing, page DBA |
| 30 min | Page engineering lead |
| 45 min | If approaching RTO, consider cold standby region |
| 60 min | RTO breach — notify VP Eng + CTO |
