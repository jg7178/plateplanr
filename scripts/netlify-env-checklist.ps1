# PlatePlanr — Netlify environment variable checklist
$vars = @(
  @{ Name = 'FIREBASE_API_KEY';            Where = 'Firebase Console -> Project settings -> Your apps -> Web app' },
  @{ Name = 'FIREBASE_AUTH_DOMAIN';        Where = 'Same config -> authDomain' },
  @{ Name = 'FIREBASE_PROJECT_ID';         Where = 'Same config -> projectId' },
  @{ Name = 'FIREBASE_STORAGE_BUCKET';     Where = 'Same config -> storageBucket' },
  @{ Name = 'FIREBASE_MESSAGING_SENDER_ID'; Where = 'Same config -> messagingSenderId' },
  @{ Name = 'FIREBASE_APP_ID';             Where = 'Same config -> appId' },
  @{ Name = 'FIREBASE_SERVICE_ACCOUNT';    Where = 'Run: scripts/format-service-account.ps1 -JsonPath path\to\key.json' },
  @{ Name = 'STRIPE_PRICE_ID';             Where = 'Stripe -> Products -> PlatePlanr Pro -> Price ID (price_...)' },
  @{ Name = 'STRIPE_SECRET_KEY';           Where = 'Stripe -> Developers -> API keys -> Secret key' },
  @{ Name = 'STRIPE_WEBHOOK_SECRET';       Where = 'Stripe -> Webhooks -> your endpoint -> Signing secret' }
)

Write-Host "`nPlatePlanr Netlify env vars (Site configuration -> Environment variables):`n" -ForegroundColor Green
foreach ($v in $vars) {
  Write-Host "  $($v.Name)" -ForegroundColor Cyan
  Write-Host "    $($v.Where)`n"
}

$site = Read-Host "Enter your Netlify site URL (e.g. https://plateplanr-app.netlify.app)"
if ($site) {
  $site = $site.TrimEnd('/')
  Write-Host "`nStripe webhook URL:" -ForegroundColor Yellow
  Write-Host "  $site/.netlify/functions/stripe-webhook`n"
  Write-Host "Firebase authorized domain (Auth -> Settings -> Authorized domains):" -ForegroundColor Yellow
  $host = ([uri]$site).Host
  Write-Host "  $host`n"
}