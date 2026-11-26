<#
.SYNOPSIS
    Installs or upgrades the AC Scan2Print Local Agent Windows Service and Tray Companion.
    Preserves existing Windows DPAPI credentials across upgrades.
#>
[CmdletBinding()]
param(
    [string]$StageDir = "",
    [string]$InstallDir = "$env:ProgramFiles\AC Scan2Print\Agent",
    [switch]$SkipChecksumVerify
)

$ErrorActionPreference = "Stop"

# Verify Administrator elevation
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "install-agent.ps1 must be executed from an elevated Administrator PowerShell prompt."
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallerDir = Split-Path -Parent $ScriptDir
if ([string]::IsNullOrWhiteSpace($StageDir)) {
    $StageDir = Join-Path $InstallerDir "stage"
}

$ServiceName = "ACScan2PrintAgent"
$WorkerExe = Join-Path $InstallDir "worker\ACScan2Print.Agent.Worker.exe"
$TrayExe = Join-Path $InstallDir "tray\ACScan2Print.Agent.Tray.exe"
$ProgramDataDir = Join-Path $env:ProgramData "ACScan2Print"

# 1. Verify SHA-256 checksums before touching installed services
$ManifestPath = Join-Path $StageDir "checksums.sha256"
if (-not $SkipChecksumVerify) {
    if (-not (Test-Path $ManifestPath)) {
        throw "Checksum manifest missing at '$ManifestPath'. Run publish-release.ps1 first or pass -SkipChecksumVerify."
    }
    Write-Host "[1/6] Verifying SHA-256 release integrity..." -ForegroundColor Cyan
    foreach ($line in Get-Content $ManifestPath) {
        if ($line -match '^([0-9a-f]{64})\s+(.+)$') {
            $expectedHash = $matches[1]
            $relPath = $matches[2].Replace("/", "\")
            $target = Join-Path $StageDir $relPath
            if (-not (Test-Path $target)) { throw "Staged file missing: $relPath" }
            $actualHash = (Get-FileHash -Path $target -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actualHash -ne $expectedHash) {
                throw "SHA-256 mismatch for '$relPath'. Expected $expectedHash, got $actualHash."
            }
        }
    }
}

# 2. Stop running Tray and Service cleanly (DPAPI credentials remain untouched)
Write-Host "[2/6] Stopping existing service and Tray companion (if running)..." -ForegroundColor Cyan
Get-Process -Name "ACScan2Print.Agent.Tray" -ErrorAction SilentlyContinue | Stop-Process -Force
$existingSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingSvc) {
    if ($existingSvc.Status -ne "Stopped") {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    & sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
}

# 3. Copy staged files
Write-Host "[3/6] Deploying binaries to '$InstallDir'..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path (Join-Path $InstallDir "worker") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $InstallDir "tray") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $InstallDir "scripts") -Force | Out-Null

Copy-Item -Path (Join-Path $StageDir "worker\*") -Destination (Join-Path $InstallDir "worker") -Recurse -Force
Copy-Item -Path (Join-Path $StageDir "tray\*") -Destination (Join-Path $InstallDir "tray") -Recurse -Force
Copy-Item -Path (Join-Path $ScriptDir "health-check.ps1") -Destination (Join-Path $InstallDir "scripts") -Force
Copy-Item -Path (Join-Path $ScriptDir "uninstall-agent.ps1") -Destination (Join-Path $InstallDir "scripts") -Force
Copy-Item -Path (Join-Path $ScriptDir "register-cleanup-task.ps1") -Destination (Join-Path $InstallDir "scripts") -Force

# 4. Provision & harden ProgramData directories
Write-Host "[4/6] Securing ProgramData directories ($ProgramDataDir)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path (Join-Path $ProgramDataDir "Logs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ProgramDataDir "Temp") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $ProgramDataDir "Security") -Force | Out-Null
& icacls.exe $ProgramDataDir /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null

# 5. Register Windows Service with DelayedAutoStart + Crash Recovery
Write-Host "[5/6] Registering Windows Service '$ServiceName' with crash recovery..." -ForegroundColor Cyan
$binPath = "`"$WorkerExe`" --environment Production"
& sc.exe create $ServiceName binPath= $binPath start= delayed-auto DisplayName= "AC Scan2Print Local Print Agent" | Out-Null
& sc.exe description $ServiceName "AC Scan2Print background service for job claiming and Windows Print Spooler execution." | Out-Null
& sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/15000/restart/30000 | Out-Null
& sc.exe failureflag $ServiceName 1 | Out-Null

# Register Tray Auto-Start
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -Name "ACScan2PrintTray" -Value "`"$TrayExe`""

# 6. Start Windows Service and launch Tray
Write-Host "[6/6] Starting '$ServiceName'..." -ForegroundColor Cyan
Start-Service -Name $ServiceName
Start-Process -FilePath $TrayExe -ErrorAction SilentlyContinue

Write-Host "AC Scan2Print Local Agent installed and running!" -ForegroundColor Green
