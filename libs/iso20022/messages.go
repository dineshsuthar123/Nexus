// Package iso20022 provides ISO 20022 message type definitions
// This package implements the core message types for the pacs (Payments Clearing and Settlement) domain
package iso20022

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ============================================================================
// Common Types
// ============================================================================

// UETR represents a Unique End-to-End Transaction Reference (UUID v4)
type UETR struct {
	uuid.UUID
}

// NewUETR generates a new UETR
func NewUETR() UETR {
	return UETR{uuid.New()}
}

// ParseUETR parses a UETR from string
func ParseUETR(s string) (UETR, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		return UETR{}, err
	}
	return UETR{id}, nil
}

// Amount represents a monetary amount with currency
type Amount struct {
	Value    decimal.Decimal `json:"value"`
	Currency string          `json:"currency"` // ISO 4217 currency code
}

// MarshalJSON implements json.Marshaler
func (a Amount) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Value    string `json:"value"`
		Currency string `json:"currency"`
	}{
		Value:    a.Value.String(),
		Currency: a.Currency,
	})
}

// AccountIdentification represents an account identifier
type AccountIdentification struct {
	IBAN  string `json:"iban,omitempty"`
	Other *struct {
		ID       string `json:"id"`
		SchemaNm string `json:"schemaNm,omitempty"` // BBAN, UPIC, etc.
	} `json:"other,omitempty"`
}

// Party represents a party in a payment (debtor, creditor, etc.)
type Party struct {
	Name            string                 `json:"name"`
	PostalAddress   *PostalAddress         `json:"postalAddress,omitempty"`
	Identification  *PartyIdentification   `json:"identification,omitempty"`
	Account         *AccountIdentification `json:"account,omitempty"`
	Agent           *FinancialInstitution  `json:"agent,omitempty"`
	CountryOfOrigin string                 `json:"countryOfOrigin,omitempty"` // ISO 3166 country code
}

// PostalAddress represents a postal address
type PostalAddress struct {
	StreetName     string   `json:"streetName,omitempty"`
	BuildingNumber string   `json:"buildingNumber,omitempty"`
	PostCode       string   `json:"postCode,omitempty"`
	TownName       string   `json:"townName,omitempty"`
	CountrySubDiv  string   `json:"countrySubDivision,omitempty"`
	Country        string   `json:"country,omitempty"` // ISO 3166 country code
	AddressLine    []string `json:"addressLine,omitempty"`
}

// PartyIdentification represents party identification details
type PartyIdentification struct {
	OrganisationID *OrganisationIdentification `json:"organisationId,omitempty"`
	PrivateID      *PrivateIdentification      `json:"privateId,omitempty"`
}

// OrganisationIdentification represents organisation identification
type OrganisationIdentification struct {
	LEI   string `json:"lei,omitempty"` // Legal Entity Identifier
	BIC   string `json:"bic,omitempty"` // Business Identifier Code
	Other []struct {
		ID       string `json:"id"`
		SchemaNm string `json:"schemaNm"`
		Issuer   string `json:"issuer,omitempty"`
	} `json:"other,omitempty"`
}

// PrivateIdentification represents private (individual) identification
type PrivateIdentification struct {
	DateOfBirth  string `json:"dateOfBirth,omitempty"` // YYYY-MM-DD
	PlaceOfBirth string `json:"placeOfBirth,omitempty"`
	Other        []struct {
		ID       string `json:"id"`
		SchemaNm string `json:"schemaNm"` // PASSPORT, NATIONAL_ID, etc.
		Issuer   string `json:"issuer,omitempty"`
	} `json:"other,omitempty"`
}

// FinancialInstitution represents a financial institution (bank)
type FinancialInstitution struct {
	BIC            string         `json:"bic,omitempty"`
	ClearingSystem *ClearingID    `json:"clearingSystemMemberId,omitempty"`
	Name           string         `json:"name,omitempty"`
	PostalAddress  *PostalAddress `json:"postalAddress,omitempty"`
}

// ClearingID represents a clearing system member identification
type ClearingID struct {
	ClearingSystemID string `json:"clearingSystemId,omitempty"` // USABA, AUBSB, etc.
	MemberID         string `json:"memberId"`
}

