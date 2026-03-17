[CmdletBinding()]
param(
  [string]$RepoZipUrl = "https://github.com/firerlAGI/TraeElectronAPI/archive/refs/heads/main.zip",
  [string]$InstallRoot = "",
  [string]$OpenClawCommand = "openclaw",
  [string]$BaseUrl = "http://127.0.0.1:8787"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[TraeAPI] $Message"
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $env:USERPROFILE ".openclaw\tools\TraeElectronAPI"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("traeapi-bootstrap-" + [Guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempRoot "TraeElectronAPI.zip"
$extractRoot = Join-Path $tempRoot "extract"

try {
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

  Write-Step "Downloading repository archive from GitHub."
  Invoke-WebRequest -Uri $RepoZipUrl -OutFile $archivePath

  Write-Step "Extracting repository archive."
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force

  $repoDir = Get-ChildItem -Path $extractRoot -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "start-traeapi.cmd")
  } | Select-Object -First 1

  if (-not $repoDir) {
    throw "Could not find the extracted repository root containing start-traeapi.cmd"
  }

  $installParent = Split-Path -Parent $InstallRoot
  if (-not [string]::IsNullOrWhiteSpace($installParent)) {
    New-Item -ItemType Directory -Path $installParent -Force | Out-Null
  }

  if (Test-Path $InstallRoot) {
    $backupPath = "$InstallRoot.bak-$(Get-Date -Format yyyyMMddHHmmss)"
    Write-Step "Existing install found. Moving it to $backupPath"
    Move-Item -LiteralPath $InstallRoot -Destination $backupPath
  }

  Write-Step "Moving repository into the local install directory."
  Move-Item -LiteralPath $repoDir.FullName -Destination $InstallRoot

  $installScript = Join-Path $InstallRoot "scripts\install-openclaw-integration.ps1"
  Write-Step "Running the local install script."
  powershell -NoProfile -ExecutionPolicy Bypass -File $installScript `
    -RepoRoot $InstallRoot `
    -OpenClawCommand $OpenClawCommand `
    -BaseUrl $BaseUrl

  if ($LASTEXITCODE -ne 0) {
    throw "install-openclaw-integration.ps1 failed with exit code $LASTEXITCODE"
  }

  Write-Host ""
  Write-Host "Bootstrap install completed."
  Write-Host "- Install root: $InstallRoot"
  Write-Host "- Next step: restart OpenClaw Gateway"
  Write-Host ""
} finally {
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
