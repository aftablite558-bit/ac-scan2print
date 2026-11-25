<#
.SYNOPSIS
    Publishes self-contained win-x64 binaries for ACScan2Print Worker & Tray
    into agent/installer/stage/ and generates SHA-256 integrity checksums.
#>
[CmdletBinding()]
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$Version = "1.0.4"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallerDir = Split-Path -Parent $ScriptDir
$AgentRoot = Split-Path -Parent $InstallerDir
$StageDir = Join-Path $InstallerDir "stage"

$WorkerProj = Join-Path $AgentRoot "src\ACScan2Print.Agent.Worker\ACScan2Print.Agent.Worker.csproj"
$TrayProj = Join-Path $AgentRoot "src\ACScan2Print.Agent.Tray\ACScan2Print.Agent.Tray.csproj"

if (Test-Path $StageDir) {
    Remove-Item -Path $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $StageDir "worker") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StageDir "tray") -Force | Out-Null

Write-Host "[1/3] Publishing ACScan2Print.Agent.Worker ($Runtime, v$Version)..." -ForegroundColor Cyan
dotnet publish $WorkerProj `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:Version=$Version `
    -o (Join-Path $StageDir "worker")

Write-Host "[2/3] Publishing ACScan2Print.Agent.Tray ($Runtime, v$Version)..." -ForegroundColor Cyan
dotnet publish $TrayProj `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:Version=$Version `
    -o (Join-Path $StageDir "tray")

Write-Host "[3/3] Generating checksums.sha256 manifest..." -ForegroundColor Cyan
$ManifestPath = Join-Path $StageDir "checksums.sha256"
$Hashes = Get-ChildItem -Path $StageDir -Recurse -File |
    Where-Object { $_.Name -ne "checksums.sha256" } |
    Sort-Object FullName |
    ForEach-Object {
        $relPath = $_.FullName.Substring($StageDir.Length + 1).Replace("\", "/")
        $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $relPath"
    }

$Hashes | Set-Content -Path $ManifestPath -Encoding UTF8
Write-Host "Release payload staged cleanly at: $StageDir" -ForegroundColor Green
