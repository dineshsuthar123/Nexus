package audit

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// ============================================================================
// VERIFICATION ERRORS
// ============================================================================

// VerificationError represents a specific verification failure
type VerificationError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
	Details string `json:"details,omitempty"`
}

func (e *VerificationError) Error() string {
	if e.Field != "" {
		return fmt.Sprintf("%s: %s (field: %s)", e.Code, e.Message, e.Field)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Verification error codes
const (
	ErrCodeSignatureInvalid    = "SIGNATURE_INVALID"
	ErrCodeHashMismatch        = "HASH_MISMATCH"
	ErrCodeHashChainBroken     = "HASH_CHAIN_BROKEN"
	ErrCodeMerkleRootMismatch  = "MERKLE_ROOT_MISMATCH"
	ErrCodeBalanceInvariant    = "BALANCE_INVARIANT_VIOLATED"
	ErrCodeSchemaViolation     = "SCHEMA_VIOLATION"
	ErrCodeExpiredBundle       = "BUNDLE_EXPIRED"
	ErrCodeMissingField        = "MISSING_REQUIRED_FIELD"
)

// ============================================================================
// VERIFICATION RESULT
// ============================================================================

// VerificationResult contains the complete verification outcome
type VerificationResult struct {
	Valid            bool                 `json:"valid"`
	VerifiedAt       time.Time            `json:"verified_at"`
	BundleID         string               `json:"bundle_id"`
	SigningKeyID     string               `json:"signing_key_id"`
	Checks           []CheckResult        `json:"checks"`
	Errors           []VerificationError  `json:"errors,omitempty"`
	Warnings         []string             `json:"warnings,omitempty"`
}

// CheckResult represents result of a single verification check
type CheckResult struct {
	Name    string `json:"name"`
	Passed  bool   `json:"passed"`
	Details string `json:"details,omitempty"`
}

// ============================================================================
// VERIFIER
// ============================================================================

// Verifier validates audit bundles
type Verifier struct {
	trustedKeys map[string]ed25519.PublicKey
}

// NewVerifier creates a new verifier
func NewVerifier() *Verifier {
	return &Verifier{
		trustedKeys: make(map[string]ed25519.PublicKey),
	}
}

// AddTrustedKey adds a trusted public key
func (v *Verifier) AddTrustedKey(keyID string, publicKey ed25519.PublicKey) {
	v.trustedKeys[keyID] = publicKey
}

// Verify performs complete verification of an audit bundle
func (v *Verifier) Verify(bundle *AuditBundle) *VerificationResult {
	result := &VerificationResult{
		Valid:        true,
		VerifiedAt:   time.Now().UTC(),
		BundleID:     bundle.BundleID,
		SigningKeyID: bundle.Signatures.SigningKeyID,
		Checks:       make([]CheckResult, 0),
		Errors:       make([]VerificationError, 0),
		Warnings:     make([]string, 0),
	}
	
	// 1. Schema validation
	v.checkSchema(bundle, result)
	
	// 2. Signature verification
	v.checkSignature(bundle, result)
	
	// 3. Evidence hash verification
	v.checkEvidenceHash(bundle, result)
	
	// 4. Hash chain verification
	v.checkHashChain(bundle, result)
	
	// 5. Merkle root verification
	v.checkMerkleRoot(bundle, result)
	
	// 6. Balance invariant check
	v.checkBalanceInvariant(bundle, result)
	
	// 7. Temporal consistency
	v.checkTemporalConsistency(bundle, result)
	
	// 8. Balance proof verification
	v.checkBalanceProofs(bundle, result)
	
	// Set overall validity
	result.Valid = len(result.Errors) == 0
	
	return result
}

// VerifyJSON verifies a bundle from JSON bytes
func (v *Verifier) VerifyJSON(data []byte) (*VerificationResult, error) {
	var bundle AuditBundle
	if err := json.Unmarshal(data, &bundle); err != nil {
		return nil, fmt.Errorf("failed to parse bundle JSON: %w", err)
	}
	
	return v.Verify(&bundle), nil
}

// checkSchema validates required fields
func (v *Verifier) checkSchema(bundle *AuditBundle, result *VerificationResult) {
	check := CheckResult{Name: "Schema Validation", Passed: true}
	
	// Required fields
	if bundle.BundleID == "" {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeMissingField,
			Message: "bundle_id is required",
			Field:   "bundle_id",
		})
		check.Passed = false
	}
	
	if bundle.Version != "1.0.0" {
		result.Warnings = append(result.Warnings, 
			fmt.Sprintf("Unknown bundle version: %s", bundle.Version))
	}
	
	if bundle.Integrity.EvidenceHash == "" {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeMissingField,
			Message: "evidence_hash is required",
			Field:   "integrity.evidence_hash",
		})
		check.Passed = false
	}
	
	if bundle.Signatures.BundleSignature == "" {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeMissingField,
			Message: "bundle_signature is required",
			Field:   "signatures.bundle_signature",
		})
		check.Passed = false
	}
	
	check.Details = fmt.Sprintf("Version: %s, Transactions: %d, Accounts: %d",
		bundle.Version,
		len(bundle.Evidence.Transactions),
		len(bundle.Evidence.Accounts))
	
	result.Checks = append(result.Checks, check)
}

