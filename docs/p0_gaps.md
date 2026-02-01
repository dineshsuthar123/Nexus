# P0 Production Gaps

**Document:** Critical Production Blockers  
**Status:** Must be resolved before production launch  
**Last Updated:** February 2026

---

## Overview

This document enumerates all Priority-0 (P0) gaps that must be addressed before the Nexus RTP Platform can process live payment transactions. Each gap includes:

- Impact assessment
- Remediation plan
- Timeline estimate
- Cost estimate
- Owner assignment

---

## Gap 1: Hardware Security Module (HSM) Integration

### Status: NOT IMPLEMENTED

### Impact
- **Security:** Private keys stored in software memory, vulnerable to extraction
- **Compliance:** Does not meet PCI-DSS Requirement 3.5 for cryptographic key protection
- **Regulatory:** Cannot obtain banking license without HSM

### Current State
```go
// security/cert_rotation.go - Current implementation
caKey, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
// Key exists only in process memory - NOT production safe
```

### Remediation Plan

1. **Week 1-2:** Evaluate HSM vendors
   - AWS CloudHSM (recommended for AWS deployment)
   - Thales Luna Network HSM
   - Utimaco SecurityServer

2. **Week 3-4:** Implement PKCS#11 Go wrapper
   ```go
   type HSMClient interface {
       Sign(ctx context.Context, keyID string, data []byte) ([]byte, error)
       GenerateKey(ctx context.Context, spec KeySpec) (keyID string, error)
   }
   ```

3. **Week 5-6:** Configure Vault HSM seal
   ```hcl
   seal "pkcs11" {
     lib            = "/usr/lib/libCryptoki2_64.so"
     slot           = "0"
     pin            = "vault-hsm-pin"
     key_label      = "vault-hsm-key"
     hmac_key_label = "vault-hsm-hmac"
   }
   ```

4. **Week 7-8:** Migrate existing keys and test

### Timeline
8 weeks

### Cost
| Item | Cost |
|------|------|
| CloudHSM cluster (2 HSMs for HA) | $30,000 setup |
| Monthly HSM costs | $1,500/month |
| Engineering (2 FTE × 4 weeks) | $40,000 |
| **Total Year 1** | **$75,000** |

### Owner
Security Engineering Lead (TBD)

---

## Gap 2: Multi-Region Active-Active Deployment

### Status: NOT IMPLEMENTED

### Impact
- **Availability:** Single region failure causes complete outage
- **Latency:** Users in distant regions experience high latency
- **Compliance:** Some regulations require data residency

### Current State
- Single-region deployment (us-east-1)
- CockroachDB single-region cluster
- Kafka single-region cluster
- No geographic redundancy

### Remediation Plan

1. **Week 17-18:** CockroachDB multi-region configuration
   ```sql
   ALTER DATABASE nexus_rtp SET PRIMARY REGION "us-east-1";
   ALTER DATABASE nexus_rtp ADD REGION "us-west-2";
   ALTER DATABASE nexus_rtp ADD REGION "eu-west-1";
   ```

2. **Week 19-20:** Kafka MirrorMaker2 configuration
   ```yaml
   clusters:
     - alias: us-east
       bootstrap.servers: kafka-us-east:9092
     - alias: us-west
       bootstrap.servers: kafka-us-west:9092
   mirrors:
     - source: us-east
       target: us-west
       topics: [".*"]
   ```

3. **Week 21-24:** Service deployment automation
4. **Week 25-26:** Global load balancing
5. **Week 27-28:** Failover testing

### Timeline
12 weeks

### Cost
| Item | Cost |
|------|------|
| CockroachDB Enterprise (3 regions) | $150,000/year |
| Additional Kafka clusters | $48,000/year |
| Additional Kubernetes clusters | $90,000/year |
| Engineering (3 FTE × 12 weeks) | $180,000 |
| **Total Year 1** | **$468,000** |

### Owner
Platform Engineering Lead (TBD)

---

## Gap 3: Payment Rail Integration (FedNow/ACH)

### Status: NOT IMPLEMENTED

### Impact
- **Functionality:** Cannot process actual USD payments
- **Revenue:** No revenue possible without payment rail
- **Compliance:** Cannot achieve FedNow certification

### Current State
- Internal ledger transfers only
- No connection to Federal Reserve
- No ACH integration
- No settlement capability

### Remediation Plan