// RemittanceInformation represents payment remittance details
type RemittanceInformation struct {
	Unstructured []string                   `json:"unstructured,omitempty"`
	Structured   []StructuredRemittanceInfo `json:"structured,omitempty"`
}

// StructuredRemittanceInfo represents structured remittance information
type StructuredRemittanceInfo struct {
	ReferredDocumentInfo []ReferredDocumentInfo `json:"referredDocumentInformation,omitempty"`
	ReferredDocumentAmt  *Amount                `json:"referredDocumentAmount,omitempty"`
	CreditorRefInfo      *CreditorReferenceInfo `json:"creditorReferenceInformation,omitempty"`
	Invoicer             *Party                 `json:"invoicer,omitempty"`
	Invoicee             *Party                 `json:"invoicee,omitempty"`
	AdditionalRemitInfo  string                 `json:"additionalRemittanceInformation,omitempty"`
}

// ReferredDocumentInfo represents referred document information
type ReferredDocumentInfo struct {
	Type   string `json:"type,omitempty"` // INVOICE, CREDIT_NOTE, etc.
	Number string `json:"number,omitempty"`
	Date   string `json:"relatedDate,omitempty"` // YYYY-MM-DD
}

// CreditorReferenceInfo represents creditor reference information
type CreditorReferenceInfo struct {
	Type      string `json:"type,omitempty"` // SCOR, RADM, etc.
	Reference string `json:"reference"`
}

// ============================================================================
// pacs.008 - FI to FI Customer Credit Transfer
// ============================================================================

// Pacs008 represents a FI to FI Customer Credit Transfer message
type Pacs008 struct {
	GroupHeader     GroupHeader008     `json:"groupHeader"`
	CreditTransfers []CreditTransfer08 `json:"creditTransferTransactionInformation"`
}

// GroupHeader008 represents the group header for pacs.008
type GroupHeader008 struct {
	MessageID            string     `json:"messageId"`        // Max 35 chars
	CreationDateTime     time.Time  `json:"creationDateTime"` // ISO 8601
	NumberOfTransactions int        `json:"numberOfTransactions"`
	TotalAmount          *Amount    `json:"controlSum,omitempty"`
	SettlementInfo       Settlement `json:"settlementInformation"`
}

// Settlement represents settlement information
type Settlement struct {
	Method           string                `json:"settlementMethod"` // CLRG, INDA, INGA, COVE
	ClearingSystem   *ClearingSystem       `json:"clearingSystem,omitempty"`
	InstructingAgent *FinancialInstitution `json:"instructingReimbursementAgent,omitempty"`
	InstructedAgent  *FinancialInstitution `json:"instructedReimbursementAgent,omitempty"`
}

// ClearingSystem identifies a clearing system
type ClearingSystem struct {
	Code        string `json:"code,omitempty"` // FEDNOW, TIPS, SWIFT, etc.
	Proprietary string `json:"proprietary,omitempty"`
}

// CreditTransfer08 represents a single credit transfer within pacs.008
type CreditTransfer08 struct {
	PaymentID          PaymentIdentification  `json:"paymentIdentification"`
	PaymentTypeInfo    *PaymentTypeInfo       `json:"paymentTypeInformation,omitempty"`
	InstructedAmount   Amount                 `json:"interbankSettlementAmount"`
	ChargeBearer       string                 `json:"chargeBearer,omitempty"` // DEBT, CRED, SHAR, SLEV
	Debtor             Party                  `json:"debtor"`
	DebtorAgent        *FinancialInstitution  `json:"debtorAgent,omitempty"`
	Creditor           Party                  `json:"creditor"`
	CreditorAgent      *FinancialInstitution  `json:"creditorAgent,omitempty"`
	Purpose            *Purpose               `json:"purpose,omitempty"`
	RemittanceInfo     *RemittanceInformation `json:"remittanceInformation,omitempty"`
	InstructionForNext *InstructionForAgent   `json:"instructionForNextAgent,omitempty"`
}