// checkSignature verifies Ed25519 signature
func (v *Verifier) checkSignature(bundle *AuditBundle, result *VerificationResult) {
	check := CheckResult{Name: "Signature Verification", Passed: false}
	
	// Get public key
	publicKey, ok := v.trustedKeys[bundle.Signatures.SigningKeyID]
	if !ok {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeSignatureInvalid,
			Message: "signing key not in trusted keys",
			Field:   "signatures.signing_key_id",
			Details: bundle.Signatures.SigningKeyID,
		})
		result.Checks = append(result.Checks, check)
		return
	}
	
	// Decode signature
	signature, err := base64.StdEncoding.DecodeString(bundle.Signatures.BundleSignature)
	if err != nil {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeSignatureInvalid,
			Message: "failed to decode signature",
			Details: err.Error(),
		})
		result.Checks = append(result.Checks, check)
		return
	}
	
	// Decode evidence hash
	evidenceHash, err := decodeHex(bundle.Integrity.EvidenceHash)
	if err != nil {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeSignatureInvalid,
			Message: "failed to decode evidence hash",
			Details: err.Error(),
		})
		result.Checks = append(result.Checks, check)
		return
	}
	
	// Verify signature
	if !ed25519.Verify(publicKey, evidenceHash, signature) {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeSignatureInvalid,
			Message: "Ed25519 signature verification failed",
		})
		result.Checks = append(result.Checks, check)
		return
	}
	
	check.Passed = true
	check.Details = fmt.Sprintf("Key: %s, Signed: %s",
		bundle.Signatures.SigningKeyID,
		bundle.Signatures.SignedAt.Format(time.RFC3339))
	
	result.Checks = append(result.Checks, check)
}

// checkEvidenceHash recomputes and compares evidence hash
func (v *Verifier) checkEvidenceHash(bundle *AuditBundle, result *VerificationResult) {
	check := CheckResult{Name: "Evidence Hash Verification", Passed: false}
	
	// Serialize evidence
	evidenceJSON, err := json.Marshal(bundle.Evidence)
	if err != nil {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeHashMismatch,
			Message: "failed to serialize evidence",
			Details: err.Error(),
		})
		result.Checks = append(result.Checks, check)
		return
	}
	
	// Compute hash
	computed := sha256.Sum256(evidenceJSON)
	computedHex := fmt.Sprintf("%x", computed)
	
	if computedHex != bundle.Integrity.EvidenceHash {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeHashMismatch,
			Message: "evidence hash mismatch - data may be tampered",
			Field:   "integrity.evidence_hash",
			Details: fmt.Sprintf("expected: %s, computed: %s",
				bundle.Integrity.EvidenceHash, computedHex),
		})
		result.Checks = append(result.Checks, check)
		return
	}
	
	check.Passed = true
	check.Details = fmt.Sprintf("Hash: %s...%s",
		bundle.Integrity.EvidenceHash[:8],
		bundle.Integrity.EvidenceHash[len(bundle.Integrity.EvidenceHash)-8:])
	
	result.Checks = append(result.Checks, check)
}

