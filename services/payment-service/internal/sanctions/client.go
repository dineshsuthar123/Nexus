// Package sanctions provides OFAC/SDN sanctions screening integration
package sanctions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// Client provides sanctions screening via Moov Watchman
type Client struct {
	baseURL    string
	httpClient *http.Client
	logger     *zap.Logger
}

// NewClient creates a new sanctions screening client
func NewClient(baseURL string, logger *zap.Logger) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second, // Budget: 100ms but allow buffer
		},
		logger: logger,
	}
}

// ScreeningRequest represents a sanctions screening request
type ScreeningRequest struct {
	Name        string `json:"name"`
	Address     string `json:"address,omitempty"`
	City        string `json:"city,omitempty"`
	Country     string `json:"country,omitempty"`
	AltNames    []string `json:"altNames,omitempty"`
	SDNType     string `json:"sdnType,omitempty"` // individual, entity, vessel, aircraft
	Limit       int    `json:"limit,omitempty"`
	MinMatch    float64 `json:"minMatch,omitempty"`
}

// ScreeningResult represents the sanctions screening result
type ScreeningResult struct {
	Name          string   `json:"name"`
	MatchScore    float64  `json:"matchScore"`
	EntityType    string   `json:"entityType"`
	SDNName       string   `json:"sdnName,omitempty"`
	SDNType       string   `json:"sdnType,omitempty"`
	Programs      []string `json:"programs,omitempty"`
	Remarks       string   `json:"remarks,omitempty"`
	Addresses     []string `json:"addresses,omitempty"`
	Aliases       []string `json:"aliases,omitempty"`
	IsSanctioned  bool     `json:"isSanctioned"`
	RequiresReview bool    `json:"requiresReview"`
}

// SDNSearchResponse represents the Watchman search response
type SDNSearchResponse struct {
	SDNs []SDNEntry `json:"SDNs"`
}

// SDNEntry represents an SDN list entry
type SDNEntry struct {
	EntityID   string   `json:"entityID"`
	SDNName    string   `json:"sdnName"`
	SDNType    string   `json:"sdnType"`
	Programs   []string `json:"programs"`
	Title      string   `json:"title,omitempty"`
	Remarks    string   `json:"remarks,omitempty"`
	Match      float64  `json:"match"`
	Addresses  []Address `json:"addresses,omitempty"`
	Aliases    []Alias   `json:"alts,omitempty"`
}

// Address represents an SDN address
type Address struct {
	EntityID  string `json:"entityID"`
	Address   string `json:"address"`
	City      string `json:"city,omitempty"`
	State     string `json:"stateOrProvince,omitempty"`
	PostalCode string `json:"postalCode,omitempty"`
	Country   string `json:"country,omitempty"`
}

// Alias represents an SDN alias
type Alias struct {
	EntityID  string `json:"entityID"`
	AlternateID string `json:"alternateID"`
	AlternateName string `json:"alternateName"`
	AlternateType string `json:"alternateType"`
}

// Screen performs sanctions screening on a party
func (c *Client) Screen(ctx context.Context, req *ScreeningRequest) (*ScreeningResult, error) {
	start := time.Now()
	defer func() {
		c.logger.Debug("Sanctions screening completed",
			zap.String("name", req.Name),
			zap.Duration("duration", time.Since(start)),
		)
	}()

	// Build search URL
	url := fmt.Sprintf("%s/search?name=%s&limit=5&minMatch=0.80", c.baseURL, req.Name)
	if req.Country != "" {
		url += "&country=" + req.Country
	}
	if req.SDNType != "" {
		url += "&sdnType=" + req.SDNType
	}

	// Create request
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Accept", "application/json")

	// Execute request
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sanctions API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var searchResp SDNSearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Analyze results
	result := c.analyzeResults(req.Name, searchResp.SDNs)
	
	c.logger.Info("Sanctions screening result",
		zap.String("name", req.Name),
		zap.Float64("matchScore", result.MatchScore),
		zap.Bool("isSanctioned", result.IsSanctioned),
		zap.Bool("requiresReview", result.RequiresReview),
	)

	return result, nil
}

