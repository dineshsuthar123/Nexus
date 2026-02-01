package audit

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
)

// ============================================================================
// DOMAIN TYPES
// ============================================================================

// Amount represents monetary value in smallest currency unit (int64 only)
type Amount int64

// Direction indicates debit or credit
type Direction string

const (
	DirectionDebit  Direction = "DEBIT"
	DirectionCredit Direction = "CREDIT"
)

// TransactionStatus represents the state of a transaction
type TransactionStatus string

const (
	StatusCompleted TransactionStatus = "COMPLETED"
	StatusPending   TransactionStatus = "PENDING"
	StatusFailed    TransactionStatus = "FAILED"
	StatusReversed  TransactionStatus = "REVERSED"
)

// TransactionType categorizes transactions
type TransactionType string

const (
	TypeTransfer     TransactionType = "TRANSFER"
	TypeDeposit      TransactionType = "DEPOSIT"
	TypeWithdrawal   TransactionType = "WITHDRAWAL"
	TypeFXConversion TransactionType = "FX_CONVERSION"
	TypeFee          TransactionType = "FEE"
	TypeInterest     TransactionType = "INTEREST"
	TypeAdjustment   TransactionType = "ADJUSTMENT"
	TypeReversal     TransactionType = "REVERSAL"
)

// RequestType categorizes audit requests
type RequestType string

const (
	RequestRegulatoryExam    RequestType = "REGULATORY_EXAMINATION"
	RequestAnnualAudit       RequestType = "ANNUAL_AUDIT"
	RequestIncident          RequestType = "INCIDENT_INVESTIGATION"
	RequestCustomerDispute   RequestType = "CUSTOMER_DISPUTE"
	RequestAMLSAR            RequestType = "AML_SAR"
	RequestLegalDiscovery    RequestType = "LEGAL_DISCOVERY"
	RequestInternalReview    RequestType = "INTERNAL_REVIEW"
)

// ============================================================================
// AUDIT BUNDLE TYPES
// ============================================================================

// AuditBundle is the complete signed audit artifact
type AuditBundle struct {
	BundleID    string           `json:"bundle_id"`
	Version     string           `json:"version"`
	GeneratedAt time.Time        `json:"generated_at"`
	Request     AuditRequest     `json:"request"`
	Evidence    Evidence         `json:"evidence"`
	Integrity   Integrity        `json:"integrity"`
	Signatures  Signatures       `json:"signatures"`
	Metadata    BundleMetadata   `json:"metadata,omitempty"`
}

// AuditRequest describes the audit request
type AuditRequest struct {
	RequestID   string      `json:"request_id"`
	Requester   Requester   `json:"requester"`
	RequestType RequestType `json:"request_type"`
	Scope       Scope       `json:"scope"`
	ReceivedAt  time.Time   `json:"received_at,omitempty"`
	DueDate     string      `json:"due_date,omitempty"`
}

// Requester identifies who requested the audit
type Requester struct {
	Name         string `json:"name"`
	Organization string `json:"organization"`
	Jurisdiction string `json:"jurisdiction"`
	ContactEmail string `json:"contact_email,omitempty"`
}

// Scope defines what the audit covers
type Scope struct {
	PeriodStart    time.Time `json:"period_start"`
	PeriodEnd      time.Time `json:"period_end"`
	AccountIDs     []string  `json:"account_ids,omitempty"`
	TransactionIDs []string  `json:"transaction_ids,omitempty"`
	Currencies     []string  `json:"currencies,omitempty"`
	MinimumAmount  Amount    `json:"minimum_amount,omitempty"`
}

// Evidence contains the actual audit data
type Evidence struct {
	Summary       Summary        `json:"summary"`
	Accounts      []AccountInfo  `json:"accounts"`
	Transactions  []Transaction  `json:"transactions"`
	BalanceProofs []BalanceProof `json:"balance_proofs,omitempty"`
}

