# nanobot-startup-diagnostic.ps1
# Run this in the VM where nanobot is installed
# Paste the output back for analysis

$ErrorActionPreference = "SilentlyContinue"
$stateDir = "$env:USERPROFILE\.by-claw-nanobot"
$nanobotConfigDir = "$env:USERPROFILE\.nanobot"
$logFile = "$stateDir\logs\main.log"
$earlyLog = "$env:LOCALAPPDATA\ByNanobot\early.log"

Write-Host "=== 1. Basic Paths ===" -ForegroundColor Cyan
Write-Host "USERPROFILE: $env:USERPROFILE"
Write-Host "State dir exists: $(Test-Path $stateDir)"
Write-Host "Nanobot config dir exists: $(Test-Path $nanobotConfigDir)"

Write-Host "`n=== 2. Venv Status ===" -ForegroundColor Cyan
$venvDir = "$stateDir\resources\python-venv"
$pythonExe = "$venvDir\Scripts\python.exe"
Write-Host "Venv dir exists: $(Test-Path $venvDir)"
Write-Host "Python exe exists: $(Test-Path $pythonExe)"
if (Test-Path $pythonExe) {
    $ver = & $pythonExe --version 2>&1
    Write-Host "Python version: $ver"
}

Write-Host "`n=== 3. Tar Shards (first-run extraction) ===" -ForegroundColor Cyan
$shardsDir = "$stateDir\resources"
if (Test-Path $shardsDir) {
    $shards = Get-ChildItem $shardsDir -Filter "python-venv_*.tar" | Select-Object Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}}
    if ($shards) { $shards | Format-Table -AutoSize } else { Write-Host "No tar shards (already extracted or not packaged)" }
} else {
    Write-Host "Resources dir not found"
}

# Also check Program Files resources
$pfResources = "C:\Program Files\by-claw-nanobot\resources"
if (Test-Path $pfResources) {
    $pfShards = Get-ChildItem $pfResources -Filter "python-venv_*.tar" | Select-Object Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}}
    if ($pfShards) { Write-Host "Tar shards in Program Files:"; $pfShards | Format-Table -AutoSize }
}

Write-Host "`n=== 4. Nanobot Config ===" -ForegroundColor Cyan
$configPath = "$nanobotConfigDir\config.json"
Write-Host "Config exists: $(Test-Path $configPath)"
if (Test-Path $configPath) {
    Write-Host "Config content:"
    Get-Content $configPath | Select-Object -First 10
}

Write-Host "`n=== 5. Nanobot Bundle ===" -ForegroundColor Cyan
$bundleDir = "$stateDir\resources\nanobot-bundle"
Write-Host "Bundle dir exists: $(Test-Path $bundleDir)"
if (Test-Path "$bundleDir\nanobot.zip") {
    $size = [math]::Round((Get-Item "$bundleDir\nanobot.zip").Length/1MB, 1)
    Write-Host "nanobot.zip size: ${size} MB"
}
$nanobotModule = "$venvDir\Lib\site-packages\nanobot"
Write-Host "Nanobot module in venv: $(Test-Path $nanobotModule)"

Write-Host "`n=== 6. Gateway Port Check ===" -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:18790/health" -TimeoutSec 3 -UseBasicParsing
    Write-Host "/health status: $($resp.StatusCode)"
} catch {
    Write-Host "/health: NOT responding (gateway not started or not ready)"
}

Write-Host "`n=== 7. Is gateway process running? ===" -ForegroundColor Cyan
$gw = Get-Process | Where-Object { $_.ProcessName -eq "python" -or $_.MainWindowTitle -like "*nanobot*" } | Select-Object Id, ProcessName, CPU, WorkingSet64, StartTime
if ($gw) { $gw | Format-Table -AutoSize } else { Write-Host "No python/nanobot process found" }

Write-Host "`n=== 8. Nanobot module test ===" -ForegroundColor Cyan
if (Test-Path $pythonExe) {
    Write-Host "Testing: python -m nanobot --version ..."
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $out = & $pythonExe -m nanobot --version 2>&1
    $sw.Stop()
    Write-Host "Output: $out"
    Write-Host "Time: $($sw.ElapsedMilliseconds) ms"
}

Write-Host "`n=== 9. Recent Logs (last 40 lines) ===" -ForegroundColor Cyan
if (Test-Path $logFile) {
    Get-Content $logFile -Tail 40
} else {
    Write-Host "No main.log found at $logFile"
}

Write-Host "`n=== 10. Early Log ===" -ForegroundColor Cyan
if (Test-Path $earlyLog) {
    Get-Content $earlyLog
} else {
    Write-Host "No early.log found"
}

Write-Host "`n=== 11. Disk Performance (quick test) ===" -ForegroundColor Cyan
$testFile = "$stateDir\_disk_test.tmp"
$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
[System.IO.File]::WriteAllBytes($testFile, [byte[]]::new(10MB))
$sw2.Stop()
Write-Host "Write 10MB: $($sw2.ElapsedMilliseconds) ms"
Remove-Item $testFile -Force

Write-Host "`n=== DONE - Copy all output above ===" -ForegroundColor Green
