#Requires -Version 5.1
<#
.SYNOPSIS
    Nexus RTP local performance benchmark runner.

.DESCRIPTION
    Installs k6 if absent, optionally starts the Docker stack, runs the
    local_bench.js scenario and opens the HTML proof report.

.PARAMETER Mode
    run     - (default) Run full ~8-minute benchmark
    smoke   - Quick 30s smoke test (10 VUs)
    install - Only install/verify k6, then exit
    seed    - Insert test accounts into local CockroachDB then exit

.PARAMETER ApiUrl
    Payment service base URL. Default: http://localhost:8085

.PARAMETER OpenReport
    Switch: auto-open the HTML report in the default browser after the run.

.EXAMPLE
    .\scripts\bench-local.ps1
    .\scripts\bench-local.ps1 -Mode smoke
    .\scripts\bench-local.ps1 -ApiUrl http://192.168.1.100:8085 -OpenReport
#>
param(
    [ValidateSet('run', 'smoke', 'install', 'seed')]
    [string]$Mode = 'run',

    [string]$ApiUrl = 'http://localhost:8085',

    [switch]$OpenReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root     = Split-Path $PSScriptRoot -Parent
$LoadDir  = Join-Path $Root 'loadtest'
$Script   = Join-Path $LoadDir 'local_bench.js'
$Results  = Join-Path $LoadDir 'results'

# ─── colours ────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "  ► $msg" -ForegroundColor Cyan    }
function Write-Ok    { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green   }
function Write-Warn  { param($msg) Write-Host "  ! $msg" -ForegroundColor Yellow  }
function Write-Fail  { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red     }

# ─── k6 installer ───────────────────────────────────────────────────────────
function Ensure-K6 {
    if (Get-Command k6 -ErrorAction SilentlyContinue) {
        $ver = (k6 version) -replace 'k6 v',''
        Write-Ok "k6 already installed: $ver"
        return
    }

    Write-Step 'k6 not found — attempting install via winget...'

    # Try winget (Windows 11 / updated Win 10)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        try {
            winget install --id GrafanaLabs.k6 --silent --accept-source-agreements --accept-package-agreements
            # Refresh PATH for this session
            $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
                        [System.Environment]::GetEnvironmentVariable('PATH', 'User')
            if (Get-Command k6 -ErrorAction SilentlyContinue) {
                Write-Ok 'k6 installed via winget'
                return
            }
        } catch {
            Write-Warn "winget install failed: $_"
        }
    }

    # Try Chocolatey
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        try {
            choco install k6 -y
            if (Get-Command k6 -ErrorAction SilentlyContinue) {
                Write-Ok 'k6 installed via Chocolatey'
                return
            }
        } catch {
            Write-Warn "choco install failed: $_"
        }
    }

    # Try Scoop
    if (Get-Command scoop -ErrorAction SilentlyContinue) {
        try {
            scoop install k6
            if (Get-Command k6 -ErrorAction SilentlyContinue) {
                Write-Ok 'k6 installed via Scoop'
                return
            }
        } catch {
            Write-Warn "scoop install failed: $_"
        }
    }

    # Manual fallback
    Write-Fail 'Could not install k6 automatically.'
    Write-Host ''
    Write-Host '  Install manually (pick one):' -ForegroundColor White
    Write-Host '    winget install Grafana.k6' -ForegroundColor DarkGray
    Write-Host '    choco install k6' -ForegroundColor DarkGray
    Write-Host '    scoop install k6' -ForegroundColor DarkGray
    Write-Host '    https://dl.k6.io/msi/k6-latest-amd64.msi' -ForegroundColor DarkGray
    exit 1
}

# ─── service health check ────────────────────────────────────────────────────
function Assert-ServiceUp {
    Write-Step "Checking payment service at $ApiUrl/health ..."
    try {
        $res = Invoke-WebRequest -Uri "$ApiUrl/health" -UseBasicParsing -TimeoutSec 5
        if ($res.StatusCode -eq 200) {
            Write-Ok "Payment service is up (HTTP 200)"
        } else {
            Write-Warn "Got HTTP $($res.StatusCode) from /health — continuing anyway"
        }
    } catch {
        Write-Fail "Payment service not reachable at $ApiUrl"
        Write-Host ''
        Write-Host '  Start it with one of:' -ForegroundColor White
        Write-Host '    docker compose -f infra/docker/docker-compose.prod.yml up -d cockroachdb kafka redis payment-service' -ForegroundColor DarkGray
        Write-Host '    cd services/payment-service && go run ./cmd/server' -ForegroundColor DarkGray
        Write-Host ''
        $ans = Read-Host '  Run anyway? (y/N)'
        if ($ans -notmatch '^[Yy]') { exit 1 }
    }
}

