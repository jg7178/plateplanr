# PlatePlanr — Firebase Console checklist (project plateplanr-17793)
$project = 'plateplanr-17793'
$domain = 'plateplanr-app.netlify.app'
Write-Host "`n=== Firebase Console Checklist ===`n" -ForegroundColor Green
Write-Host "[ ] Authentication -> Sign-in method -> Email/Password ENABLED"
Write-Host "    https://console.firebase.google.com/project/$project/authentication/providers`n"
Write-Host "[ ] Authentication -> Settings -> Authorized domains -> add: $domain"
Write-Host "    https://console.firebase.google.com/project/$project/authentication/settings`n"
Write-Host "[ ] Firestore Database created"
Write-Host "    https://console.firebase.google.com/project/$project/firestore`n"
Write-Host "[ ] Firestore Rules pasted from firestore.rules"
Write-Host "    https://console.firebase.google.com/project/$project/firestore/rules`n"
Write-Host "[ ] Test sign-up on live site"
Write-Host "    https://$domain`n"
Write-Host "Optional CLI deploy (after: npx firebase-tools login):"
Write-Host "   npx -y firebase-tools@latest deploy --only auth,firestore:rules --project $project`n"