# Nexus RTP Ledger Invariants

## Formal Specification v1.0

---

## §1. Notation

| Symbol | Definition |
|--------|------------|
| $\mathcal{A}$ | Set of all accounts |
| $\mathcal{T}$ | Set of all transactions |
| $\mathcal{E}$ | Set of all ledger entries |
| $B_a(t)$ | Balance of account $a$ at time $t$ |
| $D_e$ | Debit amount of entry $e$ |
| $C_e$ | Credit amount of entry $e$ |
| $\text{acc}_D(e)$ | Debit account of entry $e$ |
| $\text{acc}_C(e)$ | Credit account of entry $e$ |
| $\text{ccy}(e)$ | Currency of entry $e$ |
| $\text{tx}(e)$ | Parent transaction of entry $e$ |
| $\text{idem}(t)$ | Idempotency key of transaction $t$ |
| $\epsilon$ | Machine epsilon ($2^{-52}$ for float64) |
| $\text{scale}(\text{ccy})$ | Decimal places for currency (2 for USD, 0 for JPY) |

---

## §2. Core Invariants

### INV-1: Conservation of Value (Per Transaction)

**Statement**: Every transaction has equal debits and credits.

$$
\forall t \in \mathcal{T}: \sum_{e \in \mathcal{E}(t)} D_e = \sum_{e \in \mathcal{E}(t)} C_e
$$

**Corollary**: Net ledger movement is always zero.

$$
\sum_{e \in \mathcal{E}} D_e - \sum_{e \in \mathcal{E}} C_e = 0
$$

---

### INV-2: Double-Entry Closure

**Statement**: Every entry has exactly one debit account and one credit account.

$$
\forall e \in \mathcal{E}: |\text{acc}_D(e)| = 1 \land |\text{acc}_C(e)| = 1
$$

**Statement**: No self-transfers.

$$
\forall e \in \mathcal{E}: \text{acc}_D(e) \neq \text{acc}_C(e)
$$

---

### INV-3: Balance Derivation

**Statement**: Account balance equals sum of credits minus debits.

$$
B_a(t) = \sum_{\substack{e \in \mathcal{E} \\ \text{acc}_C(e) = a \\ \text{time}(e) \leq t}} C_e - \sum_{\substack{e \in \mathcal{E} \\ \text{acc}_D(e) = a \\ \text{time}(e) \leq t}} D_e
$$

**Invariant**: Cached balance equals derived balance.

$$
\forall a \in \mathcal{A}: B_a^{\text{cached}} = B_a^{\text{derived}}
$$

---

### INV-4: Idempotency

**Statement**: Duplicate idempotency keys produce identical outcomes.

$$
\forall t_1, t_2 \in \mathcal{T}: \text{idem}(t_1) = \text{idem}(t_2) \Rightarrow \text{result}(t_1) = \text{result}(t_2)
$$

**Statement**: At most one successful execution per idempotency key.

$$
\forall k: |\{t \in \mathcal{T} : \text{idem}(t) = k \land \text{status}(t) = \text{SUCCESS}\}| \leq 1
$$

---

### INV-5: Non-Negative Liability Accounts

**Statement**: Customer liability accounts cannot have negative balances.

$$
\forall a \in \mathcal{A}_{\text{liability}}: B_a(t) \geq 0
$$

**Exception**: Overdraft-enabled accounts with explicit limit $L_a$.

$$
\forall a \in \mathcal{A}_{\text{overdraft}}: B_a(t) \geq -L_a
$$

---

### INV-6: Currency Homogeneity

**Statement**: All entries in a transaction share the same currency, OR are explicitly marked as FX.

$$
\forall t \in \mathcal{T} \setminus \mathcal{T}_{\text{FX}}: \forall e_1, e_2 \in \mathcal{E}(t): \text{ccy}(e_1) = \text{ccy}(e_2)
$$

---

## §3. FX Invariants

### INV-7: FX Rate Bounds

**Statement**: FX rates must be within ±5% of reference rate.

$$
\forall t \in \mathcal{T}_{\text{FX}}: \left| \frac{r_t - r_{\text{ref}}}{r_{\text{ref}}} \right| \leq 0.05
$$

### INV-8: FX Rounding Correctness

**Statement**: FX conversions use banker's rounding to currency scale.

$$
\text{amount}_{\text{target}} = \text{round}_{\text{half-even}}\left( \text{amount}_{\text{source}} \times r, \text{scale}(\text{ccy}_{\text{target}}) \right)
$$

### INV-9: FX Residual Accounting

**Statement**: Rounding residuals are booked to FX P&L account.

$$
\text{residual} = \text{amount}_{\text{source}} \times r - \text{amount}_{\text{target}}
$$

$$
|\text{residual}| < 10^{-\text{scale}(\text{ccy}_{\text{target}})}
$$

---

