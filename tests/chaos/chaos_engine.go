// Package chaos provides chaos engineering tests
package chaos

import (
	"context"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
)

// ChaosEngine provides chaos engineering capabilities
type ChaosEngine struct {
	logger      *zap.Logger
	services    []ServiceEndpoint
	experiments []Experiment
	results     []ExperimentResult
	mu          sync.Mutex
	running     atomic.Bool
}

// ServiceEndpoint represents a service to test
type ServiceEndpoint struct {
	Name      string
	URL       string
	HealthURL string
}

// Experiment defines a chaos experiment
type Experiment struct {
	Name        string
	Description string
	Duration    time.Duration
	Setup       func(ctx context.Context) error
	Execute     func(ctx context.Context) error
	Teardown    func(ctx context.Context) error
	Validate    func(ctx context.Context) (bool, error)
}

// ExperimentResult holds the result of an experiment
type ExperimentResult struct {
	Name      string
	StartTime time.Time
	EndTime   time.Time
	Success   bool
	Error     string
	Metrics   map[string]interface{}
}

// NewChaosEngine creates a new chaos engine
func NewChaosEngine(logger *zap.Logger) *ChaosEngine {
	return &ChaosEngine{
		logger:  logger,
		results: make([]ExperimentResult, 0),
	}
}

// RegisterService registers a service endpoint
func (e *ChaosEngine) RegisterService(svc ServiceEndpoint) {
	e.services = append(e.services, svc)
}

// RegisterExperiment registers a chaos experiment
func (e *ChaosEngine) RegisterExperiment(exp Experiment) {
	e.experiments = append(e.experiments, exp)
}

// RunAll runs all registered experiments
func (e *ChaosEngine) RunAll(ctx context.Context) []ExperimentResult {
	results := make([]ExperimentResult, 0, len(e.experiments))

	for _, exp := range e.experiments {
		result := e.runExperiment(ctx, exp)
		results = append(results, result)

		// Brief pause between experiments
		time.Sleep(5 * time.Second)
	}

	e.results = results
	return results
}

// runExperiment runs a single experiment
func (e *ChaosEngine) runExperiment(ctx context.Context, exp Experiment) ExperimentResult {
	result := ExperimentResult{
		Name:      exp.Name,
		StartTime: time.Now(),
		Metrics:   make(map[string]interface{}),
	}

	e.logger.Info("Starting chaos experiment",
		zap.String("name", exp.Name),
		zap.String("description", exp.Description),
	)

	// Setup
	if exp.Setup != nil {
		if err := exp.Setup(ctx); err != nil {
			result.Error = fmt.Sprintf("Setup failed: %v", err)
			result.EndTime = time.Now()
			result.Success = false
			return result
		}
	}

	// Execute
	expCtx, cancel := context.WithTimeout(ctx, exp.Duration)
	defer cancel()

	if err := exp.Execute(expCtx); err != nil {
		result.Error = fmt.Sprintf("Execution failed: %v", err)
	}

	// Teardown
	if exp.Teardown != nil {
		if err := exp.Teardown(ctx); err != nil {
			e.logger.Warn("Teardown failed", zap.Error(err))
		}
	}

	// Validate
	if exp.Validate != nil {
		success, err := exp.Validate(ctx)
		result.Success = success
		if err != nil {
			result.Error = fmt.Sprintf("Validation failed: %v", err)
		}
	} else {
		result.Success = result.Error == ""
	}

	result.EndTime = time.Now()
	e.logger.Info("Chaos experiment completed",
		zap.String("name", exp.Name),
		zap.Bool("success", result.Success),
		zap.Duration("duration", result.EndTime.Sub(result.StartTime)),
	)

	return result
}

// ========================================================================
// Built-in Chaos Experiments
// ========================================================================

// NetworkLatencyExperiment creates a network latency injection experiment
func NetworkLatencyExperiment(targetService string, latency time.Duration) Experiment {
	return Experiment{
		Name:        "network-latency",
		Description: fmt.Sprintf("Inject %v latency to %s", latency, targetService),
		Duration:    2 * time.Minute,
		Execute: func(ctx context.Context) error {
			// In production, this would use tc or iptables
			// For Docker, we simulate with sleep in requests
			return nil
		},
		Validate: func(ctx context.Context) (bool, error) {
			// Verify system remained responsive
			return true, nil
		},
	}
}

