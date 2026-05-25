#!/usr/bin/env pwsh
# Acme Banking - Development Server Launcher
# Supports running multiple instances in parallel with unique ports

param(
    [int]$BackendPort = 0,
    [int]$FrontendPort = 0,
    [switch]$NoBrowser
)

# Function to find an available port
function Get-AvailablePort {
    param([int]$StartPort)
    $port = $StartPort
    while ($true) {
        $listener = $null
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
            $listener.Start()
            $listener.Stop()
            return $port
        }
        catch {
            $port++
        }
        finally {
            if ($listener) { $listener.Stop() }
        }
    }
}

# Auto-assign ports based on folder name hash if not specified
if ($BackendPort -eq 0 -or $FrontendPort -eq 0) {
    $pathHash = ($PWD.Path.GetHashCode() -band 0x7FFFFFFF) % 100
    $baseBackendPort = 5000 + $pathHash
    $baseFrontendPort = 5173 + $pathHash

    if ($BackendPort -eq 0) {
        $BackendPort = Get-AvailablePort -StartPort $baseBackendPort
    }
    if ($FrontendPort -eq 0) {
        $FrontendPort = Get-AvailablePort -StartPort $baseFrontendPort
    }
}

Write-Host "🏦 Starting Acme Banking..." -ForegroundColor Cyan
Write-Host "   Backend Port:  $BackendPort" -ForegroundColor White
Write-Host "   Frontend Port: $FrontendPort" -ForegroundColor White

# Ensure Go is available
$goCmd = Get-Command go -ErrorAction SilentlyContinue
if (-not $goCmd) {
    Write-Host "❌ Go is not installed or not on PATH. Install from https://go.dev/dl/" -ForegroundColor Red
    exit 1
}

# Download Go modules if needed
Push-Location backend
if (-not (Test-Path "go.sum")) {
    Write-Host "⚠️  Downloading Go dependencies..." -ForegroundColor Yellow
    go mod tidy
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ go mod tidy failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Write-Host "✓ Go dependencies downloaded" -ForegroundColor Green
} else {
    # Pre-warm the module cache so `go run` doesn't download mid-startup
    # and race the frontend's first proxied request. No-op when warm.
    go mod download
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ go mod download failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
}
Pop-Location

# Check if frontend dependencies are installed
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "⚠️  Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location frontend
    npm install
    Pop-Location
    Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
}

# Start backend server
Write-Host "`n🐹 Starting Go backend on http://localhost:$BackendPort..." -ForegroundColor Magenta
$backendJob = Start-Job -ScriptBlock {
    param($Port)
    Set-Location $using:PWD
    Set-Location backend
    $env:PORT = $Port
    go run .
} -ArgumentList $BackendPort

# Start frontend server
Write-Host "⚛️  Starting Vite frontend on http://localhost:$FrontendPort..." -ForegroundColor Magenta
$frontendJob = Start-Job -ScriptBlock {
    param($FrontendPort, $BackendPort)
    Set-Location $using:PWD
    Set-Location frontend

    $env:VITE_PORT = $FrontendPort
    $env:VITE_API_URL = "http://localhost:$BackendPort"

    npx vite --port $FrontendPort
} -ArgumentList $FrontendPort, $BackendPort

# Wait for servers to start
Write-Host "`n⏳ Waiting for servers to start..." -ForegroundColor Yellow

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSeconds = 60, [System.Management.Automation.Job]$Job)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    # Probe both loopback families — Vite on Windows often binds ::1 only.
    $addresses = @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::IPv6Loopback)
    while ((Get-Date) -lt $deadline) {
        if ($Job -and $Job.State -ne "Running") { return $false }
        foreach ($addr in $addresses) {
            $client = $null
            try {
                $client = [System.Net.Sockets.TcpClient]::new($addr.AddressFamily)
                $iar = $client.BeginConnect($addr, $Port, $null, $null)
                if ($iar.AsyncWaitHandle.WaitOne(500) -and $client.Connected) {
                    $client.EndConnect($iar)
                    return $true
                }
            }
            catch { }
            finally {
                if ($client) { $client.Close() }
            }
        }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

$backendReady = Wait-ForPort -Port $BackendPort -TimeoutSeconds 60 -Job $backendJob
$frontendReady = Wait-ForPort -Port $FrontendPort -TimeoutSeconds 60 -Job $frontendJob

$backendRunning = $backendReady -and $backendJob.State -eq "Running"
$frontendRunning = $frontendReady -and $frontendJob.State -eq "Running"

if ($backendRunning -and $frontendRunning) {
    Write-Host "✓ Backend running (Job ID: $($backendJob.Id))" -ForegroundColor Green
    Write-Host "✓ Frontend running (Job ID: $($frontendJob.Id))" -ForegroundColor Green

    if (-not $NoBrowser) {
        Write-Host "`n🌐 Opening browser..." -ForegroundColor Cyan
        Start-Sleep -Seconds 2
        Start-Process "http://localhost:$FrontendPort"
    }

    Write-Host "`n✨ Acme Banking is running!" -ForegroundColor Green
    Write-Host "   Frontend: http://localhost:$FrontendPort" -ForegroundColor White
    Write-Host "   Backend:  http://localhost:$BackendPort" -ForegroundColor White
    Write-Host "   Instance: $($PWD.Path | Split-Path -Leaf)" -ForegroundColor DarkGray
    Write-Host "`n   Demo accounts: alice/password · bob/password · demo/demo" -ForegroundColor DarkGray
    Write-Host "`nPress Ctrl+C to stop all servers`n" -ForegroundColor Yellow

    try {
        while ($true) {
            $backendOutput = Receive-Job -Job $backendJob
            if ($backendOutput) {
                Write-Host $backendOutput -ForegroundColor DarkGray
            }

            $frontendOutput = Receive-Job -Job $frontendJob
            if ($frontendOutput) {
                Write-Host $frontendOutput -ForegroundColor DarkGray
            }

            if ($backendJob.State -ne "Running") {
                Write-Host "`n⚠️  Backend server stopped unexpectedly" -ForegroundColor Red
                break
            }
            if ($frontendJob.State -ne "Running") {
                Write-Host "`n⚠️  Frontend server stopped unexpectedly" -ForegroundColor Red
                break
            }

            Start-Sleep -Milliseconds 500
        }
    }
    finally {
        Write-Host "`n🛑 Stopping servers..." -ForegroundColor Yellow
        Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
        Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
        Remove-Job -Job $frontendJob -Force -ErrorAction SilentlyContinue
        Write-Host "✓ Servers stopped" -ForegroundColor Green
    }
} else {
    Write-Host "`n❌ Failed to start servers" -ForegroundColor Red
    if (-not $backendRunning) {
        Write-Host "Backend error:" -ForegroundColor Red
        Receive-Job -Job $backendJob
        Stop-Job -Job $backendJob
        Remove-Job -Job $backendJob -Force
    }
    if (-not $frontendRunning) {
        Write-Host "Frontend error:" -ForegroundColor Red
        Receive-Job -Job $frontendJob
        Stop-Job -Job $frontendJob
        Remove-Job -Job $frontendJob -Force
    }
    exit 1
}
