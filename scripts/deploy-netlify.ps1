# PlatePlanr — connect repo to Netlify (pluginrides team) and deploy
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "`n=== PlatePlanr Netlify Deploy ===`n" -ForegroundColor Green

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js required. Install from https://nodejs.org or: winget install OpenJS.NodeJS.LTS" -ForegroundColor Red
  exit 1
}

Write-Host "Installing Netlify CLI (one-time)..." -ForegroundColor Cyan
npm install -g netlify-cli 2>$null | Out-Null

Write-Host @"

STEP 1 — Link site (browser will open)
  1. Log in to Netlify
  2. Choose team: pluginrides
  3. Create NEW site (plateplanr.netlify.app is taken — try plateplanr-app)
  4. Link to existing Git repo: jg7178/plateplanr

Or link manually at:
  https://app.netlify.com/teams/pluginrides/projects

Press Enter to run: netlify login
"@ -ForegroundColor Yellow
Read-Host
netlify login

Write-Host "`nLink this folder to your Netlify site:" -ForegroundColor Cyan
netlify link

Write-Host "`nDeploy preview..." -ForegroundColor Cyan
netlify deploy --build

Write-Host "`nDeploy PRODUCTION? (y/n)" -ForegroundColor Yellow
if ((Read-Host) -eq 'y') {
  netlify deploy --prod --build
  netlify open:site
}

Write-Host "`nNext: add env vars (run scripts/netlify-env-checklist.ps1)" -ForegroundColor Green
Write-Host "Then: Trigger deploy -> Clear cache in Netlify dashboard`n"