// checkHashChain verifies transaction hash chain
func (v *Verifier) checkHashChain(bundle *AuditBundle, result *VerificationResult) {
	check := CheckResult{Name: "Hash Chain Verification", Passed: true}
	
	if len(bundle.Evidence.Transactions) == 0 {
		check.Details = "No transactions to verify"
		result.Checks = append(result.Checks, check)
		return
	}
	
	// Check if bundle reports hash chain status
	if !bundle.Integrity.HashChainVerified {
		if bundle.Integrity.HashChainBreak != "" {
			result.Errors = append(result.Errors, VerificationError{
				Code:    ErrCodeHashChainBroken,
				Message: "hash chain broken",
				Details: fmt.Sprintf("break at transaction: %s", bundle.Integrity.HashChainBreak),
			})
			check.Passed = false
		}
	}
	
	// Independent verification
	var prevHash [32]byte
	verified := 0
	
	for _, tx := range bundle.Evidence.Transactions {
		if tx.EntryHash == "" {
			continue
		}
		
		// Compute expected hash
		data := fmt.Sprintf("%s|%s|%d|%x",
			tx.TransactionID,
			tx.Timestamp.Format(time.RFC3339Nano),
			sumEntries(tx.Entries),
			prevHash)
		expectedHash := sha256.Sum256([]byte(data))
		
		if tx.EntryHash != fmt.Sprintf("%x", expectedHash) {
			result.Errors = append(result.Errors, VerificationError{
				Code:    ErrCodeHashChainBroken,
				Message: "hash chain verification failed",
				Details: fmt.Sprintf("transaction: %s", tx.TransactionID),
			})
			check.Passed = false
			break
		}
		
		prevHash = expectedHash
		verified++
	}
	
	check.Details = fmt.Sprintf("Verified %d transactions", verified)
	result.Checks = append(result.Checks, check)
}

// sumEntries helper
func sumEntries(entries []Entry) Amount {
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

// checkMerkleRoot verifies Merkle root
func (v *Verifier) checkMerkleRoot(bundle *AuditBundle, result *VerificationResult) {
	check := CheckResult{Name: "Merkle Root Verification", Passed: false}
	
	if len(bundle.Evidence.Transactions) == 0 {
		check.Passed = true
		check.Details = "No transactions"
		result.Checks = append(result.Checks, check)
		return
	}
	
	// Compute Merkle root
	hashes := make([][32]byte, len(bundle.Evidence.Transactions))
	for i, tx := range bundle.Evidence.Transactions {
		data := fmt.Sprintf("%s|%s|%s",
			tx.TransactionID,
			tx.Timestamp.Format(time.RFC3339Nano),
			tx.Status)
		hashes[i] = sha256.Sum256([]byte(data))
	}
	
	// Build tree
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
	
	computed := fmt.Sprintf("%x", hashes[0])
	
	if computed != bundle.Integrity.MerkleRoot {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeMerkleRootMismatch,
			Message: "Merkle root mismatch",
			Details: fmt.Sprintf("expected: %s, computed: %s",
				bundle.Integrity.MerkleRoot, computed),
		})
		result.Checks = append(result.Checks, check)
		return
	}
	
	check.Passed = true
	check.Details = fmt.Sprintf("Root: %s...%s", computed[:8], computed[len(computed)-8:])
	result.Checks = append(result.Checks, check)
}

// checkBalanceInvariant verifies debits == credits
func (v *Verifier) checkBalanceInvariant(bundle *AuditBundle, result *VerificationResult) {
	check := CheckResult{Name: "Balance Invariant (Debits = Credits)", Passed: false}
	
	var totalDebits, totalCredits Amount
	
	for _, tx := range bundle.Evidence.Transactions {
		for _, entry := range tx.Entries {
			if entry.Direction == DirectionDebit {
				totalDebits += entry.Amount
			} else {
				totalCredits += entry.Amount
			}
		}
	}
	
	if totalDebits != totalCredits {
		result.Errors = append(result.Errors, VerificationError{
			Code:    ErrCodeBalanceInvariant,
			Message: "conservation of value violated",
			Details: fmt.Sprintf("debits: %d, credits: %d, difference: %d",
				totalDebits, totalCredits, totalDebits-totalCredits),
		})
		result.Checks = append(result.Checks, check)
		return
	}
	
	check.Passed = true
	check.Details = fmt.Sprintf("Total: %d (balanced)", totalDebits)
	result.Checks = append(result.Checks, check)
}