// Summary provides overview statistics
type Summary struct {
	TotalAccounts      int               `json:"total_accounts"`
	TotalTransactions  int               `json:"total_transactions"`
	TotalVolume        map[string]Amount `json:"total_volume"`
	CurrenciesInvolved []string          `json:"currencies_involved"`
	PeriodCovered      PeriodCovered     `json:"period_covered,omitempty"`
}

// PeriodCovered shows actual date range of data
type PeriodCovered struct {
	FirstTransaction time.Time `json:"first_transaction"`
	LastTransaction  time.Time `json:"last_transaction"`
}

// AccountInfo contains account-level audit data
type AccountInfo struct {
	AccountID             string `json:"account_id"`
	AccountType           string `json:"account_type,omitempty"`
	OpeningBalance        Amount `json:"opening_balance"`
	ClosingBalance        Amount `json:"closing_balance"`
	Currency              string `json:"currency"`
	TransactionCount      int    `json:"transaction_count"`
	TotalCredits          Amount `json:"total_credits,omitempty"`
	TotalDebits           Amount `json:"total_debits,omitempty"`
	BalanceDerivationHash string `json:"balance_derivation_hash,omitempty"`
}

// Transaction represents a ledger transaction
type Transaction struct {
	TransactionID  string            `json:"transaction_id"`
	IdempotencyKey string            `json:"idempotency_key,omitempty"`
	Timestamp      time.Time         `json:"timestamp"`
	Type           TransactionType   `json:"type,omitempty"`
	Status         TransactionStatus `json:"status"`
	Entries        []Entry           `json:"entries"`
	Metadata       json.RawMessage   `json:"metadata,omitempty"`
	Reference      string            `json:"reference,omitempty"`
	Counterparty   *Counterparty     `json:"counterparty,omitempty"`
	FXDetails      *FXDetails        `json:"fx_details,omitempty"`
	EntryHash      string            `json:"entry_hash,omitempty"`
}

// Entry represents one side of a double-entry transaction
type Entry struct {
	AccountID           string    `json:"account_id"`
	Amount              Amount    `json:"amount"`
	Direction           Direction `json:"direction"`
	Currency            string    `json:"currency"`
	RunningBalanceAfter Amount    `json:"running_balance_after,omitempty"`
}

// Counterparty identifies external party
type Counterparty struct {
	Name        string `json:"name,omitempty"`
	Account     string `json:"account,omitempty"`
	Institution string `json:"institution,omitempty"`
}

// FXDetails contains foreign exchange information
type FXDetails struct {
	SourceCurrency string    `json:"source_currency"`
	TargetCurrency string    `json:"target_currency"`
	Rate           float64   `json:"rate"`
	RateTimestamp  time.Time `json:"rate_timestamp"`
	RateSource     string    `json:"rate_source"`
}

// BalanceProof provides step-by-step derivation
type BalanceProof struct {
	AccountID  string      `json:"account_id"`
	Steps      []ProofStep `json:"steps"`
	MerkleRoot string      `json:"merkle_root,omitempty"`
}

// ProofStep is one step in balance derivation
type ProofStep struct {
	StepNumber    int       `json:"step_number"`
	TransactionID string    `json:"transaction_id"`
	Timestamp     time.Time `json:"timestamp"`
	Operation     Direction `json:"operation"`
	Amount        Amount    `json:"amount"`
	BalanceBefore Amount    `json:"balance_before"`
	BalanceAfter  Amount    `json:"balance_after"`
	StepHash      string    `json:"step_hash"`
}

// Integrity contains cryptographic proofs
type Integrity struct {
	Algorithm            string              `json:"algorithm"`
	EvidenceHash         string              `json:"evidence_hash"`
	HashChainVerified    bool                `json:"hash_chain_verified"`
	HashChainBreak       string              `json:"hash_chain_break,omitempty"`
	MerkleRoot           string              `json:"merkle_root"`
	BalanceInvariantCheck *InvariantCheck    `json:"balance_invariant_check,omitempty"`
}