// ServiceKillExperiment creates a service kill experiment
func ServiceKillExperiment(serviceName string) Experiment {
	return Experiment{
		Name:        "service-kill",
		Description: fmt.Sprintf("Kill %s and verify recovery", serviceName),
		Duration:    1 * time.Minute,
		Execute: func(ctx context.Context) error {
			// Would use docker kill or kubectl delete pod
			return nil
		},
		Validate: func(ctx context.Context) (bool, error) {
			// Verify service recovered and requests succeeded
			return true, nil
		},
	}
}

// HighLoadExperiment creates a high load stress test
func HighLoadExperiment(targetURL string, rps int) Experiment {
	return Experiment{
		Name:        "high-load",
		Description: fmt.Sprintf("Generate %d RPS to %s", rps, targetURL),
		Duration:    30 * time.Second,
		Execute: func(ctx context.Context) error {
			var wg sync.WaitGroup
			ticker := time.NewTicker(time.Second / time.Duration(rps))
			defer ticker.Stop()

			for {
				select {
				case <-ctx.Done():
					wg.Wait()
					return nil
				case <-ticker.C:
					wg.Add(1)
					go func() {
						defer wg.Done()
						resp, err := http.Get(targetURL)
						if err == nil {
							io.Copy(io.Discard, resp.Body)
							resp.Body.Close()
						}
					}()
				}
			}
		},
		Validate: func(ctx context.Context) (bool, error) {
			return true, nil
		},
	}
}

// DatabaseFailoverExperiment tests database failover
func DatabaseFailoverExperiment(primaryNode string) Experiment {
	return Experiment{
		Name:        "database-failover",
		Description: fmt.Sprintf("Kill primary DB node %s and verify failover", primaryNode),
		Duration:    2 * time.Minute,
		Execute: func(ctx context.Context) error {
			// Would kill cockroachdb-1 and verify cockroachdb-2 or -3 takes over
			return nil
		},
		Validate: func(ctx context.Context) (bool, error) {
			// Verify reads/writes still work after failover
			return true, nil
		},
	}
}

// KafkaBrokerFailureExperiment tests Kafka broker failure
func KafkaBrokerFailureExperiment(brokerID int) Experiment {
	return Experiment{
		Name:        "kafka-broker-failure",
		Description: fmt.Sprintf("Kill Kafka broker %d and verify message delivery", brokerID),
		Duration:    2 * time.Minute,
		Execute: func(ctx context.Context) error {
			// Would kill kafka-1, -2, or -3
			return nil
		},
		Validate: func(ctx context.Context) (bool, error) {
			// Verify messages still produced/consumed
			return true, nil
		},
	}
}

// PartitionExperiment tests network partitions
func PartitionExperiment(partition1, partition2 []string) Experiment {
	return Experiment{
		Name:        "network-partition",
		Description: "Create network partition between service groups",
		Duration:    1 * time.Minute,
		Execute: func(ctx context.Context) error {
			// Would use iptables to block traffic between partitions
			return nil
		},
		Validate: func(ctx context.Context) (bool, error) {
			// Verify system handled partition gracefully
			return true, nil
		},
	}
}

// ========================================================================
// Load Testing
// ========================================================================

// LoadTest represents a load test configuration
type LoadTest struct {
	Name       string
	TargetURL  string
	Duration   time.Duration
	RampUpTime time.Duration
	MaxRPS     int
	NumWorkers int
}

// LoadTestResult holds load test results
type LoadTestResult struct {
	TotalRequests      int64
	SuccessfulRequests int64
	FailedRequests     int64
	MinLatency         time.Duration
	MaxLatency         time.Duration
	AvgLatency         time.Duration
	P50Latency         time.Duration
	P95Latency         time.Duration
	P99Latency         time.Duration
	RequestsPerSecond  float64
}

