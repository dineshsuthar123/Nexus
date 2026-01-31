// Package iso20022 provides validation for ISO 20022 messages
package iso20022

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ValidationError represents a validation error with field path
type ValidationError struct {
	Field   string `json:"field"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e ValidationError) Error() string {
	return fmt.Sprintf("%s: %s (%s)", e.Field, e.Message, e.Code)
}

// ValidationErrors is a collection of validation errors
type ValidationErrors []ValidationError

func (ve ValidationErrors) Error() string {
	if len(ve) == 0 {
		return ""
	}
	var msgs []string
	for _, e := range ve {
		msgs = append(msgs, e.Error())
	}
	return strings.Join(msgs, "; ")
}

// HasErrors returns true if there are validation errors
func (ve ValidationErrors) HasErrors() bool {
	return len(ve) > 0
}

// Validator provides validation for ISO 20022 messages
type Validator struct {
	errors ValidationErrors
}

// NewValidator creates a new validator
func NewValidator() *Validator {
	return &Validator{
		errors: make(ValidationErrors, 0),
	}
}

// Errors returns all validation errors
func (v *Validator) Errors() ValidationErrors {
	return v.errors
}

// addError adds a validation error
func (v *Validator) addError(field, code, message string) {
	v.errors = append(v.errors, ValidationError{
		Field:   field,
		Code:    code,
		Message: message,
	})
}

// ValidatePacs008 validates a pacs.008 message
func (v *Validator) ValidatePacs008(msg *Pacs008) ValidationErrors {
	v.errors = make(ValidationErrors, 0)

	// Validate Group Header
	v.validateGroupHeader008(&msg.GroupHeader)

	// Validate Credit Transfers
	if len(msg.CreditTransfers) == 0 {
		v.addError("creditTransferTransactionInformation", "MISSING", "At least one credit transfer is required")
	}

	for i, ct := range msg.CreditTransfers {
		prefix := fmt.Sprintf("creditTransferTransactionInformation[%d]", i)
		v.validateCreditTransfer08(&ct, prefix)
	}

	// Validate number of transactions matches
	if msg.GroupHeader.NumberOfTransactions != len(msg.CreditTransfers) {
		v.addError("groupHeader.numberOfTransactions", "MISMATCH",
			fmt.Sprintf("Expected %d transactions, got %d",
				msg.GroupHeader.NumberOfTransactions, len(msg.CreditTransfers)))
	}

	return v.errors
}

func (v *Validator) validateGroupHeader008(gh *GroupHeader008) {
	// MessageID
	if gh.MessageID == "" {
		v.addError("groupHeader.messageId", "MISSING", "Message ID is required")
	} else if len(gh.MessageID) > 35 {
		v.addError("groupHeader.messageId", "TOO_LONG", "Message ID must be max 35 characters")
	}

	// CreationDateTime
	if gh.CreationDateTime.IsZero() {
		v.addError("groupHeader.creationDateTime", "MISSING", "Creation date time is required")
	} else if gh.CreationDateTime.After(time.Now().Add(time.Hour)) {
		v.addError("groupHeader.creationDateTime", "FUTURE", "Creation date time cannot be in the future")
	}

	// NumberOfTransactions
	if gh.NumberOfTransactions < 1 {
		v.addError("groupHeader.numberOfTransactions", "INVALID", "Number of transactions must be at least 1")
	}

	// Settlement Information
	v.validateSettlement(&gh.SettlementInfo, "groupHeader.settlementInformation")
}

func (v *Validator) validateSettlement(s *Settlement, prefix string) {
	validMethods := map[string]bool{"CLRG": true, "INDA": true, "INGA": true, "COVE": true}
	if !validMethods[s.Method] {
		v.addError(prefix+".settlementMethod", "INVALID",
			fmt.Sprintf("Settlement method must be one of: CLRG, INDA, INGA, COVE. Got: %s", s.Method))
	}
}

func (v *Validator) validateCreditTransfer08(ct *CreditTransfer08, prefix string) {
	// Payment Identification
	v.validatePaymentIdentification(&ct.PaymentID, prefix+".paymentIdentification")

	// Amount
	v.validateAmount(&ct.InstructedAmount, prefix+".interbankSettlementAmount")

	// Charge Bearer
	if ct.ChargeBearer != "" {
		validChargeBearers := map[string]bool{"DEBT": true, "CRED": true, "SHAR": true, "SLEV": true}
		if !validChargeBearers[ct.ChargeBearer] {
			v.addError(prefix+".chargeBearer", "INVALID",
				fmt.Sprintf("Charge bearer must be one of: DEBT, CRED, SHAR, SLEV. Got: %s", ct.ChargeBearer))
		}
	}

	// Debtor
	v.validateParty(&ct.Debtor, prefix+".debtor", true)

	// Creditor
	v.validateParty(&ct.Creditor, prefix+".creditor", true)
}

func (v *Validator) validatePaymentIdentification(pid *PaymentIdentification, prefix string) {
	// EndToEndID is mandatory
	if pid.EndToEndID == "" {
		v.addError(prefix+".endToEndId", "MISSING", "End-to-end ID is required")
	} else if len(pid.EndToEndID) > 35 {
		v.addError(prefix+".endToEndId", "TOO_LONG", "End-to-end ID must be max 35 characters")
	}

	// UETR is mandatory and must be valid UUID v4
	if pid.UETR == "" {
		v.addError(prefix+".uetr", "MISSING", "UETR is required")
	} else {
		if _, err := uuid.Parse(pid.UETR); err != nil {
			v.addError(prefix+".uetr", "INVALID", "UETR must be a valid UUID v4")
		}
	}

	// InstructionID is optional but if present, must be valid
	if pid.InstructionID != "" && len(pid.InstructionID) > 35 {
		v.addError(prefix+".instructionId", "TOO_LONG", "Instruction ID must be max 35 characters")
	}
}

func (v *Validator) validateAmount(a *Amount, prefix string) {
	// Value
	if a.Value.LessThanOrEqual(decimal.Zero) {
		v.addError(prefix+".value", "INVALID", "Amount must be greater than zero")
	}

	// Max amount check (999 trillion)
	maxAmount := decimal.NewFromFloat(999999999999999.9999)
	if a.Value.GreaterThan(maxAmount) {
		v.addError(prefix+".value", "TOO_LARGE", "Amount exceeds maximum allowed value")
	}

	// Currency
	v.validateCurrency(a.Currency, prefix+".currency")
}

func (v *Validator) validateCurrency(currency, field string) {
	if currency == "" {
		v.addError(field, "MISSING", "Currency is required")
		return
	}

	// ISO 4217 currency code pattern (3 uppercase letters)
	currencyPattern := regexp.MustCompile(`^[A-Z]{3}$`)
	if !currencyPattern.MatchString(currency) {
		v.addError(field, "INVALID", "Currency must be a valid ISO 4217 code (3 uppercase letters)")
	}

	// Common valid currencies (extend as needed)
	validCurrencies := map[string]bool{
		"USD": true, "EUR": true, "GBP": true, "JPY": true, "CHF": true,
		"CAD": true, "AUD": true, "NZD": true, "SGD": true, "HKD": true,
		"SEK": true, "NOK": true, "DKK": true, "INR": true, "CNY": true,
		"MXN": true, "BRL": true, "ZAR": true, "AED": true, "SAR": true,
	}
	if !validCurrencies[currency] {
		// Log warning but don't fail - currency might be valid but not in our list
	}
}

func (v *Validator) validateParty(p *Party, prefix string, requireName bool) {
	if requireName && p.Name == "" {
		v.addError(prefix+".name", "MISSING", "Party name is required")
	} else if len(p.Name) > 140 {
		v.addError(prefix+".name", "TOO_LONG", "Party name must be max 140 characters")
	}

	// Account validation
	if p.Account != nil {
		v.validateAccountIdentification(p.Account, prefix+".account")
	}

	// Country validation
	if p.CountryOfOrigin != "" {
		countryPattern := regexp.MustCompile(`^[A-Z]{2}$`)
		if !countryPattern.MatchString(p.CountryOfOrigin) {
			v.addError(prefix+".countryOfOrigin", "INVALID", "Country must be a valid ISO 3166-1 alpha-2 code")
		}
	}
}

func (v *Validator) validateAccountIdentification(a *AccountIdentification, prefix string) {
	if a.IBAN != "" {
		v.validateIBAN(a.IBAN, prefix+".iban")
	} else if a.Other == nil {
		v.addError(prefix, "MISSING", "Either IBAN or other account identifier is required")
	}
}

func (v *Validator) validateIBAN(iban, field string) {
	// Remove spaces
	iban = strings.ReplaceAll(iban, " ", "")

	// Basic IBAN validation
	if len(iban) < 15 || len(iban) > 34 {
		v.addError(field, "INVALID", "IBAN must be between 15 and 34 characters")
		return
	}

	// Pattern: 2 letter country code + 2 check digits + BBAN
	ibanPattern := regexp.MustCompile(`^[A-Z]{2}[0-9]{2}[A-Z0-9]+$`)
	if !ibanPattern.MatchString(iban) {
		v.addError(field, "INVALID", "IBAN format is invalid")
	}

	// Note: Full IBAN checksum validation would go here
	// Using ISO 7064 Mod 97-10 algorithm
}

// ValidatePacs002 validates a pacs.002 message
func (v *Validator) ValidatePacs002(msg *Pacs002) ValidationErrors {
	v.errors = make(ValidationErrors, 0)

	// Validate Group Header
	if msg.GroupHeader.MessageID == "" {
		v.addError("groupHeader.messageId", "MISSING", "Message ID is required")
	}
	if msg.GroupHeader.CreationDateTime.IsZero() {
		v.addError("groupHeader.creationDateTime", "MISSING", "Creation date time is required")
	}

	// Validate Transaction Info
	for i, tx := range msg.TransactionInfo {
		prefix := fmt.Sprintf("transactionInformationAndStatus[%d]", i)
		v.validateTxInfoAndStatus(&tx, prefix)
	}

	return v.errors
}

func (v *Validator) validateTxInfoAndStatus(tx *TxInfoAndStatus, prefix string) {
	// Original UETR is required
	if tx.OriginalUETR == "" {
		v.addError(prefix+".originalUetr", "MISSING", "Original UETR is required")
	} else {
		if _, err := uuid.Parse(tx.OriginalUETR); err != nil {
			v.addError(prefix+".originalUetr", "INVALID", "UETR must be a valid UUID v4")
		}
	}

	// Transaction Status
	validStatuses := map[string]bool{
		"ACCP": true, "ACTC": true, "ACSC": true, "ACSP": true, "PDNG": true, "RJCT": true,
	}
	if !validStatuses[tx.TransactionStatus] {
		v.addError(prefix+".transactionStatus", "INVALID",
			fmt.Sprintf("Transaction status must be one of: ACCP, ACTC, ACSC, ACSP, PDNG, RJCT. Got: %s", tx.TransactionStatus))
	}

	// If rejected, reason is required
	if tx.TransactionStatus == "RJCT" && len(tx.StatusReasonInfo) == 0 {
		v.addError(prefix+".statusReasonInformation", "MISSING", "Status reason is required for rejected transactions")
	}
}

// ValidatePacs004 validates a pacs.004 message
func (v *Validator) ValidatePacs004(msg *Pacs004) ValidationErrors {
	v.errors = make(ValidationErrors, 0)

	// Validate Group Header
	if msg.GroupHeader.MessageID == "" {
		v.addError("groupHeader.messageId", "MISSING", "Message ID is required")
	}
	if msg.GroupHeader.CreationDateTime.IsZero() {
		v.addError("groupHeader.creationDateTime", "MISSING", "Creation date time is required")
	}

	// Validate Transaction Info
	if len(msg.TransactionInfo) == 0 {
		v.addError("transactionInformation", "MISSING", "At least one transaction is required")
	}

	for i, tx := range msg.TransactionInfo {
		prefix := fmt.Sprintf("transactionInformation[%d]", i)
		v.validateTxInfo004(&tx, prefix)
	}

	return v.errors
}

func (v *Validator) validateTxInfo004(tx *TxInfo004, prefix string) {
	// Return ID
	if tx.ReturnID == "" {
		v.addError(prefix+".returnId", "MISSING", "Return ID is required")
	}

	// Original UETR
	if tx.OriginalUETR == "" {
		v.addError(prefix+".originalUetr", "MISSING", "Original UETR is required")
	}

	// Amounts
	v.validateAmount(&tx.OriginalInterbankAmount, prefix+".originalInterbankSettlementAmount")
	v.validateAmount(&tx.ReturnedInterbankAmount, prefix+".returnedInterbankSettlementAmount")

	// Returned amount should not exceed original
	if tx.ReturnedInterbankAmount.Value.GreaterThan(tx.OriginalInterbankAmount.Value) {
		v.addError(prefix+".returnedInterbankSettlementAmount", "INVALID",
			"Returned amount cannot exceed original amount")
	}

	// Return reason is required
	if len(tx.ReturnReasonInfo) == 0 {
		v.addError(prefix+".returnReasonInformation", "MISSING", "Return reason is required")
	}
}
