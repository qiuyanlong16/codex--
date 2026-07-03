# nanobot-fix-venv.ps1
# Manually extract the python-venv tar shards
# Run this in the VM as Administrator (right-click PowerShell -> Run as Administrator)

$ErrorActionPreference = "Stop"

$stateDir = "$env:USERPROFILE\.by-claw-nanobot"
$resourcesDir = "$stateDir\resources"
$venvDir = "$resourcesDir\python-venv"
$pythonExe = "$venvDir\Scripts\python.exe"

Write-Host "=== Manual Venv Extraction ===" -ForegroundColor Cyan

# 1. Find tar shards
Write-Host "`n[1/5] Searching for tar shards..." -ForegroundColor Yellow

$shards = @()

# Check Program Files first
$pfResources = "C:\Program Files\by-claw-nanobot\resources"
if (Test-Path $pfResources) {
    $found = Get-ChildItem $pfResources -Filter "python-venv_*.tar"
    if ($found) {
        Write-Host "  Found in Program Files: $($found.Count) shard(s)"
        $found | ForEach-Object { Write-Host "    $($_.Name) ($([math]::Round($_.Length/1MB,1)) MB)" }
        $shards += $found
    }
}

# Check state dir resources
if (Test-Path $resourcesDir) {
    $found = Get-ChildItem $resourcesDir -Filter "python-venv_*.tar"
    if ($found) {
        Write-Host "  Found in state dir: $($found.Count) shard(s)"
        $found | ForEach-Object { Write-Host "    $($_.Name) ($([math]::Round($_.Length/1MB,1)) MB)" }
        $shards += $found
    }
}

if ($shards.Count -eq 0) {
    Write-Host "ERROR: No tar shards found anywhere!" -ForegroundColor Red
    Write-Host "Searched:"
    Write-Host "  - $pfResources"
    Write-Host "  - $resourcesDir"
    exit 1
}

# 2. Create target directory
Write-Host "`n[2/5] Creating target directory: $resourcesDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null

# 3. Copy shards to state dir
Write-Host "`n[3/5] Copying shards to state dir..." -ForegroundColor Yellow
foreach ($shard in $shards) {
    $dest = Join-Path $resourcesDir $shard.Name
    if (-not (Test-Path $dest)) {
        Write-Host "  Copying $($shard.Name)..."
        Copy-Item $shard.FullName $dest -Force
    } else {
        Write-Host "  $($shard.Name) already exists in target, skipping copy"
    }
}

# 4. Extract using tar.exe
Write-Host "`n[4/5] Extracting tar shards..." -ForegroundColor Yellow
$tarExe = "C:\Windows\System32\tar.exe"
if (-not (Test-Path $tarExe)) {
    Write-Host "ERROR: tar.exe not found at $tarExe" -ForegroundColor Red
    exit 1
}
Write-Host "  Using: $tarExe"

$sw = [System.Diagnostics.Stopwatch]::StartNew()
foreach ($shard in (Get-ChildItem $resourcesDir -Filter "python-venv_*.tar")) {
    Write-Host "  Extracting $($shard.Name)..." -NoNewline
    $shardSw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $proc = Start-Process -FilePath $tarExe `
            -ArgumentList "-xf", $shard.FullName, "-C", $resourcesDir `
            -NoNewWindow -Wait -PassThru -RedirectStandardError "$env:TEMP\tar_err.log"
        $shardSw.Stop()
        if ($proc.ExitCode -eq 0) {
            Write-Host " OK ($($shardSw.ElapsedMilliseconds) ms)" -ForegroundColor Green
            Remove-Item $shard.FullName -Force
        } else {
            Write-Host " FAILED (exit code $($proc.ExitCode))" -ForegroundColor Red
            $errContent = Get-Content "$env:TEMP\tar_err.log" -Raw
            Write-Host "  Error: $errContent" -ForegroundColor Red
        }
    } catch {
        $shardSw.Stop()
        Write-Host " EXCEPTION: $_" -ForegroundColor Red
    }
}
$sw.Stop()
Write-Host "`n  Total extraction time: $($sw.ElapsedMilliseconds) ms"

# 5. Verify
Write-Host "`n[5/5] Verification..." -ForegroundColor Yellow
if (Test-Path $pythonExe) {
    Write-Host "  python.exe found: $pythonExe" -ForegroundColor Green
    $ver = & $pythonExe --version 2>&1
    Write-Host "  Version: $ver" -ForegroundColor Green
} else {
    Write-Host "  ERROR: python.exe NOT found at expected path" -ForegroundColor Red
    Write-Host "  Checking venv dir contents:"
    if (Test-Path $venvDir) {
        Get-ChildItem $venvDir -Directory | Select-Object Name | Format-Table -AutoSize
    } else {
        Write-Host "  Venv dir doesn't exist either!"
    }
}

Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Now close and restart by-claw-nanobot"