// checkTemporalConsistency verifies timestamps are consistent
func (v *Verifier) checkTemporalConsistency(bundle *AuditBundle, result *VerificationResult) {
	check := CheckResult{Name: "Temporal Consistency", Passed: true}
	
	// Check transactions are within scope
	scope := bundle.Request.Scope
	outOfScope := 0
	
	for _, tx := range bundle.Evidence.Transactions {
		if tx.Timestamp.Before(scope.PeriodStart) || tx.Timestamp.After(scope.PeriodEnd) {
			outOfScope++
		}
	}
	
	if outOfScope > 0 {
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("%d transactions outside requested scope", outOfScope))
	}
	
	// Check bundle wasn't generated in the future
	if bundle.GeneratedAt.After(time.Now().Add(5 * time.Minute)) {
		result.Warnings = append(result.Warnings,
			"Bundle generation timestamp is in the future")
	}
	
	check.Details = fmt.Sprintf("Scope: %s to %s",
		scope.PeriodStart.Format("2006-01-02"),
		scope.PeriodEnd.Format("2006-01-02"))
	
	result.Checks = append(result.Checks, check)
}

// checkBalanceProofs verifies step-by-step balance derivations
func (v *Verifier) checkBalanceProofs(bundle *AuditBundle, result *VerificationResult) {
	check := CheckResult{Name: "Balance Proof Verification", Passed: true}
	
	if len(bundle.Evidence.BalanceProofs) == 0 {
		check.Details = "No balance proofs to verify"
		result.Checks = append(result.Checks, check)
		return
	}
	
	verified := 0
	for _, proof := range bundle.Evidence.BalanceProofs {
		if !v.verifyProof(proof, result) {
			check.Passed = false
		} else {
			verified++
		}
	}
	
	check.Details = fmt.Sprintf("Verified %d/%d account proofs",
		verified, len(bundle.Evidence.BalanceProofs))
	
	result.Checks = append(result.Checks, check)
}

// verifyProof verifies a single balance proof
func (v *Verifier) verifyProof(proof BalanceProof, result *VerificationResult) bool {
	if len(proof.Steps) == 0 {
		return true
	}
	
	var prevHash [32]byte
	
	for i, step := range proof.Steps {
		// Verify balance arithmetic
		expectedAfter := step.BalanceBefore
		if step.Operation == DirectionCredit {
			expectedAfter += step.Amount
		} else {
			expectedAfter -= step.Amount
		}
		
		if step.BalanceAfter != expectedAfter {
			result.Errors = append(result.Errors, VerificationError{
				Code:    ErrCodeBalanceInvariant,
				Message: "balance derivation arithmetic error",
				Field:   fmt.Sprintf("balance_proofs[%s].steps[%d]", proof.AccountID, i),
				Details: fmt.Sprintf("expected: %d, found: %d", expectedAfter, step.BalanceAfter),
			})
			return false
		}
		
		// Verify step hash
		stepData := fmt.Sprintf("%d|%s|%s|%d|%d|%d|%x",
			step.StepNumber,
			step.TransactionID,
			step.Operation,
			step.Amount,
			step.BalanceBefore,
			step.BalanceAfter,
			prevHash)
		stepHash := sha256.Sum256([]byte(stepData))
		
		if step.StepHash != fmt.Sprintf("%x", stepHash) {
			result.Errors = append(result.Errors, VerificationError{
				Code:    ErrCodeHashChainBroken,
				Message: "balance proof hash chain broken",
				Field:   fmt.Sprintf("balance_proofs[%s].steps[%d]", proof.AccountID, i),
			})
			return false
		}
		
		prevHash = stepHash
	}
	
	return true
}

// ============================================================================
// QUICK VERIFICATION
// ============================================================================

// QuickVerify performs minimal verification (hash + signature only)
func QuickVerify(bundle *AuditBundle, publicKey ed25519.PublicKey) error {
	// Verify evidence hash
	evidenceJSON, err := json.Marshal(bundle.Evidence)
	if err != nil {
		return errors.New("failed to serialize evidence")
	}
	
	computed := sha256.Sum256(evidenceJSON)
	if fmt.Sprintf("%x", computed) != bundle.Integrity.EvidenceHash {
		return errors.New("evidence hash mismatch")
	}
	
	// Verify signature
	signature, err := base64.StdEncoding.DecodeString(bundle.Signatures.BundleSignature)
	if err != nil {
		return errors.New("invalid signature encoding")
	}
	
	evidenceHash, _ := decodeHex(bundle.Integrity.EvidenceHash)
	
	if !ed25519.Verify(publicKey, evidenceHash, signature) {
		return errors.New("signature verification failed")
	}
	
	return nil
}
