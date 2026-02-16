# Runbook: Key Rotation

## Alert: VaultKeyRotationOverdue / VaultKeyFetchError

### Severity: WARNING (overdue) / CRITICAL (fetch error)
### Team: Security + SRE
### Impact: Cryptographic keys may be stale; services may fail to authenticate

---

## 1. Overview

Key rotation ensures cryptographic material is regularly refreshed to limit the
blast radius of a potential key compromise. This runbook covers:
- **Scheduled rotation** (quarterly for JWT, daily for mTLS leaf certs)
- **Emergency rotation** (key compromise suspected)
- **Failed rotation** (Vault errors, service unable to fetch new keys)

## 2. Key Rotation Schedule

| Key | Rotation Frequency | Last Rotated | Next Due | Automated |
|-----|-------------------|--------------|----------|-----------|
| JWT signing (RSA-4096) | 90 days | Check Vault | +90d | Semi-auto |
| mTLS leaf certs (P-384) | 24 hours | cert-manager | Continuous | Fully auto |
| Transit: payment-data | 90 days | Check Vault | +90d | Manual |
| Transit: pii-data | 90 days | Check Vault | +90d | Manual |
| Transit: audit-bundle | 365 days | Check Vault | +365d | Manual |
| MFA encryption | 180 days | Check Vault | +180d | Semi-auto |

## 3. Scheduled JWT Key Rotation

### 3.1 Pre-Rotation Checks

```bash
# Verify Vault is healthy
vault status

# Check current key version
vault kv get -format=json secret/nexus/keys/jwt-signing | jq '.data.data.version'

# Verify auth-service can reach Vault
curl -s http://auth-service:8088/health | jq '.dependencies.vault'

# Check current token expiry distribution (ensure no long-lived tokens)
curl -s http://auth-service:8088/metrics | grep token_expiry
```

### 3.2 Execute Rotation

```bash
# Option A: Interactive (recommended for first time)
bash scripts/rotate_keys.sh

# Option B: Automated (CI/cron)
bash scripts/rotate_keys.sh --auto

# Option C: Manual via Vault CLI
# Generate new RSA-4096 key pair
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out /tmp/jwt_new.pem 2>/dev/null
openssl rsa -in /tmp/jwt_new.pem -pubout -out /tmp/jwt_new_pub.pem 2>/dev/null

# Store in Vault with incremented version
CURRENT_VERSION=$(vault kv get -format=json secret/nexus/keys/jwt-signing | jq -r '.data.data.version')
NEW_VERSION=$((CURRENT_VERSION + 1))

vault kv put secret/nexus/keys/jwt-signing \
  private_key=@/tmp/jwt_new.pem \
  public_key=@/tmp/jwt_new_pub.pem \
  algorithm=RS256 \
  version=$NEW_VERSION \
  rotated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Cleanup
rm -f /tmp/jwt_new.pem /tmp/jwt_new_pub.pem
```

### 3.3 Post-Rotation Verification

```bash
# Verify auth-service picked up new key (within refresh interval)
# Default refresh: 300 seconds
sleep 10

# Check key version in auth-service metrics
curl -s http://auth-service:8088/metrics | grep vault_key_rotation_total

# Test token generation with new key
TOKEN=$(curl -s -X POST http://auth-service:8088/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' | jq -r '.access_token')

# Verify token is valid
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  http://payment-service:8085/api/v1/payments
# Expected: 200 (or 403 if user doesn't have payment permissions — but NOT 401)

# Verify old tokens still work (dual-key validation period)
# Use a token issued before rotation
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $OLD_TOKEN" \
  http://payment-service:8085/api/v1/payments
# Expected: 200 (until old token expires naturally)
```

## 4. Transit Key Rotation

```bash
# Rotate Transit encryption keys
for key in payment-data pii-data; do
  echo "Rotating $key..."
  vault write -f transit/keys/$key/rotate

  # Verify new version
  vault read transit/keys/$key | grep -E "latest_version|min_decryption"
done

# Rotate audit signing key (yearly)
vault write -f transit/keys/audit-bundle/rotate
vault read transit/keys/audit-bundle | grep latest_version

# IMPORTANT: Do NOT advance min_decryption_version immediately
# Wait for data re-encryption cycle first
```

## 5. Emergency Key Rotation

### 5.1 Trigger Conditions

- Key compromise confirmed or suspected
- Employee with key access terminated
- Vault breach detected
- Cryptographic vulnerability published

### 5.2 Emergency Procedure

```bash
# 1. IMMEDIATELY rotate the compromised key
bash scripts/rotate_keys.sh --auto

# 2. If JWT key compromised — invalidate all sessions
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  DELETE FROM nexus_auth.sessions
  WHERE created_at < NOW();
"

# 3. Force all services to refresh keys
for svc in auth-service payment-service account-service; do
  kubectl rollout restart deployment/$svc -n nexus-system
done

# 4. If Transit key compromised — re-encrypt all data
vault write transit/keys/payment-data/rotate
vault write -f transit/rewrap/payment-data \
  ciphertext="<each_encrypted_value>"

# 5. If mTLS CA compromised — regenerate entire PKI chain
vault write pki/root/rotate/internal \
  common_name="nexus-internal-ca" \
  ttl="87600h"

# 6. Regenerate all leaf certificates
kubectl delete certificates --all -n nexus-system
# cert-manager will auto-regenerate

# 7. Rolling restart all services
kubectl rollout restart deployment --all -n nexus-system
```

### 5.3 Post-Emergency

- [ ] Confirm all services healthy
- [ ] Verify no authentication failures in logs
- [ ] Check Vault audit log for unauthorized access
- [ ] File security incident report
- [ ] Update key rotation log

## 6. Failed Rotation Recovery

### 6.1 Vault Unreachable

```bash
# Check Vault pod status
kubectl get pods -n nexus-system -l app=vault

# Check Vault seal status
vault status

# If sealed, unseal
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>

# Retry rotation
bash scripts/rotate_keys.sh --auto
```

### 6.2 Service Can't Fetch New Key

```bash
# Check auth-service logs for Vault errors
kubectl logs -n nexus-system deploy/auth-service --since=5m | grep -i vault

# Verify AppRole credentials
vault read auth/approle/role/auth-service

# Test AppRole login
vault write auth/approle/login \
  role_id=$(kubectl get secret auth-service-vault -n nexus-system -o jsonpath='{.data.role_id}' | base64 -d) \
  secret_id=$(kubectl get secret auth-service-vault -n nexus-system -o jsonpath='{.data.secret_id}' | base64 -d)

# If AppRole expired, generate new secret_id
vault write -f auth/approle/role/auth-service/secret-id
```

### 6.3 Rollback to Previous Key

```bash
# If new key causes issues, rollback via Vault KV versioning
bash scripts/rotate_keys.sh --rollback

# Or manually
vault kv rollback -version=<previous_version> secret/nexus/keys/jwt-signing

# Restart auth-service to pick up rolled-back key
kubectl rollout restart deployment/auth-service -n nexus-system
```

## 7. Monitoring

```bash
# Key age dashboard query
vault_key_rotation_total - key rotation count should increase per schedule
vault_key_fetch_total{status="error"} - should be 0
vault_key_fetch_duration_seconds - should be < 1s
vault_key_cache_hits_total - high hit rate = good (caching working)
```

## 8. Escalation

| Condition | Action |
|-----------|--------|
| Scheduled rotation overdue > 7d | Slack warning to security team |
| Vault unreachable > 5 min | PagerDuty P1 |
| Key fetch errors > 5 in 5 min | PagerDuty P1 |
| Suspected key compromise | PagerDuty P0 + CISO notification |
