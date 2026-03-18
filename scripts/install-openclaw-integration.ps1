[CmdletBinding()]
param(
  [string]$RepoRoot = (Join-Path $PSScriptRoot ".."),
  [string]$OpenClawCommand = "openclaw",
  [string]$BaseUrl = "http://127.0.0.1:8787",
  [switch]$AutoStart = $true,
  [switch]$SkipValidate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[TraeAPI] $Message"
}

function Quote-ShellPath {
  param([string]$Value)

  return '"' + ($Value -replace '"', '\"') + '"'
}

function Invoke-OpenClaw {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [switch]$IgnoreError,
    [switch]$Capture
  )

  if ($Capture) {
    $output = & $OpenClawCommand @Arguments 2>$null
    $exitCode = $LASTEXITCODE
    if (-not $IgnoreError -and $exitCode -ne 0) {
      throw "openclaw $($Arguments -join ' ') failed with exit code $exitCode"
    }
    if ($exitCode -ne 0) {
      return $null
    }
    return (($output | Out-String).Trim())
  }

  & $OpenClawCommand @Arguments
  $exitCode = $LASTEXITCODE
  if (-not $IgnoreError -and $exitCode -ne 0) {
    throw "openclaw $($Arguments -join ' ') failed with exit code $exitCode"
  }
}

function Get-ConfigText {
  param([string]$Path)

  $text = Invoke-OpenClaw -Arguments @("config", "get", $Path) -IgnoreError -Capture
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $null
  }
  if ($text -eq "undefined" -or $text -eq "null") {
    return $null
  }
  return $text
}

function ConvertTo-StringArray {
  param([string]$RawText)

  if ([string]::IsNullOrWhiteSpace($RawText)) {
    return @()
  }

  try {
    $parsed = $RawText | ConvertFrom-Json -Depth 16
  } catch {
    return @([string]$RawText)
  }

  if ($parsed -is [string]) {
    return @([string]$parsed)
  }

  $items = New-Object System.Collections.Generic.List[string]
  foreach ($item in $parsed) {
    if ($null -ne $item) {
      $items.Add([string]$item)
    }
  }
  return $items.ToArray()
}

function Merge-UniqueStrings {
  param(
    [string[]]$Current,
    [string[]]$Add
  )

  $seen = New-Object "System.Collections.Generic.HashSet[string]" ([System.StringComparer]::OrdinalIgnoreCase)
  $result = New-Object System.Collections.Generic.List[string]

  foreach ($value in @($Current) + @($Add)) {
    if ([string]::IsNullOrWhiteSpace($value)) {
      continue
    }
    if ($seen.Add($value)) {
      $result.Add($value)
    }
  }

  return $result.ToArray()
}

function Set-ConfigValue {
  param(
    [string]$Path,
    [string]$Value,
    [switch]$StrictJson
  )

  $args = @("config", "set", $Path, $Value)
  if ($StrictJson) {
    $args += "--strict-json"
  }
  Invoke-OpenClaw -Arguments $args
}

function Set-ConfigJsonArray {
  param(
    [string]$Path,
    [string[]]$Items
  )

  $json = ConvertTo-Json @($Items) -Compress
  Set-ConfigValue -Path $Path -Value $json -StrictJson
}

function Update-ToolPolicy {
  param(
    [string]$AllowPath,
    [string]$AlsoAllowPath,
    [string[]]$ToolIds
  )

  $allowRaw = Get-ConfigText -Path $AllowPath
  $alsoAllowRaw = Get-ConfigText -Path $AlsoAllowPath

  if ($allowRaw) {
    $mergedAllow = Merge-UniqueStrings -Current (ConvertTo-StringArray -RawText $allowRaw) -Add $ToolIds
    Set-ConfigJsonArray -Path $AllowPath -Items $mergedAllow
    return "allow"
  }

  $mergedAlsoAllow = Merge-UniqueStrings -Current (ConvertTo-StringArray -RawText $alsoAllowRaw) -Add $ToolIds
  Set-ConfigJsonArray -Path $AlsoAllowPath -Items $mergedAlsoAllow
  return "alsoAllow"
}

