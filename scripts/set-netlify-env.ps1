# PlatePlanr - set Netlify env vars via CLI (interactive or .env.netlify import)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$netlify = "$env:APPDATA\npm\netlify.cmd"
if (-not (Test-Path $netlify)) { $netlify = 'netlify.cmd' }

function Set-NetlifyVar {
  param([string]$Name, [string]$Value, [switch]$Secret)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Write-Host "  Skipped $Name (empty)" -ForegroundColor DarkGray
    return
  }
  $setArgs = @('env:set', $Name, $Value, '--context', 'production', '--force')
  if ($Secret) { $setArgs += '--secret' }
  Write-Host "  Setting $Name..." -ForegroundColor Cyan
  & $netlify @setArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to set $Name" }
}

Write-Host ''
Write-Host '=== PlatePlanr Netlify env vars (CLI) ===' -ForegroundColor Green
Write-Host ''

if (Test-Path '.env.netlify') {
  Write-Host 'Found .env.netlify - importing...' -ForegroundColor Cyan
  & $netlify env:import .env.netlify --replace-existing
  Write-Host ''
  Write-Host 'Done. Redeploying...' -ForegroundColor Green
  & $netlify deploy --prod --skip-functions-cache --context production -m 'Env vars configured'
  exit 0
}

Write-Host 'Enter values below (press Enter to skip optional vars).' -ForegroundColor Yellow
Write-Host 'Tip: copy .env.netlify.example to .env.netlify, fill in, re-run this script.' -ForegroundColor Yellow
Write-Host ''

$vars = @(
  @{ Name = 'FIREBASE_API_KEY'; Secret = $false },
  @{ Name = 'FIREBASE_AUTH_DOMAIN'; Secret = $false },
  @{ Name = 'FIREBASE_PROJECT_ID'; Secret = $false },
  @{ Name = 'FIREBASE_STORAGE_BUCKET'; Secret = $false },
  @{ Name = 'FIREBASE_MESSAGING_SENDER_ID'; Secret = $false },
  @{ Name = 'FIREBASE_APP_ID'; Secret = $false },
  @{ Name = 'STRIPE_PRICE_ID'; Secret = $false },
  @{ Name = 'STRIPE_SECRET_KEY'; Secret = $true },
  @{ Name = 'STRIPE_WEBHOOK_SECRET'; Secret = $true }
)

foreach ($v in $vars) {
  $val = Read-Host $v.Name
  if ($null -eq $val) { $val = '' }
  Set-NetlifyVar -Name $v.Name -Value $val.Trim() -Secret:$v.Secret
}

Write-Host ''
Write-Host 'FIREBASE_SERVICE_ACCOUNT - path to downloaded service account JSON:' -ForegroundColor Cyan
$jsonPath = Read-Host 'JSON file path'
if ($jsonPath -and (Test-Path $jsonPath)) {
  $oneLine = Get-Content $jsonPath -Raw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 10
  Set-NetlifyVar -Name 'FIREBASE_SERVICE_ACCOUNT' -Value $oneLine -Secret
} else {
  Write-Host '  Skipped FIREBASE_SERVICE_ACCOUNT' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'All set. Redeploying...' -ForegroundColor Green
& $netlify deploy --prod --skip-functions-cache --context production -m 'Env vars configured'