// InvariantCheck verifies ledger invariants
type InvariantCheck struct {
	Passed       bool   `json:"passed"`
	TotalDebits  Amount `json:"total_debits"`
	TotalCredits Amount `json:"total_credits"`
	Difference   Amount `json:"difference"`
}

// Signatures contains cryptographic signatures
type Signatures struct {
	BundleSignature    string              `json:"bundle_signature"`
	SigningKeyID       string              `json:"signing_key_id"`
	SignedAt           time.Time           `json:"signed_at"`
	SignerIdentity     string              `json:"signer_identity,omitempty"`
	CertificateChain   []string            `json:"certificate_chain,omitempty"`
	TimestampAuthority *TimestampAuthority `json:"timestamp_authority,omitempty"`
	WitnessSignatures  []WitnessSignature  `json:"witness_signatures,omitempty"`
}

// TimestampAuthority provides RFC 3161 timestamp
type TimestampAuthority struct {
	TSAURL         string    `json:"tsa_url"`
	TimestampToken string    `json:"timestamp_token"`
	Timestamp      time.Time `json:"timestamp"`
}

// WitnessSignature for multi-party attestation
type WitnessSignature struct {
	WitnessID string    `json:"witness_id"`
	Role      string    `json:"role"`
	Signature string    `json:"signature"`
	SignedAt  time.Time `json:"signed_at"`
}

// BundleMetadata contains tracking information
type BundleMetadata struct {
	SystemVersion        string     `json:"system_version,omitempty"`
	GenerationDurationMS int64      `json:"generation_duration_ms,omitempty"`
	Compression          string     `json:"compression,omitempty"`
	Retention            *Retention `json:"retention,omitempty"`
	ComplianceFrameworks []string   `json:"compliance_frameworks,omitempty"`
}

// Retention defines data retention policy
type Retention struct {
	Policy      string `json:"policy"`
	DeleteAfter string `json:"delete_after,omitempty"`
	LegalHold   bool   `json:"legal_hold"`
}

// ============================================================================
// BUNDLE SIGNER
// ============================================================================

// Signer creates signed audit bundles
type Signer struct {
	privateKey     ed25519.PrivateKey
	publicKey      ed25519.PublicKey
	keyID          string
	signerIdentity string
}

// NewSigner creates a new signer with Ed25519 key pair
func NewSigner(keyID, signerIdentity string) (*Signer, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("failed to generate key pair: %w", err)
	}
	
	return &Signer{
		privateKey:     priv,
		publicKey:      pub,
		keyID:          keyID,
		signerIdentity: signerIdentity,
	}, nil
}

// NewSignerFromKey creates a signer from existing private key
func NewSignerFromKey(privateKey ed25519.PrivateKey, keyID, signerIdentity string) *Signer {
	return &Signer{
		privateKey:     privateKey,
		publicKey:      privateKey.Public().(ed25519.PublicKey),
		keyID:          keyID,
		signerIdentity: signerIdentity,
	}
}

// PublicKey returns the public key for verification
func (s *Signer) PublicKey() ed25519.PublicKey {
	return s.publicKey
}