## §4. Precision & Overflow Invariants

### INV-10: Integer Representation

**Statement**: All monetary values stored as integers in smallest unit.

$$
\text{stored\_value} = \text{decimal\_value} \times 10^{\text{scale}(\text{ccy})}
$$

| Currency | Scale | Max Value (int64) |
|----------|-------|-------------------|
| USD | 2 | $92,233,720,368,547,758.07 |
| JPY | 0 | ¥9,223,372,036,854,775,807 |
| BTC | 8 | ₿92,233,720,368.54775807 |

### INV-11: Overflow Prevention

**Statement**: Pre-transaction overflow check.

$$
\forall e \in \mathcal{E}: B_{\text{acc}_C(e)} + C_e \leq \text{INT64\_MAX}
$$

$$
\forall e \in \mathcal{E}: B_{\text{acc}_D(e)} - D_e \geq \text{INT64\_MIN}
$$

### INV-12: No Floating Point in Ledger

**Statement**: Zero floating-point operations in balance calculation path.

$$
\text{typeof}(D_e) = \text{typeof}(C_e) = \text{typeof}(B_a) = \text{int64}
$$

---

## §5. Temporal Invariants

### INV-13: Monotonic Transaction IDs

$$
\forall t_1, t_2 \in \mathcal{T}: \text{time}(t_1) < \text{time}(t_2) \Rightarrow \text{id}(t_1) < \text{id}(t_2)
$$

### INV-14: No Future-Dated Entries

$$
\forall e \in \mathcal{E}: \text{effective\_date}(e) \leq \text{now}() + \delta_{\text{max}}
$$

Where $\delta_{\text{max}} = 5$ seconds (clock skew tolerance).

### INV-15: Immutability After Settlement

$$
\forall e \in \mathcal{E}: \text{status}(e) = \text{SETTLED} \Rightarrow \text{immutable}(e)
$$

---

## §6. Cryptographic Invariants

### INV-16: Entry Hash Chain

**Statement**: Each entry includes hash of previous entry.

$$
h_n = \text{SHA256}(e_n \| h_{n-1})
$$

### INV-17: Merkle Root Verification

**Statement**: Daily ledger state has verifiable Merkle root.

$$
\text{root}_d = \text{MerkleRoot}(\{h_e : e \in \mathcal{E}_d\})
$$

### INV-18: Signed Audit Events

**Statement**: All invariant violations produce signed events.

$$
\text{event} = \text{Sign}_{K_{\text{audit}}}(\text{violation} \| \text{timestamp} \| \text{context})
$$

---

## §7. Violation Response Matrix

| Invariant | Severity | Action |
|-----------|----------|--------|
| INV-1 | CRITICAL | Halt settlement, page on-call |
| INV-2 | CRITICAL | Reject transaction |
| INV-3 | HIGH | Trigger reconciliation |
| INV-4 | MEDIUM | Log duplicate, return cached result |
| INV-5 | HIGH | Reject transaction |
| INV-6 | MEDIUM | Require explicit FX flag |
| INV-7 | HIGH | Reject, alert treasury |
| INV-10 | CRITICAL | Halt settlement |
| INV-11 | CRITICAL | Reject transaction |
| INV-15 | CRITICAL | Security incident |

---

## §8. Verification Schedule

| Check | Frequency | Method |
|-------|-----------|--------|
| INV-1, INV-2 | Per transaction | Runtime guard |
| INV-3 | Hourly | Reconciliation job |
| INV-4 | Per request | Idempotency lookup |
| INV-5 | Pre-debit | Balance check |
| INV-10, INV-11 | Per transaction | Type system + runtime |
| INV-16 | Per entry | Hash computation |
| INV-17 | Daily | Batch Merkle build |

---

## §9. Test Oracle

For property-based testing, the oracle is:

$$
\text{Oracle}(\mathcal{E}) = \left( \sum_{e} D_e = \sum_{e} C_e \right) \land \left( \forall a: B_a \geq 0 \lor a \in \mathcal{A}_{\text{overdraft}} \right)
$$

Falsification: Generate random transaction sequences, verify oracle holds.

---

## Appendix A: Currency Scale Table

| ISO Code | Scale | Min Unit |
|----------|-------|----------|
| USD | 2 | $0.01 |
| EUR | 2 | €0.01 |
| GBP | 2 | £0.01 |
| JPY | 0 | ¥1 |
| KWD | 3 | 0.001 KWD |
| BTC | 8 | 1 satoshi |
| ETH | 18 | 1 wei |

## Appendix B: Hash Algorithms

| Purpose | Algorithm | Output |
|---------|-----------|--------|
| Entry hash | SHA-256 | 32 bytes |
| Merkle tree | SHA-256 | 32 bytes |
| Audit signature | Ed25519 | 64 bytes |
| Idempotency key | UUID v4 | 16 bytes |
