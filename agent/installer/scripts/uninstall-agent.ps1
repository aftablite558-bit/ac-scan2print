<#
.SYNOPSIS
    Stops and removes the AC Scan2Print Local Agent service and Tray auto-start registration.
    Pass -PurgeData to also remove ProgramData logs, temp files, and DPAPI credentials.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = "$env:ProgramFiles\AC Scan2Print\Agent",
    [switch]$PurgeData
)

$ErrorActionPreference = "Stop"

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "uninstall-agent.ps1 must be executed from an elevated Administrator PowerShell prompt."
}

$ServiceName = "ACScan2PrintAgent"

Write-Host "[1/4] Stopping Tray companion..." -ForegroundColor Yellow
Get-Process -Name "ACScan2Print.Agent.Tray" -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "[2/4] Stopping and removing Windows Service '$ServiceName'..." -ForegroundColor Yellow
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -ne "Stopped") {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    & sc.exe delete $ServiceName | Out-Null
}

Write-Host "[3/4] Removing Tray startup key and application binaries..." -ForegroundColor Yellow
Remove-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" -Name "ACScan2PrintTray" -ErrorAction SilentlyContinue
if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}

if ($PurgeData) {
    Write-Host "[4/4] Purging ProgramData logs, temp files, and DPAPI device secrets..." -ForegroundColor Red
    $programDataDir = Join-Path $env:ProgramData "ACScan2Print"
    $localAppDir = Join-Path $env:LOCALAPPDATA "ACScan2Print"
    if (Test-Path $programDataDir) { Remove-Item -Path $programDataDir -Recurse -Force }
    if (Test-Path $localAppDir) { Remove-Item -Path $localAppDir -Recurse -Force }
}
else {
    Write-Host "[4/4] Preserved ProgramData logs and DPAPI enrollment state (pass -PurgeData to remove)." -ForegroundColor Cyan
}

Write-Host "AC Scan2Print Local Agent uninstalled cleanly." -ForegroundColor Green
