# Mermaid Diagrams

**Document:** Nexus RTP Platform Architecture Diagrams  
**Format:** Mermaid (render with GitHub, VS Code extension, or mermaid.live)

---

## 1. End-to-End Data Flow

This diagram shows the complete flow of a payment transaction through the system.

```mermaid
flowchart TB
    subgraph Client Layer
        C[Client Application]
    end

    subgraph API Gateway
        GW[Payment Gateway]
        RL[Rate Limiter]
        AUTH[Auth/mTLS]
    end

    subgraph Core Services
        PS[Payment Service]
        AS[Account Service]
        FS[Fraud Service]
    end

    subgraph Data Layer
        DB[(CockroachDB)]
        KF[Kafka]
    end

    subgraph Verification Layer
        IG[Invariant Guard]
        RE[Replay Engine]
        AB[Audit Bundler]
    end

    subgraph Security
        V[Vault]
        CM[Cert Manager]
    end

    C -->|HTTPS + mTLS| GW
    GW --> RL
    RL --> AUTH
    AUTH --> PS

    PS -->|Score Request| FS
    FS -->|Risk Score| PS
    
    PS -->|Debit/Credit| AS
    AS -->|Verify Balance| IG
    IG -->|OK| AS
    AS -->|Atomic TX| DB
    
    PS -->|Emit Event| KF
    KF -->|Stream| RE
    KF -->|Stream| AB
    
    RE -->|Verify Hash Chain| RE
    AB -->|Sign Bundle| V
    
    V -->|Certs| CM
    CM -->|mTLS Certs| AUTH

    style IG fill:#f9f,stroke:#333,stroke-width:2px
    style RE fill:#bbf,stroke:#333,stroke-width:2px
    style AB fill:#bfb,stroke:#333,stroke-width:2px
```

---

## 2. Deterministic Replay and Verification Flow

This diagram shows how the replay engine reconstructs and verifies historical state.

```mermaid
sequenceDiagram
    participant Auditor
    participant CLI as Replay CLI
    participant SS as Snapshot Store
    participant KF as Kafka
    participant RE as Replay Engine
    participant HV as Hash Verifier
    participant Live as Live State API

    Auditor->>CLI: replay --from T1 --to T2
    CLI->>SS: Find snapshot before T1
    SS-->>CLI: Snapshot at T0
    
    CLI->>KF: Consume events [T0, T2]
    KF-->>CLI: Events stream
    
    loop For each event
        CLI->>RE: Apply event
        RE->>RE: Update state
        RE->>HV: Verify hash chain
        HV-->>RE: Hash valid ✓
    end
    
    CLI->>CLI: Compute final hash
    CLI-->>Auditor: replay_state.json
    
    Auditor->>Live: GET /state?at=T2
    Live-->>Auditor: live_state.json
    
    Auditor->>CLI: compare --replay --live
    CLI->>CLI: Diff states
    
    alt States match
        CLI-->>Auditor: MATCH ✓
    else States differ
        CLI-->>Auditor: MISMATCH + diff report
    end
```

---

## 3. Audit Bundle Creation Flow

```mermaid
flowchart LR
    subgraph Input
        TX[Transactions]
        BP[Balance Proofs]
        IR[Invariant Results]
    end

    subgraph Bundle Builder
        CB[Canonicalize]
        MR[Compute Merkle Root]
        SN[Sign with Ed25519]
    end

    subgraph Output
        AB[Audit Bundle JSON]
        CH[Chain Link]
    end

    subgraph Signing
        V[Vault Transit]
        HSM[HSM - P0 GAP]
    end

    TX --> CB
    BP --> CB
    IR --> CB
    
    CB --> MR
    MR --> SN
    
    SN -.->|Production| V
    SN -.->|Future| HSM
    
    SN --> AB
    AB --> CH
    CH -->|prev_hash| AB
```

---

## 4. Security and Certificate Rotation

```mermaid
stateDiagram-v2
    [*] --> Active: Certificate Issued

    Active --> NeedsRotation: Expiry < 30 days
    NeedsRotation --> Rotating: Trigger rotation
    Rotating --> GeneratingNew: Request new cert
    GeneratingNew --> ValidatingChain: Verify CA chain
    ValidatingChain --> SwappingCert: Update service
    SwappingCert --> Active: New cert active
    
    Active --> Active: Metrics updated hourly
    
    Rotating --> Failed: Error
    Failed --> NeedsRotation: Retry
```

---

## 5. Transaction State Machine

```mermaid
stateDiagram-v2
    [*] --> Pending: Create payment

    Pending --> Validating: Begin processing
    Validating --> FraudCheck: Pass basic validation
    Validating --> Rejected: Fail validation
    
    FraudCheck --> Approved: Low risk
    FraudCheck --> Review: Medium risk
    FraudCheck --> Rejected: High risk
    
    Review --> Approved: Manual approve
    Review --> Rejected: Manual reject
    
    Approved --> Debiting: Reserve funds
    Debiting --> Crediting: Debit success
    Debiting --> Failed: Insufficient funds
    
    Crediting --> Completed: Credit success
    Crediting --> Reversing: Credit failed
    
    Reversing --> Failed: Reversal complete
    
    Completed --> [*]
    Rejected --> [*]
    Failed --> [*]
```

---

## 6. Multi-Region Architecture (Target State)

```mermaid
flowchart TB
    subgraph Global
        GLB[Global Load Balancer<br>Cloudflare]
    end

    subgraph us-east-1
        GW1[Gateway]
        SVC1[Services]
        DB1[(CockroachDB)]
        KF1[Kafka]
    end

    subgraph us-west-2
        GW2[Gateway]
        SVC2[Services]
        DB2[(CockroachDB)]
        KF2[Kafka]
    end

    subgraph eu-west-1
        GW3[Gateway]
        SVC3[Services]
        DB3[(CockroachDB)]
        KF3[Kafka]
    end

    GLB --> GW1
    GLB --> GW2
    GLB --> GW3

    GW1 --> SVC1
    GW2 --> SVC2
    GW3 --> SVC3

    SVC1 --> DB1
    SVC2 --> DB2
    SVC3 --> DB3

    SVC1 --> KF1
    SVC2 --> KF2
    SVC3 --> KF3

    DB1 <-->|Raft Consensus| DB2
    DB2 <-->|Raft Consensus| DB3
    DB3 <-->|Raft Consensus| DB1

    KF1 <-->|MirrorMaker2| KF2
    KF2 <-->|MirrorMaker2| KF3

    style GLB fill:#f96,stroke:#333,stroke-width:2px
    style DB1 fill:#9cf,stroke:#333
    style DB2 fill:#9cf,stroke:#333
    style DB3 fill:#9cf,stroke:#333
```

**Note:** Multi-region is a P0 gap. See [p0_gaps.md](../p0_gaps.md).

---

## How to Render

### GitHub
Mermaid diagrams render automatically in GitHub markdown files.

### VS Code
Install the "Markdown Preview Mermaid Support" extension.

### Online
Paste code blocks at [mermaid.live](https://mermaid.live/).

### Command Line
```bash
npm install -g @mermaid-js/mermaid-cli
mmdc -i diagrams.md -o diagrams.pdf
```

---

*Diagrams source: docs/appendix/mermaid_diagrams.md*
