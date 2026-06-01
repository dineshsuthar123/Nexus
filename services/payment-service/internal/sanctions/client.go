// Package sanctions provides OFAC/SDN sanctions screening integration
package sanctions

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"go.uber.org/zap"
)

var (
	sanctionsCacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "sanctions_cache_hits_total",
		Help: "Sanctions cache hits",
	})
	sanctionsCacheMisses = promauto.NewCounter(prometheus.CounterOpts{
		Name: "sanctions_cache_misses_total",
		Help: "Sanctions cache misses",
	})
	sanctionsCircuitOpenTotal = promauto.NewCounter(prometheus.CounterOpts{
		Name: "sanctions_circuit_open_total",
		Help: "Sanctions requests skipped because the remote screening circuit is open",
	})
)

const (
	defaultHTTPTimeout             = 750 * time.Millisecond
	defaultCircuitFailureThreshold = 2
	defaultCircuitCooldown         = 30 * time.Second
)

var ErrCircuitOpen = errors.New("sanctions screening circuit open")

// cacheEntry holds a cached sanctions screening result with expiry.
type cacheEntry struct {
	result   *ScreeningResult
	cachedAt time.Time
}

// Client provides sanctions screening via Moov Watchman
type Client struct {
	baseURL    string
	httpClient *http.Client
	logger     *zap.Logger
	cache      sync.Map
	cacheTTL   time.Duration

	failureMu        sync.Mutex
	failureCount     int
	failureThreshold int
	circuitOpenUntil time.Time
	circuitCooldown  time.Duration
}

// NewClient creates a new sanctions screening client
func NewClient(baseURL string, logger *zap.Logger) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: defaultHTTPTimeout,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 25,
				IdleConnTimeout:     90 * time.Second,
			},
		},
		logger:           logger,
		cacheTTL:         5 * time.Minute,
		failureThreshold: defaultCircuitFailureThreshold,
		circuitCooldown:  defaultCircuitCooldown,
	}
}

// ScreeningRequest represents a sanctions screening request
type ScreeningRequest struct {
	Name     string   `json:"name"`
	Address  string   `json:"address,omitempty"`
	City     string   `json:"city,omitempty"`
	Country  string   `json:"country,omitempty"`
	AltNames []string `json:"altNames,omitempty"`
	SDNType  string   `json:"sdnType,omitempty"` // individual, entity, vessel, aircraft
	Limit    int      `json:"limit,omitempty"`
	MinMatch float64  `json:"minMatch,omitempty"`
}

// ScreeningResult represents the sanctions screening result
type ScreeningResult struct {
	Name           string   `json:"name"`
	MatchScore     float64  `json:"matchScore"`
	EntityType     string   `json:"entityType"`
	SDNName        string   `json:"sdnName,omitempty"`
	SDNType        string   `json:"sdnType,omitempty"`
	Programs       []string `json:"programs,omitempty"`
	Remarks        string   `json:"remarks,omitempty"`
	Addresses      []string `json:"addresses,omitempty"`
	Aliases        []string `json:"aliases,omitempty"`
	IsSanctioned   bool     `json:"isSanctioned"`
	RequiresReview bool     `json:"requiresReview"`
}

// SDNSearchResponse represents the Watchman search response
type SDNSearchResponse struct {
	SDNs []SDNEntry `json:"SDNs"`
}

// SDNEntry represents an SDN list entry
type SDNEntry struct {
	EntityID  string    `json:"entityID"`
	SDNName   string    `json:"sdnName"`
	SDNType   string    `json:"sdnType"`
	Programs  []string  `json:"programs"`
	Title     string    `json:"title,omitempty"`
	Remarks   string    `json:"remarks,omitempty"`
	Match     float64   `json:"match"`
	Addresses []Address `json:"addresses,omitempty"`
	Aliases   []Alias   `json:"alts,omitempty"`
}

// Address represents an SDN address
type Address struct {
	EntityID   string `json:"entityID"`
	Address    string `json:"address"`
	City       string `json:"city,omitempty"`
	State      string `json:"stateOrProvince,omitempty"`
	PostalCode string `json:"postalCode,omitempty"`
	Country    string `json:"country,omitempty"`
}