// CreateBundle creates a signed audit bundle from evidence
func (s *Signer) CreateBundle(request AuditRequest, evidence Evidence) (*AuditBundle, error) {
	startTime := time.Now()
	
	// Generate bundle ID
	bundleID := uuid.New().String()
	
	// Compute integrity proofs
	integrity, err := s.computeIntegrity(evidence)
	if err != nil {
		return nil, fmt.Errorf("failed to compute integrity: %w", err)
	}
	
	// Create bundle (unsigned)
	bundle := &AuditBundle{
		BundleID:    bundleID,
		Version:     "1.0.0",
		GeneratedAt: time.Now().UTC(),
		Request:     request,
		Evidence:    evidence,
		Integrity:   integrity,
		Metadata: BundleMetadata{
			SystemVersion:        "nexus-rtp-1.0.0",
			GenerationDurationMS: time.Since(startTime).Milliseconds(),
			Compression:          "none",
			Retention: &Retention{
				Policy:    "7_YEARS",
				LegalHold: false,
			},
		},
	}
	
	// Sign the bundle
	signature, err := s.sign(integrity.EvidenceHash)
	if err != nil {
		return nil, fmt.Errorf("failed to sign bundle: %w", err)
	}
	
	bundle.Signatures = Signatures{
		BundleSignature: signature,
		SigningKeyID:    s.keyID,
		SignedAt:        time.Now().UTC(),
		SignerIdentity:  s.signerIdentity,
	}
	
	bundle.Metadata.GenerationDurationMS = time.Since(startTime).Milliseconds()
	
	return bundle, nil
}

// computeIntegrity computes all cryptographic proofs
func (s *Signer) computeIntegrity(evidence Evidence) (Integrity, error) {
	// Serialize evidence to canonical JSON
	evidenceJSON, err := json.Marshal(evidence)
	if err != nil {
		return Integrity{}, fmt.Errorf("failed to marshal evidence: %w", err)
	}
	
	// Compute evidence hash
	evidenceHash := sha256.Sum256(evidenceJSON)
	
	// Verify hash chain on transactions
	hashChainVerified, hashChainBreak := s.verifyHashChain(evidence.Transactions)
	
	// Compute Merkle root of transaction hashes
	merkleRoot := s.computeMerkleRoot(evidence.Transactions)
	
	// Verify balance invariant (debits = credits)
	invariantCheck := s.checkBalanceInvariant(evidence.Transactions)
	
	return Integrity{
		Algorithm:             "SHA-256",
		EvidenceHash:          fmt.Sprintf("%x", evidenceHash),
		HashChainVerified:     hashChainVerified,
		HashChainBreak:        hashChainBreak,
		MerkleRoot:            merkleRoot,
		BalanceInvariantCheck: invariantCheck,
	}, nil
}

// verifyHashChain checks transaction hash chain integrity
func (s *Signer) verifyHashChain(transactions []Transaction) (bool, string) {
	if len(transactions) == 0 {
		return true, ""
	}
	
	var prevHash [32]byte
	for _, tx := range transactions {
		if tx.EntryHash == "" {
			continue // Skip transactions without hash chain
		}
		
		// Compute expected hash
		expectedHash := s.computeTransactionHash(tx, prevHash)
		
		if tx.EntryHash != fmt.Sprintf("%x", expectedHash) {
			return false, tx.TransactionID
		}
		
		prevHash = expectedHash
	}
	
	return true, ""
}

// computeTransactionHash computes hash for a transaction
func (s *Signer) computeTransactionHash(tx Transaction, prevHash [32]byte) [32]byte {
	data := fmt.Sprintf("%s|%s|%d|%x",
		tx.TransactionID,
		tx.Timestamp.Format(time.RFC3339Nano),
		s.sumEntries(tx.Entries),
		prevHash)
	
	return sha256.Sum256([]byte(data))
}

// sumEntries sums all entry amounts
func (s *Signer) sumEntries(entries []Entry) Amount {
	var sum Amount
	for _, e := range entries {
		if e.Direction == DirectionCredit {
			sum += e.Amount
		} else {
			sum -= e.Amount
		}
	}
	return sum
}

