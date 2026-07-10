# Paste your Firebase service account JSON path — outputs one line for Netlify FIREBASE_SERVICE_ACCOUNT
param(
  [Parameter(Mandatory = $true)]
  [string]$JsonPath
)

if (-not (Test-Path $JsonPath)) {
  Write-Error "File not found: $JsonPath"
  exit 1
}

$raw = Get-Content $JsonPath -Raw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 10
Write-Host ""
Write-Host "Copy this entire line into Netlify -> FIREBASE_SERVICE_ACCOUNT:" -ForegroundColor Cyan
Write-Host ""
Write-Host $raw
Write-Host ""