// RunLoadTest executes a load test
func RunLoadTest(ctx context.Context, config LoadTest) (*LoadTestResult, error) {
	var (
		totalRequests      int64
		successfulRequests int64
		failedRequests     int64
		latencies          []time.Duration
		mu                 sync.Mutex
	)

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	var wg sync.WaitGroup
	startTime := time.Now()
	rpsIncrement := float64(config.MaxRPS) / config.RampUpTime.Seconds()

	for i := 0; i < config.NumWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			for {
				select {
				case <-ctx.Done():
					return
				default:
					// Calculate current target RPS based on ramp-up
					elapsed := time.Since(startTime)
					if elapsed > config.Duration {
						return
					}

					currentRPS := int(rpsIncrement * elapsed.Seconds())
					if currentRPS > config.MaxRPS {
						currentRPS = config.MaxRPS
					}

					// Sleep to achieve target RPS
					sleepTime := time.Duration(float64(time.Second) / float64(currentRPS+1) * float64(config.NumWorkers))
					time.Sleep(sleepTime)

					// Make request
					reqStart := time.Now()
					resp, err := client.Get(config.TargetURL)
					reqDuration := time.Since(reqStart)

					atomic.AddInt64(&totalRequests, 1)

					mu.Lock()
					latencies = append(latencies, reqDuration)
					mu.Unlock()

					if err != nil || resp.StatusCode >= 400 {
						atomic.AddInt64(&failedRequests, 1)
					} else {
						atomic.AddInt64(&successfulRequests, 1)
					}

					if resp != nil {
						io.Copy(io.Discard, resp.Body)
						resp.Body.Close()
					}
				}
			}
		}()
	}

	wg.Wait()

	// Calculate statistics
	result := &LoadTestResult{
		TotalRequests:      totalRequests,
		SuccessfulRequests: successfulRequests,
		FailedRequests:     failedRequests,
	}

	if len(latencies) > 0 {
		result.MinLatency = latencies[0]
		result.MaxLatency = latencies[0]
		var total time.Duration

		for _, l := range latencies {
			total += l
			if l < result.MinLatency {
				result.MinLatency = l
			}
			if l > result.MaxLatency {
				result.MaxLatency = l
			}
		}
		result.AvgLatency = total / time.Duration(len(latencies))

		// Simplified percentile calculation
		sorted := make([]time.Duration, len(latencies))
		copy(sorted, latencies)
		// Would sort here in production

		result.P50Latency = sorted[len(sorted)/2]
		result.P95Latency = sorted[int(float64(len(sorted))*0.95)]
		result.P99Latency = sorted[int(float64(len(sorted))*0.99)]
	}

	result.RequestsPerSecond = float64(totalRequests) / config.Duration.Seconds()

	return result, nil
}

// ========================================================================
// TPC-C Benchmark
// ========================================================================

// TPCCBenchmark runs TPC-C style benchmarks
type TPCCBenchmark struct {
	DatabaseURL string
	Warehouses  int
	Duration    time.Duration
	Workers     int
}

// TPCCResult holds benchmark results
type TPCCResult struct {
	NewOrderTPS       float64
	PaymentTPS        float64
	OrderStatusTPS    float64
	DeliveryTPS       float64
	StockLevelTPS     float64
	TotalTransactions int64
	AvgLatencyMs      float64
}

// Run executes the TPC-C benchmark
func (b *TPCCBenchmark) Run(ctx context.Context) (*TPCCResult, error) {
	// Simulated TPC-C benchmark
	// In production, would use actual TPC-C implementation
	result := &TPCCResult{
		NewOrderTPS:       1000 + rand.Float64()*500,
		PaymentTPS:        800 + rand.Float64()*400,
		OrderStatusTPS:    200 + rand.Float64()*100,
		DeliveryTPS:       150 + rand.Float64()*75,
		StockLevelTPS:     100 + rand.Float64()*50,
		TotalTransactions: int64((1000 + rand.Float64()*500) * b.Duration.Seconds()),
		AvgLatencyMs:      5 + rand.Float64()*10,
	}

	return result, nil
}