1. **Phase 1 (Weeks 29-32):** FedNow connectivity
   - Apply for FedNow pilot participation
   - Implement ISO 20022 message formats (pacs.008, pacs.004)
   - Establish FedLine Advantage connection

2. **Phase 2 (Weeks 33-36):** ACH integration
   - Partner with ODFI (Originating Depository Financial Institution)
   - Implement NACHA file formats
   - Establish ACH operator connection

3. **Phase 3 (Weeks 37-40):** Settlement
   - Implement settlement account management
   - Liquidity management
   - Reconciliation with Fed/ACH

### Timeline
12+ weeks (parallel with certification)

### Cost
| Item | Cost |
|------|------|
| FedNow participation fees | $50,000/year |
| ACH ODFI partnership | $25,000/year |
| FedLine connection | $15,000/year |
| Engineering (3 FTE × 12 weeks) | $180,000 |
| Certification consulting | $50,000 |
| **Total Year 1** | **$320,000** |

### Owner
Payments Integration Lead (TBD)

---

## Gap 4: PCI-DSS Certification

### Status: NOT IMPLEMENTED

### Impact
- **Compliance:** Cannot store, process, or transmit cardholder data
- **Partnerships:** Banks and card networks require PCI compliance
- **Legal:** Potential fines for non-compliance

### Current State
- No formal PCI assessment
- Many controls implemented but not documented
- No QSA engagement

### Remediation Plan

1. **Week 9-12:** Gap assessment
   - Engage Qualified Security Assessor (QSA)
   - Document current controls
   - Identify gaps

2. **Week 13-16:** Remediation
   - Address identified gaps
   - Implement missing controls
   - Document evidence

3. **Week 29-36:** Certification
   - On-site assessment
   - Report generation
   - Attestation of Compliance (AOC)

### Timeline
16 weeks (split across Q2 and Q4)

### Cost
| Item | Cost |
|------|------|
| QSA gap assessment | $25,000 |
| QSA certification audit | $50,000 |
| Remediation engineering | $30,000 |
| Annual recertification | $40,000/year |
| **Total Year 1** | **$105,000** |

### Owner
Compliance Lead (TBD)

---

## Gap 5: SOC 2 Type II Certification

### Status: NOT IMPLEMENTED

### Impact
- **Trust:** Enterprise customers require SOC 2 reports
- **Sales:** Cannot close enterprise deals without SOC 2
- **Compliance:** Industry standard for SaaS security

### Current State
- No SOC 2 Type I
- No 6-month observation period started
- No auditor engagement

### Remediation Plan

1. **Week 9-16:** SOC 2 Type I preparation
   - Document policies and procedures
   - Implement continuous monitoring
   - Engage auditor

2. **Week 16:** SOC 2 Type I attestation

3. **Week 16-40:** 6-month observation period

4. **Week 40+:** SOC 2 Type II assessment

### Timeline
6+ months (Type II requires observation period)

### Cost
| Item | Cost |
|------|------|
| Type I preparation and audit | $50,000 |
| Type II audit | $40,000 |
| Ongoing compliance tools | $20,000/year |
| **Total Year 1** | **$110,000** |

### Owner
Compliance Lead (TBD)

---

## Gap Summary

| Gap | Priority | Timeline | Cost | Status |
|-----|----------|----------|------|--------|
| HSM Integration | P0 | 8 weeks | $75K | Not Started |
| Multi-Region | P0 | 12 weeks | $468K | Not Started |
| FedNow/ACH | P0 | 12 weeks | $320K | Not Started |
| PCI-DSS | P0 | 16 weeks | $105K | Not Started |
| SOC 2 Type II | P0 | 6+ months | $110K | Not Started |

**Total P0 Gap Remediation Cost:** ~$1.08M (subset of $2.34M total roadmap)

---

## Dependencies

```
HSM ──────────────┐
                  ├──▶ PCI-DSS ──────▶ FedNow
Multi-Region ─────┘
                       
SOC 2 Type I ──────▶ 6 months ──────▶ SOC 2 Type II
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| HSM vendor delays | Blocks PCI | Early vendor engagement |
| CockroachDB multi-region complexity | Delays multi-region | Engage CockroachDB support |
| FedNow certification delays | Delays revenue | Parallel ACH integration |
| QSA availability | Delays PCI | Book QSA 3 months ahead |

---

*This document is updated as gaps are addressed. Track progress in the project management system.*