// computeMerkleRoot computes Merkle root of transaction hashes
func (s *Signer) computeMerkleRoot(transactions []Transaction) string {
	if len(transactions) == 0 {
		return fmt.Sprintf("%x", sha256.Sum256(nil))
	}
	
	// Collect leaf hashes
	hashes := make([][32]byte, len(transactions))
	for i, tx := range transactions {
		data := fmt.Sprintf("%s|%s|%s",
			tx.TransactionID,
			tx.Timestamp.Format(time.RFC3339Nano),
			tx.Status)
		hashes[i] = sha256.Sum256([]byte(data))
	}
	
	// Build tree bottom-up
	for len(hashes) > 1 {
		if len(hashes)%2 == 1 {
			// Duplicate last hash if odd number
			hashes = append(hashes, hashes[len(hashes)-1])
		}
		
		newLevel := make([][32]byte, len(hashes)/2)
		for i := 0; i < len(hashes); i += 2 {
			combined := append(hashes[i][:], hashes[i+1][:]...)
			newLevel[i/2] = sha256.Sum256(combined)
		}
		hashes = newLevel
	}
	
	return fmt.Sprintf("%x", hashes[0])
}

// checkBalanceInvariant verifies debits == credits
func (s *Signer) checkBalanceInvariant(transactions []Transaction) *InvariantCheck {
	var totalDebits, totalCredits Amount
	
	for _, tx := range transactions {
		for _, entry := range tx.Entries {
			if entry.Direction == DirectionDebit {
				totalDebits += entry.Amount
			} else {
				totalCredits += entry.Amount
			}
		}
	}
	
	return &InvariantCheck{
		Passed:       totalDebits == totalCredits,
		TotalDebits:  totalDebits,
		TotalCredits: totalCredits,
		Difference:   totalDebits - totalCredits,
	}
}

// sign creates Ed25519 signature of data
func (s *Signer) sign(data string) (string, error) {
	hash, err := decodeHex(data)
	if err != nil {
		return "", err
	}
	
	signature := ed25519.Sign(s.privateKey, hash)
	return base64.StdEncoding.EncodeToString(signature), nil
}

// decodeHex decodes hex string to bytes
func decodeHex(s string) ([]byte, error) {
	if len(s)%2 != 0 {
		return nil, errors.New("invalid hex string length")
	}
	
	result := make([]byte, len(s)/2)
	for i := 0; i < len(s); i += 2 {
		var b byte
		_, err := fmt.Sscanf(s[i:i+2], "%02x", &b)
		if err != nil {
			return nil, err
		}
		result[i/2] = b
	}
	return result, nil
}

// ============================================================================
// BUNDLE BUILDER
// ============================================================================

// BundleBuilder helps construct audit bundles
type BundleBuilder struct {
	request      AuditRequest
	accounts     []AccountInfo
	transactions []Transaction
}

// NewBundleBuilder creates a new builder
func NewBundleBuilder(request AuditRequest) *BundleBuilder {
	return &BundleBuilder{
		request:      request,
		accounts:     make([]AccountInfo, 0),
		transactions: make([]Transaction, 0),
	}
}

// AddAccount adds an account to the bundle
func (b *BundleBuilder) AddAccount(account AccountInfo) *BundleBuilder {
	b.accounts = append(b.accounts, account)
	return b
}

// AddTransaction adds a transaction to the bundle
func (b *BundleBuilder) AddTransaction(tx Transaction) *BundleBuilder {
	b.transactions = append(b.transactions, tx)
	return b
}

// Build creates the Evidence from builder state
func (b *BundleBuilder) Build() Evidence {
	// Sort transactions by timestamp
	sort.Slice(b.transactions, func(i, j int) bool {
		return b.transactions[i].Timestamp.Before(b.transactions[j].Timestamp)
	})
	
	// Compute summary
	summary := b.computeSummary()
	
	// Generate balance proofs
	balanceProofs := b.generateBalanceProofs()
	
	return Evidence{
		Summary:       summary,
		Accounts:      b.accounts,
		Transactions:  b.transactions,
		BalanceProofs: balanceProofs,
	}
}