# ─── seed test accounts ──────────────────────────────────────────────────────
function Seed-Accounts {
    Write-Step 'Seeding 6 test accounts into local CockroachDB...'

    $seedSql = @'
INSERT INTO account (id, customer_id, iban, currency, status, balance, initial_balance, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'GB11NXUS00000000000001', 'USD', 'ACTIVE', 1000000.00, 1000000.00, now(), now()),
  ('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'GB11NXUS00000000000002', 'EUR', 'ACTIVE', 1000000.00, 1000000.00, now(), now()),
  ('00000000-0000-0000-0000-000000000003', gen_random_uuid(), 'GB11NXUS00000000000003', 'GBP', 'ACTIVE', 1000000.00, 1000000.00, now(), now()),
  ('00000000-0000-0000-0000-000000000004', gen_random_uuid(), 'GB11NXUS00000000000004', 'USD', 'ACTIVE', 1000000.00, 1000000.00, now(), now()),
  ('00000000-0000-0000-0000-000000000005', gen_random_uuid(), 'GB11NXUS00000000000005', 'EUR', 'ACTIVE', 1000000.00, 1000000.00, now(), now()),
  ('00000000-0000-0000-0000-000000000006', gen_random_uuid(), 'GB11NXUS00000000000006', 'GBP', 'ACTIVE', 1000000.00, 1000000.00, now(), now())
ON CONFLICT (id) DO NOTHING;
'@

    # Try via running CockroachDB Docker container
    $crdbContainer = docker ps --filter 'name=cockroachdb' --format '{{.Names}}' 2>$null | Select-Object -First 1
    if ($crdbContainer) {
        $seedSql | docker exec -i $crdbContainer cockroach sql --insecure --database=nexus_ledger
        Write-Ok "Seeded accounts via container: $crdbContainer"
    } else {
        # Try direct cockroach binary
        if (Get-Command cockroach -ErrorAction SilentlyContinue) {
            $seedSql | cockroach sql --insecure --host=localhost:26257 --database=nexus_ledger
            Write-Ok 'Seeded accounts via local cockroach binary'
        } else {
            Write-Warn 'CockroachDB not reachable. Payments will return 422 (account not found).'
            Write-Warn 'Latency metrics are still valid — only success rate will be 0%.'
        }
    }
}

# ─── main run ────────────────────────────────────────────────────────────────
function Run-Bench {
    param([string]$extraArgs = '')

    New-Item -ItemType Directory -Path $Results -Force | Out-Null

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $jsonOut   = Join-Path $Results "bench_${timestamp}.json"

    Write-Host ''
    Write-Host '  ┌──────────────────────────────────────────────────┐' -ForegroundColor DarkCyan
    Write-Host '  │  NEXUS RTP — LOCAL PERFORMANCE BENCHMARK          │' -ForegroundColor DarkCyan
    Write-Host '  │                                                    │' -ForegroundColor DarkCyan
    Write-Host '  │  Phases:  baseline → ramp → sustain → spike → cool│' -ForegroundColor DarkCyan
    Write-Host '  │  Duration: ~8 minutes                              │' -ForegroundColor DarkCyan
    Write-Host '  │  Max VUs:  300 (spike)                             │' -ForegroundColor DarkCyan
    Write-Host '  └──────────────────────────────────────────────────┘' -ForegroundColor DarkCyan
    Write-Host ''

    $k6Args = @(
        'run',
        '--out', "json=$jsonOut",
        '--env', "API_URL=$ApiUrl"
    )

    if ($extraArgs) { $k6Args += $extraArgs -split ' ' }

    $k6Args += $Script

    Write-Step "Running: k6 $($k6Args -join ' ')"
    Write-Host ''

    $start = Get-Date
    & k6 @k6Args
    $elapsed = (Get-Date) - $start

    Write-Host ''
    Write-Ok "Benchmark complete in $([math]::Round($elapsed.TotalMinutes, 1)) minutes"

    # Find the HTML report (handleSummary writes it to loadtest/results/)
    $latest = Get-ChildItem $Results -Filter '*.html' | Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($latest) {
        Write-Ok "HTML proof report: $($latest.FullName)"
        if ($OpenReport -or ($Host.Name -eq 'ConsoleHost' -and -not $env:CI)) {
            Start-Process $latest.FullName
        }
    }

    Write-Ok "JSON raw data:     $jsonOut"
}

function Run-Smoke {
    Write-Step 'Running smoke test (10 VUs × 30s)...'
    New-Item -ItemType Directory -Path $Results -Force | Out-Null

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $jsonOut   = Join-Path $Results "smoke_${timestamp}.json"

    & k6 run `
        --vus 10 `
        --duration 30s `
        --out "json=$jsonOut" `
        --env "API_URL=$ApiUrl" `
        $Script

    $latest = Get-ChildItem $Results -Filter '*.html' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest -and $OpenReport) { Start-Process $latest.FullName }
}

# ─── entry point ─────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '  Nexus RTP Benchmark Runner' -ForegroundColor White

Ensure-K6

switch ($Mode) {
    'install' {
        Write-Ok 'k6 is ready.'
    }
    'seed' {
        Seed-Accounts
    }
    'smoke' {
        Assert-ServiceUp
        Run-Smoke
    }
    'run' {
        Assert-ServiceUp
        Run-Bench
    }
}
