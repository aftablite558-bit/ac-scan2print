<#
.SYNOPSIS
    Production health verification for AC Scan2Print Local Print Agent on Windows 11.
#>
[CmdletBinding()]
param(
    [string]$SupabaseUrl = "https://tvtfgsijxlxpwgakpeag.supabase.co/functions/v1/get-public-payment-settings"
)

$ErrorActionPreference = "Continue"
$checks = @()

function Add-CheckResult($Name, $Passed, $Detail) {
    $script:checks += [PSCustomObject]@{
        Check  = $Name
        Status = if ($Passed) { "PASS" } else { "FAIL" }
        Detail = $Detail
    }
}

# 1. Agent Windows Service
$agentSvc = Get-Service -Name "ACScan2PrintAgent" -ErrorAction SilentlyContinue
Add-CheckResult "ACScan2PrintAgent Service" ($null -ne $agentSvc -and $agentSvc.Status -eq "Running") (if ($agentSvc) { "Status=$($agentSvc.Status), StartType=$($agentSvc.StartType)" } else { "Service not installed" })

# 2. Windows Print Spooler Service
$spoolerSvc = Get-Service -Name "Spooler" -ErrorAction SilentlyContinue
Add-CheckResult "Windows Print Spooler" ($null -ne $spoolerSvc -and $spoolerSvc.Status -eq "Running") (if ($spoolerSvc) { "Status=$($spoolerSvc.Status)" } else { "Spooler missing" })

# 3. Connected Printers
$printers = Get-Printer -ErrorAction SilentlyContinue
$printerCount = ($printers | Measure-Object).Count
Add-CheckResult "Installed Printers" ($printerCount -gt 0) "$printerCount printer(s) detected"

# 4. Supabase Edge API TLS Reachability
try {
    $resp = Invoke-WebRequest -Uri $SupabaseUrl -Method GET -TimeoutSec 10 -UseBasicParsing
    Add-CheckResult "Supabase Backend TLS" ($resp.StatusCode -eq 200) "HTTP $($resp.StatusCode)"
}
catch {
    Add-CheckResult "Supabase Backend TLS" $false $_.Exception.Message
}

# 5. Free Disk Space (C:\ >= 2 GB)
$drive = Get-PSDrive -Name C -ErrorAction SilentlyContinue
$freeGb = if ($drive) { [math]::Round($drive.Free / 1GB, 2) } else { 0 }
Add-CheckResult "Disk Space (C:\)" ($freeGb -ge 2) "$freeGb GB free"

# 6. Rolling Log Directory
$logDir = Join-Path $env:ProgramData "ACScan2Print\Logs"
$logExists = Test-Path $logDir
$recentErrors = 0
if ($logExists) {
    $todayLog = Join-Path $logDir ("agent-" + (Get-Date).ToUniversalTime().ToString("yyyyMMdd") + ".log")
    if (Test-Path $todayLog) {
        $recentErrors = (Select-String -Path $todayLog -Pattern "\[ERROR\]" -AllMatches | Measure-Object).Count
    }
}
Add-CheckResult "Agent Logging ($logDir)" $logExists "Exists=$logExists, TodayErrors=$recentErrors"

$checks | Format-Table -AutoSize
$failedCount = ($checks | Where-Object { $_.Status -eq "FAIL" } | Measure-Object).Count
if ($failedCount -gt 0) {
    exit 1
}
exit 0