// PaymentIdentification contains payment identifiers
type PaymentIdentification struct {
	InstructionID string `json:"instructionId,omitempty"` // Max 35 chars
	EndToEndID    string `json:"endToEndId"`              // Max 35 chars, mandatory
	UETR          string `json:"uetr"`                    // UUID v4, mandatory
	TxID          string `json:"transactionId,omitempty"` // Max 35 chars
}

// PaymentTypeInfo contains payment type information
type PaymentTypeInfo struct {
	InstructionPriority string           `json:"instructionPriority,omitempty"` // HIGH, NORM
	ServiceLevel        *ServiceLevel    `json:"serviceLevel,omitempty"`
	LocalInstrument     *LocalInstrument `json:"localInstrument,omitempty"`
	CategoryPurpose     *CategoryPurpose `json:"categoryPurpose,omitempty"`
}

// ServiceLevel identifies the service level
type ServiceLevel struct {
	Code        string `json:"code,omitempty"` // SEPA, INST, etc.
	Proprietary string `json:"proprietary,omitempty"`
}

// LocalInstrument identifies the local payment instrument
type LocalInstrument struct {
	Code        string `json:"code,omitempty"`
	Proprietary string `json:"proprietary,omitempty"`
}

// CategoryPurpose identifies the category purpose
type CategoryPurpose struct {
	Code        string `json:"code,omitempty"` // CASH, CORT, DIVI, etc.
	Proprietary string `json:"proprietary,omitempty"`
}

// Purpose identifies the purpose of the payment
type Purpose struct {
	Code        string `json:"code,omitempty"` // ISO 20022 purpose codes
	Proprietary string `json:"proprietary,omitempty"`
}

// InstructionForAgent contains instructions for the next agent
type InstructionForAgent struct {
	Code            string `json:"code,omitempty"` // CHQB, HOLD, PHOB, TELB
	InstructionInfo string `json:"instructionInformation,omitempty"`
}

// ============================================================================
// pacs.002 - Payment Status Report
// ============================================================================

// Pacs002 represents a Payment Status Report message
type Pacs002 struct {
	GroupHeader       GroupHeader002    `json:"groupHeader"`
	OriginalGroupInfo *OrigGroupInfo    `json:"originalGroupInformationAndStatus,omitempty"`
	TransactionInfo   []TxInfoAndStatus `json:"transactionInformationAndStatus,omitempty"`
}

// GroupHeader002 represents the group header for pacs.002
type GroupHeader002 struct {
	MessageID        string    `json:"messageId"`
	CreationDateTime time.Time `json:"creationDateTime"`
}

// OrigGroupInfo contains original group information
type OrigGroupInfo struct {
	OriginalMessageID        string         `json:"originalMessageId"`
	OriginalMsgNmID          string         `json:"originalMessageNameId,omitempty"` // pacs.008, etc.
	OriginalCreationDateTime time.Time      `json:"originalCreationDateTime,omitempty"`
	GroupStatus              string         `json:"groupStatus,omitempty"` // ACCP, ACTC, ACSP, RJCT
	StatusReasonInfo         []StatusReason `json:"statusReasonInformation,omitempty"`
}

// TxInfoAndStatus contains transaction status information
type TxInfoAndStatus struct {
	StatusID              string         `json:"statusId,omitempty"`
	OriginalInstructionID string         `json:"originalInstructionId,omitempty"`
	OriginalEndToEndID    string         `json:"originalEndToEndId"`
	OriginalUETR          string         `json:"originalUetr"`
	TransactionStatus     string         `json:"transactionStatus"` // ACCP, ACTC, ACSP, RJCT, PDNG
	StatusReasonInfo      []StatusReason `json:"statusReasonInformation,omitempty"`
	AcceptanceDateTime    *time.Time     `json:"acceptanceDateTime,omitempty"`
}

// StatusReason contains status reason information
type StatusReason struct {
	Originator *Party `json:"originator,omitempty"`
	Reason     struct {
		Code        string `json:"code,omitempty"`
		Proprietary string `json:"proprietary,omitempty"`
	} `json:"reason"`
	AdditionalInfo []string `json:"additionalInformation,omitempty"`
}

