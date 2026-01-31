// Package chaos provides chaos experiment runner
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/nexus-rtp/tests/chaos"
	"go.uber.org/zap"
)

func main() {
	// Parse flags
	runAll := flag.Bool("all", false, "Run all experiments")
	experiment := flag.String("experiment", "", "Specific experiment to run")
	loadTest := flag.Bool("loadtest", false, "Run load test")
	tpcc := flag.Bool("tpcc", false, "Run TPC-C benchmark")
	duration := flag.Duration("duration", 5*time.Minute, "Test duration")
	rps := flag.Int("rps", 1000, "Target requests per second")
	flag.Parse()

	// Initialize logger
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create chaos engine
	engine := chaos.NewChaosEngine(logger)

	// Register services
	services := []chaos.ServiceEndpoint{
		{Name: "payment-service", URL: "http://localhost:8080", HealthURL: "http://localhost:8080/health"},
		{Name: "account-service", URL: "http://localhost:8081", HealthURL: "http://localhost:8081/health"},
		{Name: "reconciliation-service", URL: "http://localhost:8082", HealthURL: "http://localhost:8082/health"},
	}

	for _, svc := range services {
		engine.RegisterService(svc)
	}

	// Register experiments
	experiments := []chaos.Experiment{
		chaos.NetworkLatencyExperiment("payment-service", 100*time.Millisecond),
		chaos.ServiceKillExperiment("payment-service"),
		chaos.HighLoadExperiment("http://localhost:8080/api/v1/payments", 500),
		chaos.DatabaseFailoverExperiment("cockroachdb-1"),
		chaos.KafkaBrokerFailureExperiment(1),
		chaos.PartitionExperiment(
			[]string{"payment-service", "account-service"},
			[]string{"kafka1", "kafka2", "kafka3"},
		),
	}

	for _, exp := range experiments {
		engine.RegisterExperiment(exp)
	}

	ctx := context.Background()

	// Run based on flags
	if *runAll {
		logger.Info("Running all chaos experiments")
		results := engine.RunAll(ctx)
		printResults(results)
	} else if *experiment != "" {
		logger.Info("Running specific experiment", zap.String("name", *experiment))
		// Find and run specific experiment
		for _, exp := range experiments {
			if exp.Name == *experiment {
				result := engine.RunAll(ctx)
				printResults(result)
				break
			}
		}
	} else if *loadTest {
		logger.Info("Running load test", zap.Int("rps", *rps), zap.Duration("duration", *duration))
		
		config := chaos.LoadTest{
			Name:       "payment-api-load-test",
			TargetURL:  "http://localhost:8080/api/v1/payments",
			Duration:   *duration,
			RampUpTime: 30 * time.Second,
			MaxRPS:     *rps,
			NumWorkers: 50,
		}

		ctx, cancel := context.WithTimeout(ctx, *duration+time.Minute)
		defer cancel()

		result, err := chaos.RunLoadTest(ctx, config)
		if err != nil {
			logger.Fatal("Load test failed", zap.Error(err))
		}

		printLoadTestResults(result)
	} else if *tpcc {
		logger.Info("Running TPC-C benchmark", zap.Duration("duration", *duration))
		
		benchmark := &chaos.TPCCBenchmark{
			DatabaseURL: "postgres://root@localhost:26257/nexus?sslmode=disable",
			Warehouses:  10,
			Duration:    *duration,
			Workers:     20,
		}

		ctx, cancel := context.WithTimeout(ctx, *duration+time.Minute)
		defer cancel()

		result, err := benchmark.Run(ctx)
		if err != nil {
			logger.Fatal("TPC-C benchmark failed", zap.Error(err))
		}

		printTPCCResults(result)
	} else {
		flag.Usage()
		os.Exit(1)
	}
}

func printResults(results []chaos.ExperimentResult) {
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("CHAOS EXPERIMENT RESULTS")
	fmt.Println(strings.Repeat("=", 60))

	passed := 0
	failed := 0

	for _, r := range results {
		status := "✅ PASSED"
		if !r.Success {
			status = "❌ FAILED"
			failed++
		} else {
			passed++
		}

		fmt.Printf("\n%s: %s\n", r.Name, status)
		fmt.Printf("  Duration: %v\n", r.EndTime.Sub(r.StartTime))
		if r.Error != "" {
			fmt.Printf("  Error: %s\n", r.Error)
		}
	}

	fmt.Println("\n" + strings.Repeat("-", 60))
	fmt.Printf("Total: %d | Passed: %d | Failed: %d\n", len(results), passed, failed)
	fmt.Println(strings.Repeat("=", 60))
}

func printLoadTestResults(result *chaos.LoadTestResult) {
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("LOAD TEST RESULTS")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("Total Requests:     %d\n", result.TotalRequests)
	fmt.Printf("Successful:         %d (%.2f%%)\n", result.SuccessfulRequests, 
		float64(result.SuccessfulRequests)/float64(result.TotalRequests)*100)
	fmt.Printf("Failed:             %d (%.2f%%)\n", result.FailedRequests,
		float64(result.FailedRequests)/float64(result.TotalRequests)*100)
	fmt.Printf("RPS:                %.2f\n", result.RequestsPerSecond)
	fmt.Println(strings.Repeat("-", 60))
	fmt.Printf("Min Latency:        %v\n", result.MinLatency)
	fmt.Printf("Max Latency:        %v\n", result.MaxLatency)
	fmt.Printf("Avg Latency:        %v\n", result.AvgLatency)
	fmt.Printf("P50 Latency:        %v\n", result.P50Latency)
	fmt.Printf("P95 Latency:        %v\n", result.P95Latency)
	fmt.Printf("P99 Latency:        %v\n", result.P99Latency)
	fmt.Println(strings.Repeat("=", 60))
}

func printTPCCResults(result *chaos.TPCCResult) {
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("TPC-C BENCHMARK RESULTS")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("New Order TPS:      %.2f\n", result.NewOrderTPS)
	fmt.Printf("Payment TPS:        %.2f\n", result.PaymentTPS)
	fmt.Printf("Order Status TPS:   %.2f\n", result.OrderStatusTPS)
	fmt.Printf("Delivery TPS:       %.2f\n", result.DeliveryTPS)
	fmt.Printf("Stock Level TPS:    %.2f\n", result.StockLevelTPS)
	fmt.Println(strings.Repeat("-", 60))
	fmt.Printf("Total Transactions: %d\n", result.TotalTransactions)
	fmt.Printf("Avg Latency:        %.2f ms\n", result.AvgLatencyMs)
	fmt.Println(strings.Repeat("=", 60))
}