// computeSummary generates summary statistics
func (b *BundleBuilder) computeSummary() Summary {
	volume := make(map[string]Amount)
	currencies := make(map[string]bool)
	
	var firstTx, lastTx time.Time
	
	for i, tx := range b.transactions {
		if i == 0 {
			firstTx = tx.Timestamp
		}
		lastTx = tx.Timestamp
		
		for _, entry := range tx.Entries {
			if entry.Direction == DirectionCredit {
				volume[entry.Currency] += entry.Amount
			}
			currencies[entry.Currency] = true
		}
	}
	
	currList := make([]string, 0, len(currencies))
	for c := range currencies {
		currList = append(currList, c)
	}
	sort.Strings(currList)
	
	return Summary{
		TotalAccounts:      len(b.accounts),
		TotalTransactions:  len(b.transactions),
		TotalVolume:        volume,
		CurrenciesInvolved: currList,
		PeriodCovered: PeriodCovered{
			FirstTransaction: firstTx,
			LastTransaction:  lastTx,
		},
	}
}

// generateBalanceProofs creates step-by-step derivation
func (b *BundleBuilder) generateBalanceProofs() []BalanceProof {
	// Group transactions by account
	byAccount := make(map[string][]Transaction)
	for _, tx := range b.transactions {
		for _, entry := range tx.Entries {
			byAccount[entry.AccountID] = append(byAccount[entry.AccountID], tx)
		}
	}
	
	proofs := make([]BalanceProof, 0)
	
	for accountID, txs := range byAccount {
		// Find account info
		var opening Amount
		for _, acc := range b.accounts {
			if acc.AccountID == accountID {
				opening = acc.OpeningBalance
				break
			}
		}
		
		proof := BalanceProof{
			AccountID: accountID,
			Steps:     make([]ProofStep, 0),
		}
		
		balance := opening
		var prevHash [32]byte
		
		for i, tx := range txs {
			for _, entry := range tx.Entries {
				if entry.AccountID != accountID {
					continue
				}
				
				balanceBefore := balance
				if entry.Direction == DirectionCredit {
					balance += entry.Amount
				} else {
					balance -= entry.Amount
				}
				
				// Compute step hash
				stepData := fmt.Sprintf("%d|%s|%s|%d|%d|%d|%x",
					i+1,
					tx.TransactionID,
					entry.Direction,
					entry.Amount,
					balanceBefore,
					balance,
					prevHash)
				stepHash := sha256.Sum256([]byte(stepData))
				
				proof.Steps = append(proof.Steps, ProofStep{
					StepNumber:    len(proof.Steps) + 1,
					TransactionID: tx.TransactionID,
					Timestamp:     tx.Timestamp,
					Operation:     entry.Direction,
					Amount:        entry.Amount,
					BalanceBefore: balanceBefore,
					BalanceAfter:  balance,
					StepHash:      fmt.Sprintf("%x", stepHash),
				})
				
				prevHash = stepHash
			}
		}
		
		// Compute Merkle root for this proof
		if len(proof.Steps) > 0 {
			proof.MerkleRoot = b.computeProofMerkleRoot(proof.Steps)
		}
		
		proofs = append(proofs, proof)
	}
	
	return proofs
}

// computeProofMerkleRoot computes Merkle root for proof steps
func (b *BundleBuilder) computeProofMerkleRoot(steps []ProofStep) string {
	hashes := make([][32]byte, len(steps))
	for i, step := range steps {
		h, _ := decodeHex(step.StepHash)
		copy(hashes[i][:], h)
	}
	
	for len(hashes) > 1 {
		if len(hashes)%2 == 1 {
			hashes = append(hashes, hashes[len(hashes)-1])
		}
		
		newLevel := make([][32]byte, len(hashes)/2)
		for i := 0; i < len(hashes); i += 2 {
			combined := append(hashes[i][:], hashes[i+1][:]...)
			newLevel[i/2] = sha256.Sum256(combined)
		}
		hashes = newLevel
	}
	
	return fmt.Sprintf("%x", hashes[0])
}

// ExportJSON exports bundle to JSON
func (b *AuditBundle) ExportJSON() ([]byte, error) {
	return json.MarshalIndent(b, "", "  ")
}