$resolvedRepoRoot = (Resolve-Path $RepoRoot).Path
$pluginDir = Join-Path $resolvedRepoRoot "integrations\openclaw-trae-plugin"
$quickstartCommand = Join-Path $resolvedRepoRoot "start-traeapi.cmd"
$quickstartCommandConfig = ""

if (-not (Test-Path $pluginDir)) {
  throw "Plugin directory not found: $pluginDir"
}

if (-not (Test-Path $quickstartCommand)) {
  throw "TraeAPI launcher not found: $quickstartCommand"
}
$quickstartCommandConfig = Quote-ShellPath $quickstartCommand

Write-Step "Checking whether the plugin is already installed."
$pluginInfo = Invoke-OpenClaw -Arguments @("plugins", "info", "trae-ide") -IgnoreError -Capture
if (-not $pluginInfo) {
  Write-Step "Installing the OpenClaw plugin from the local repository."
  Invoke-OpenClaw -Arguments @("plugins", "install", "--link", $pluginDir)
} else {
  Write-Step "Plugin trae-ide is already installed. Reusing the existing install."
}

Write-Step "Enabling the plugin."
Invoke-OpenClaw -Arguments @("plugins", "enable", "trae-ide") -IgnoreError
Set-ConfigValue -Path "plugins.entries.trae-ide.enabled" -Value "true" -StrictJson
Set-ConfigValue -Path "plugins.entries.trae-ide.config.baseUrl" -Value $BaseUrl
$autoStartValue = if ($AutoStart.IsPresent) { "true" } else { "false" }
Set-ConfigValue -Path "plugins.entries.trae-ide.config.autoStart" -Value $autoStartValue -StrictJson
Set-ConfigValue -Path "plugins.entries.trae-ide.config.quickstartCommand" -Value $quickstartCommandConfig
Set-ConfigValue -Path "plugins.entries.trae-ide.config.quickstartCwd" -Value $resolvedRepoRoot

$toolIds = @("trae-ide", "trae_status", "trae_new_chat", "trae_delegate")
$rootPolicyMode = Update-ToolPolicy -AllowPath "tools.allow" -AlsoAllowPath "tools.alsoAllow" -ToolIds $toolIds
Write-Step "Updated root tool policy via tools.$rootPolicyMode."

$agentsRaw = Get-ConfigText -Path "agents.list"
if ($agentsRaw) {
  try {
    $agents = $agentsRaw | ConvertFrom-Json -Depth 16
  } catch {
    $agents = @()
  }

  $agentCount = 0
  foreach ($agent in @($agents)) {
    $agentCount += 1
  }

  for ($i = 0; $i -lt $agentCount; $i += 1) {
    $mode = Update-ToolPolicy `
      -AllowPath "agents.list[$i].tools.allow" `
      -AlsoAllowPath "agents.list[$i].tools.alsoAllow" `
      -ToolIds @("trae_status", "trae_new_chat", "trae_delegate")
    Write-Step "Updated agent[$i] tool policy via $mode."
  }
}

if (-not $SkipValidate) {
  Write-Step "Validating OpenClaw config."
  Invoke-OpenClaw -Arguments @("config", "validate")
}

Write-Host ""
Write-Host "TraeAPI + OpenClaw integration install completed."
Write-Host "- Repo root: $resolvedRepoRoot"
Write-Host "- Plugin id: trae-ide"
Write-Host "- Base URL: $BaseUrl"
Write-Host "- Quickstart: $quickstartCommandConfig"
Write-Host "- Next step: restart OpenClaw Gateway"
Write-Host "- Verify: openclaw plugins info trae-ide"
Write-Host "- Verify after restart: ask OpenClaw to use trae_status"
Write-Host ""