// Alias represents an SDN alias
type Alias struct {
	EntityID      string `json:"entityID"`
	AlternateID   string `json:"alternateID"`
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

	// Check in-memory cache (5-min TTL)
	cacheKey := req.Name + "|" + req.Country
	if entry, ok := c.cache.Load(cacheKey); ok {
		ce := entry.(*cacheEntry)
		if time.Since(ce.cachedAt) < c.cacheTTL {
			sanctionsCacheHits.Inc()
			return ce.result, nil
		}
		c.cache.Delete(cacheKey)
	}
	sanctionsCacheMisses.Inc()

	if openUntil, ok := c.isCircuitOpen(time.Now()); ok {
		sanctionsCircuitOpenTotal.Inc()
		c.logger.Warn("Sanctions circuit open, sending payment to review",
			zap.String("name", req.Name),
			zap.Time("openUntil", openUntil),
		)
		return nil, fmt.Errorf("%w until %s", ErrCircuitOpen, openUntil.Format(time.RFC3339))
	}

	// Build search URL (URL-encode user inputs to prevent parameter injection)
	url := fmt.Sprintf("%s/search?name=%s&limit=5&minMatch=0.80", c.baseURL, neturl.QueryEscape(req.Name))
	if req.Country != "" {
		url += "&country=" + neturl.QueryEscape(req.Country)
	}
	if req.SDNType != "" {
		url += "&sdnType=" + neturl.QueryEscape(req.SDNType)
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
		c.recordFailure()
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.recordFailure()
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		c.recordFailure()
		return nil, fmt.Errorf("sanctions API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var searchResp SDNSearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		c.recordFailure()
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	c.recordSuccess()

	// Analyze results
	result := c.analyzeResults(req.Name, searchResp.SDNs)

	// Store in cache
	c.cache.Store(cacheKey, &cacheEntry{result: result, cachedAt: time.Now()})

	c.logger.Info("Sanctions screening result",
		zap.String("name", req.Name),
		zap.Float64("matchScore", result.MatchScore),
		zap.Bool("isSanctioned", result.IsSanctioned),
		zap.Bool("requiresReview", result.RequiresReview),
	)

	return result, nil
}

func (c *Client) isCircuitOpen(now time.Time) (time.Time, bool) {
	c.failureMu.Lock()
	defer c.failureMu.Unlock()

	if c.circuitOpenUntil.IsZero() {
		return time.Time{}, false
	}
	if now.Before(c.circuitOpenUntil) {
		return c.circuitOpenUntil, true
	}

	c.circuitOpenUntil = time.Time{}
	c.failureCount = 0
	return time.Time{}, false
}

func (c *Client) recordFailure() {
	c.failureMu.Lock()
	defer c.failureMu.Unlock()

	threshold := c.failureThreshold
	if threshold <= 0 {
		threshold = defaultCircuitFailureThreshold
	}
	cooldown := c.circuitCooldown
	if cooldown <= 0 {
		cooldown = defaultCircuitCooldown
	}

	c.failureCount++
	if c.failureCount >= threshold {
		c.circuitOpenUntil = time.Now().Add(cooldown)
		c.logger.Warn("Sanctions circuit opened",
			zap.Int("failureCount", c.failureCount),
			zap.Duration("cooldown", cooldown),
		)
	}
}

func (c *Client) recordSuccess() {
	c.failureMu.Lock()
	defer c.failureMu.Unlock()

	c.failureCount = 0
	c.circuitOpenUntil = time.Time{}
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
				Name:           req.Name,
				MatchScore:     0,
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
		Name:           searchName,
		MatchScore:     0,
		IsSanctioned:   false,
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

// ScreenParties screens both debtor and creditor in parallel
func (c *Client) ScreenParties(ctx context.Context, debtorName, creditorName, debtorCountry, creditorCountry string) (debtorResult, creditorResult *ScreeningResult, err error) {
	var wg sync.WaitGroup
	var dErr, cErr error

	wg.Add(2)
	go func() {
		defer wg.Done()
		debtorResult, dErr = c.Screen(ctx, &ScreeningRequest{
			Name:    debtorName,
			Country: debtorCountry,
		})
	}()
	go func() {
		defer wg.Done()
		creditorResult, cErr = c.Screen(ctx, &ScreeningRequest{
			Name:    creditorName,
			Country: creditorCountry,
		})
	}()
	wg.Wait()

	if dErr != nil {
		return nil, nil, fmt.Errorf("failed to screen debtor: %w", dErr)
	}
	if cErr != nil {
		return nil, nil, fmt.Errorf("failed to screen creditor: %w", cErr)
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

	c.logger.Info("Triggered OFAC list download — clearing sanctions cache")
	c.ClearCache()
	return nil
}

// ClearCache invalidates all cached sanctions screening results.
// Should be called after OFAC list updates.
func (c *Client) ClearCache() {
	c.cache.Range(func(key, _ interface{}) bool {
		c.cache.Delete(key)
		return true
	})
}

// Sanctions status constants
const (
	StatusPending = "PENDING"
	StatusClear   = "CLEAR"
	StatusBlocked = "BLOCKED"
	StatusReview  = "REVIEW"
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
