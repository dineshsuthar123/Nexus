package observability

import "testing"

func TestParseOTLPEndpoint_HostPort(t *testing.T) {
	ep, path, insecure := parseOTLPEndpoint("jaeger:4318")
	if ep != "jaeger:4318" {
		t.Fatalf("expected endpoint 'jaeger:4318', got '%s'", ep)
	}
	if path != "" {
		t.Fatalf("expected empty path, got '%s'", path)
	}
	if !insecure {
		t.Fatalf("expected insecure true for host:port input")
	}
}

func TestParseOTLPEndpoint_URL(t *testing.T) {
	ep, path, insecure := parseOTLPEndpoint("http://localhost:4318/v1/traces")
	if ep != "localhost:4318" {
		t.Fatalf("expected endpoint 'localhost:4318', got '%s'", ep)
	}
	if path != "/v1/traces" {
		t.Fatalf("expected path '/v1/traces', got '%s'", path)
	}
	if !insecure {
		t.Fatalf("expected insecure true for http URL")
	}

	ep2, path2, insecure2 := parseOTLPEndpoint("https://jaeger:4318/v1/traces")
	if ep2 != "jaeger:4318" {
		t.Fatalf("expected endpoint 'jaeger:4318', got '%s'", ep2)
	}
	if path2 != "/v1/traces" {
		t.Fatalf("expected path '/v1/traces', got '%s'", path2)
	}
	if insecure2 {
		t.Fatalf("expected insecure false for https URL")
	}
}