// ScreenBatch performs batch sanctions screening
func (c *Client) ScreenBatch(ctx context.Context, requests []*ScreeningRequest) ([]*ScreeningResult, error) {
	results := make([]*ScreeningResult, len(requests))
	
	for i, req := range requests {
		result, err := c.Screen(ctx, req)
		if err != nil {
			c.logger.Error("Batch screening failed for entry",
				zap.String("name", req.Name),
				zap.Error(err),
			)
			// Continue with other entries but mark this as requiring review
			results[i] = &ScreeningResult{
				Name:          req.Name,
				MatchScore:    0,
				RequiresReview: true,
			}
			continue
		}
		results[i] = result
	}

	return results, nil
}

// analyzeResults analyzes the SDN search results
func (c *Client) analyzeResults(searchName string, sdns []SDNEntry) *ScreeningResult {
	result := &ScreeningResult{
		Name:          searchName,
		MatchScore:    0,
		IsSanctioned:  false,
		RequiresReview: false,
	}

	if len(sdns) == 0 {
		// No matches - clear
		return result
	}

	// Get the highest match
	highestMatch := sdns[0]
	for _, sdn := range sdns {
		if sdn.Match > highestMatch.Match {
			highestMatch = sdn
		}
	}

	result.MatchScore = highestMatch.Match
	result.SDNName = highestMatch.SDNName
	result.SDNType = highestMatch.SDNType
	result.Programs = highestMatch.Programs
	result.Remarks = highestMatch.Remarks
	result.EntityType = highestMatch.SDNType

	// Extract addresses
	for _, addr := range highestMatch.Addresses {
		result.Addresses = append(result.Addresses, fmt.Sprintf("%s, %s, %s", addr.Address, addr.City, addr.Country))
	}

	// Extract aliases
	for _, alias := range highestMatch.Aliases {
		result.Aliases = append(result.Aliases, alias.AlternateName)
	}

	// Decision logic based on Jaro-Winkler score thresholds
	// Score >= 0.95: Definite match - BLOCK
	// Score >= 0.85: Likely match - REVIEW
	// Score < 0.85: Unlikely match - PASS
	if highestMatch.Match >= 0.95 {
		result.IsSanctioned = true
		result.RequiresReview = true
	} else if highestMatch.Match >= 0.85 {
		result.IsSanctioned = false
		result.RequiresReview = true
	}

	return result
}

// ScreenParties screens both debtor and creditor
func (c *Client) ScreenParties(ctx context.Context, debtorName, creditorName, debtorCountry, creditorCountry string) (debtorResult, creditorResult *ScreeningResult, err error) {
	// Screen debtor
	debtorResult, err = c.Screen(ctx, &ScreeningRequest{
		Name:    debtorName,
		Country: debtorCountry,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to screen debtor: %w", err)
	}

	// Screen creditor
	creditorResult, err = c.Screen(ctx, &ScreeningRequest{
		Name:    creditorName,
		Country: creditorCountry,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to screen creditor: %w", err)
	}

	return debtorResult, creditorResult, nil
}

// HealthCheck checks if the Watchman service is available
func (c *Client) HealthCheck(ctx context.Context) error {
	url := fmt.Sprintf("%s/ping", c.baseURL)
	
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create health check request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check returned status %d", resp.StatusCode)
	}

	return nil
}

// DownloadLatestLists triggers a download of the latest OFAC lists
func (c *Client) DownloadLatestLists(ctx context.Context) error {
	url := fmt.Sprintf("%s/admin/download", c.baseURL)
	
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(nil))
	if err != nil {
		return fmt.Errorf("failed to create download request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	c.logger.Info("Triggered OFAC list download")
	return nil
}

// Sanctions status constants
const (
	StatusPending  = "PENDING"
	StatusClear    = "CLEAR"
	StatusBlocked  = "BLOCKED"
	StatusReview   = "REVIEW"
)

// DetermineStatus determines the sanctions status based on screening result
func DetermineStatus(result *ScreeningResult) string {
	if result.IsSanctioned {
		return StatusBlocked
	}
	if result.RequiresReview {
		return StatusReview
	}
	return StatusClear
}