// ============================================================================
// pacs.004 - Payment Return
// ============================================================================

// Pacs004 represents a Payment Return message
type Pacs004 struct {
	GroupHeader       GroupHeader004    `json:"groupHeader"`
	OriginalGroupInfo *OrigGroupInfo004 `json:"originalGroupInformation,omitempty"`
	TransactionInfo   []TxInfo004       `json:"transactionInformation"`
}

// GroupHeader004 represents the group header for pacs.004
type GroupHeader004 struct {
	MessageID            string     `json:"messageId"`
	CreationDateTime     time.Time  `json:"creationDateTime"`
	NumberOfTransactions int        `json:"numberOfTransactions"`
	SettlementInfo       Settlement `json:"settlementInformation"`
}

// OrigGroupInfo004 contains original group information for returns
type OrigGroupInfo004 struct {
	OriginalMessageID        string    `json:"originalMessageId"`
	OriginalMsgNmID          string    `json:"originalMessageNameId,omitempty"`
	OriginalCreationDateTime time.Time `json:"originalCreationDateTime,omitempty"`
}

// TxInfo004 contains transaction information for returns
type TxInfo004 struct {
	ReturnID                string         `json:"returnId"`
	OriginalInstructionID   string         `json:"originalInstructionId,omitempty"`
	OriginalEndToEndID      string         `json:"originalEndToEndId"`
	OriginalUETR            string         `json:"originalUetr"`
	OriginalInterbankAmount Amount         `json:"originalInterbankSettlementAmount"`
	ReturnedInterbankAmount Amount         `json:"returnedInterbankSettlementAmount"`
	ChargeBearer            string         `json:"chargeBearer,omitempty"`
	ReturnReasonInfo        []ReturnReason `json:"returnReasonInformation"`
}

// ReturnReason contains return reason information
type ReturnReason struct {
	Originator *Party `json:"originator,omitempty"`
	Reason     struct {
		Code        string `json:"code"` // AC01, AC04, AM04, etc.
		Proprietary string `json:"proprietary,omitempty"`
	} `json:"reason"`
	AdditionalInfo []string `json:"additionalInformation,omitempty"`
}

// ============================================================================
// Status Codes (ISO 20022)
// ============================================================================

// Transaction Status Codes
const (
	StatusACCP = "ACCP" // Accepted Customer Profile
	StatusACTC = "ACTC" // Accepted Technical Validation
	StatusACSC = "ACSC" // Accepted Settlement Completed
	StatusACSP = "ACSP" // Accepted Settlement in Progress
	StatusPDNG = "PDNG" // Pending
	StatusRJCT = "RJCT" // Rejected
)

// Rejection Reason Codes
const (
	ReasonAC01 = "AC01" // Incorrect Account Number
	ReasonAC04 = "AC04" // Closed Account Number
	ReasonAC06 = "AC06" // Blocked Account
	ReasonAM01 = "AM01" // Zero Amount
	ReasonAM02 = "AM02" // Not Allowed Amount
	ReasonAM04 = "AM04" // Insufficient Funds
	ReasonAM09 = "AM09" // Wrong Amount
	ReasonBE01 = "BE01" // Inconsistent with End Customer
	ReasonDS02 = "DS02" // Order Cancelled
	ReasonFF01 = "FF01" // Invalid File Format
	ReasonRC01 = "RC01" // Bank Identifier Incorrect
	ReasonRR01 = "RR01" // Missing Debtor Account
	ReasonRR02 = "RR02" // Missing Debtor Name
	ReasonRR03 = "RR03" // Missing Creditor Name
	ReasonRR04 = "RR04" // Regulatory Reason
	ReasonSL01 = "SL01" // Specific Service Offered by Debtor Agent
	ReasonTD03 = "TD03" // Invalid UETR
)

// Charge Bearer Codes
const (
	ChargeDEBT = "DEBT" // Borne by Debtor
	ChargeCRED = "CRED" // Borne by Creditor
	ChargeSHAR = "SHAR" // Shared
	ChargeSLEV = "SLEV" // Following Service Level
)
