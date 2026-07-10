# PlatePlanr — Stripe env vars for Netlify (test mode first)
$site = 'https://plateplanr-app.netlify.app'
Write-Host "`n=== Stripe Setup for PlatePlanr ===`n" -ForegroundColor Green
Write-Host "1. Products (test mode):" -ForegroundColor Cyan
Write-Host "   https://dashboard.stripe.com/test/products`n"
Write-Host "2. API keys:" -ForegroundColor Cyan
Write-Host "   https://dashboard.stripe.com/test/apikeys`n"
Write-Host "3. Webhook endpoint URL:" -ForegroundColor Yellow
Write-Host "   $site/.netlify/functions/stripe-webhook`n"
Write-Host "   Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted`n"
Write-Host "4. Customer portal:" -ForegroundColor Cyan
Write-Host "   https://dashboard.stripe.com/test/settings/billing/portal`n"
Write-Host "5. Netlify env vars:" -ForegroundColor Cyan
Write-Host "   https://app.netlify.com/projects/plateplanr-app/configuration/env`n"
Write-Host "   STRIPE_PRICE_ID, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET`n"
Write-Host "Set via CLI (paste values when prompted):" -ForegroundColor Yellow
Write-Host "   netlify env:set STRIPE_PRICE_ID price_... --secret --context production --force"
Write-Host "   netlify env:set STRIPE_SECRET_KEY sk_test_... --secret --context production --force"
Write-Host "   netlify env:set STRIPE_WEBHOOK_SECRET whsec_... --secret --context production --force`n"