<#
.SYNOPSIS
    Registers a daily 03:00 AM Windows Scheduled Task for local AC Scan2Print Counter PC maintenance:
    purges orphaned temp print render artifacts older than 24 hours in %ProgramData%\ACScan2Print\Temp
    and executes health-check.ps1 without holding any backend Supabase secrets.
#>
[CmdletBinding()]
param(
    [int]$TempMaxAgeHours = 24
)

$ErrorActionPreference = "Stop"

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "register-cleanup-task.ps1 must run from an elevated Administrator PowerShell prompt."
}

$ScriptDir = Join-Path $env:ProgramFiles "AC Scan2Print\Agent\scripts"
New-Item -ItemType Directory -Path $ScriptDir -Force | Out-Null

$RunnerPath = Join-Path $ScriptDir "invoke-local-maintenance.ps1"
$HealthCheckPath = Join-Path $ScriptDir "health-check.ps1"

$runnerBody = @"
`$ErrorActionPreference = 'Continue'
`$tempDir = Join-Path `$env:ProgramData 'ACScan2Print\Temp'
if (Test-Path `$tempDir) {
    `$cutoff = (Get-Date).AddHours(-$TempMaxAgeHours)
    Get-ChildItem -Path `$tempDir -Force -ErrorAction SilentlyContinue |
        Where-Object { `$_.LastWriteTime -lt `$cutoff } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path '$HealthCheckPath') {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File '$HealthCheckPath'
}
"@

Set-Content -Path $RunnerPath -Value $runnerBody -Encoding UTF8

$TaskName = "ACScan2Print-CounterMaintenance"
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$RunnerPath`""
$Trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null
Write-Host "Registered scheduled task '$TaskName' (Daily 03:00 AM, local Temp purge > ${TempMaxAgeHours}h + health-check)." -ForegroundColor Green
