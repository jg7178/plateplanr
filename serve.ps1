# WeekPlate server — multi-store grocery API proxy
$root = $PSScriptRoot
$ports = @(8080, 8081, 8888, 3000)

function Get-LanIp {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1 -ExpandProperty IPAddress
  if (-not $ip) {
    $ip = (Get-NetIPConfiguration -ErrorAction SilentlyContinue |
      Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
      Select-Object -First 1).IPv4Address.IPAddress
  }
  return $ip
}

$lanIp = Get-LanIp

function Ensure-FirewallRule([int]$p) {
  $ruleName = "WeekPlate-$p"
  $existing = netsh advfirewall firewall show rule name="$ruleName" 2>$null
  if ($LASTEXITCODE -ne 0) {
    netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$p profile=any enable=yes | Out-Null
  }
}

foreach ($p in $ports) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$p/api/stores/status" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
      $url = "http://localhost:$p"
      Write-Host "WeekPlate already running at $url" -ForegroundColor Cyan
      if ($lanIp) {
        Write-Host "Phone (same Wi-Fi): http://${lanIp}:$p" -ForegroundColor Yellow
        Write-Host "Restart the server if your phone cannot connect (LAN access needs a fresh start)." -ForegroundColor DarkYellow
      }
      Start-Process $url
      exit 0
    }
  } catch {}
}

$port = $null
$listener = $null
foreach ($p in $ports) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    if ($lanIp) { $l.Prefixes.Add("http://${lanIp}:$p/") }
    $l.Start()
    $listener = $l
    $port = $p
    break
  } catch { if ($l) { try { $l.Close() } catch {} } }
}
if (-not $listener) { Write-Host "ERROR: No free port" -ForegroundColor Red; exit 1 }

Ensure-FirewallRule $port

# Load configs
$krogerConfig = $null
$walmartConfig = $null
$rapidApiKey = $null
$serpApiKey = $null
if (Test-Path (Join-Path $root "kroger-config.json")) {
  $krogerConfig = Get-Content (Join-Path $root "kroger-config.json") -Raw | ConvertFrom-Json
}
if (Test-Path (Join-Path $root "walmart-config.json")) {
  $walmartConfig = Get-Content (Join-Path $root "walmart-config.json") -Raw | ConvertFrom-Json
}
if (Test-Path (Join-Path $root "store-apis-config.json")) {
  $unified = Get-Content (Join-Path $root "store-apis-config.json") -Raw | ConvertFrom-Json
  if ($unified.kroger.clientId) { $krogerConfig = $unified.kroger }
  if ($unified.walmart.consumerId) { $walmartConfig = $unified.walmart }
  if ($unified.rapidApi.key) { $rapidApiKey = $unified.rapidApi.key }
  if ($unified.serpApi.key) { $serpApiKey = $unified.serpApi.key }
}

$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.css'='text/css; charset=utf-8'; '.png'='image/png' }
$script:KrogerToken = $null
$script:KrogerTokenExp = [datetime]::MinValue
$TargetKey = '9f36aeafbe60771e321a7cc95a78140772ab3e96'

function Send-Json($ctx, $obj, $code) {
  if ($code) { $ctx.Response.StatusCode = $code }
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 12 -Compress))
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

function Http-Get($url, $headers) {
  $req = [System.Net.WebRequest]::Create($url)
  $req.Method = 'GET'
  $req.UserAgent = 'WeekPlate/1.0'
  if ($headers) { $headers.GetEnumerator() | ForEach-Object { $req.Headers.Add($_.Key, $_.Value) } }
  $resp = $req.GetResponse()
  $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
  return $reader.ReadToEnd()
}

function Get-KrogerToken {
  if ($script:KrogerToken -and (Get-Date) -lt $script:KrogerTokenExp) { return $script:KrogerToken }
  if (-not $krogerConfig -or -not $krogerConfig.clientId) { return $null }
  $cred = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($krogerConfig.clientId):$($krogerConfig.clientSecret)"))
  $req = [System.Net.WebRequest]::Create('https://api.kroger.com/v1/connect/oauth2/token')
  $req.Method = 'POST'
  $req.ContentType = 'application/x-www-form-urlencoded'
  $req.Headers.Add('Authorization', "Basic $cred")
  $body = [Text.Encoding]::UTF8.GetBytes('grant_type=client_credentials&scope=product.compact')
  $req.ContentLength = $body.Length
  $s = $req.GetRequestStream(); $s.Write($body,0,$body.Length); $s.Close()
  $data = (New-Object System.IO.StreamReader($req.GetResponse().GetResponseStream())).ReadToEnd() | ConvertFrom-Json
  $script:KrogerToken = $data.access_token
  $script:KrogerTokenExp = (Get-Date).AddSeconds([int]$data.expires_in - 60)
  return $script:KrogerToken
}

function Kroger-Get($path) {
  $token = Get-KrogerToken
  if (-not $token) { throw 'Kroger not configured' }
  $req = [System.Net.WebRequest]::Create("https://api.kroger.com/v1/$path")
  $req.Method = 'GET'
  $req.Headers.Add('Authorization', "Bearer $token")
  return (New-Object System.IO.StreamReader($req.GetResponse().GetResponseStream())).ReadToEnd() | ConvertFrom-Json
}

function Target-Location($zip) {
  $url = "https://redsky.target.com/redsky_aggregations/v1/web/store_location_v1?store_id=&zip=$zip&key=$TargetKey"
  $json = Http-Get $url $null | ConvertFrom-Json
  $store = $json.data.store
  if (-not $store) { throw 'No Target store found' }
  return @{ store_id = $store.store_id; name = $store.location_name; address = $store.mailing_address }
}

function Target-Product($term, $storeId) {
  $enc = [uri]::EscapeDataString($term)
  $url = "https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?keyword=$enc&store_id=$storeId&key=$TargetKey&channel=WEB&count=3&offset=0&pricing_store_id=$storeId"
  $json = Http-Get $url $null | ConvertFrom-Json
  $item = $json.data.search.products[0]
  if (-not $item) { return @{ product = $null } }
  $price = $item.price.current_retail
  if (-not $price) { $price = [decimal]($item.price.formatted_current_price -replace '[^\d.]','') }
  $tcin = $item.tcin
  $name = $item.item.product_description.title
  $slug = ($name -replace '[^a-zA-Z0-9]+','-').ToLower().Trim('-')
  return @{ product = @{ name = $name; price = $price; tcin = $tcin; url = "https://www.target.com/p/-/-/A-$tcin" } }
}

function Walmart-Product-Rapid($term) {
  if (-not $rapidApiKey) { throw 'RapidAPI key not configured' }
  $enc = [uri]::EscapeDataString($term)
  $url = "https://real-time-walmart-data.p.rapidapi.com/search?query=$enc&page=1&sort_by=best_seller"
  $headers = @{ 'X-RapidAPI-Key' = $rapidApiKey; 'X-RapidAPI-Host' = 'real-time-walmart-data.p.rapidapi.com' }
  $json = Http-Get $url $headers | ConvertFrom-Json
  $item = $json.data.products[0]
  if (-not $item) { return @{ product = $null } }
  return @{ product = @{ name = $item.product_title; price = [decimal]$item.offer.price; itemId = $item.us_item_id; url = "https://www.walmart.com/ip/$($item.us_item_id)" } }
}

function Serp-Product($term) {
  if (-not $serpApiKey) { throw 'SerpAPI key not configured' }
  $enc = [uri]::EscapeDataString($term)
  $url = "https://serpapi.com/search.json?engine=google_shopping&q=$enc&api_key=$serpApiKey&num=3"
  $json = Http-Get $url $null | ConvertFrom-Json
  $item = $json.shopping_results[0]
  if (-not $item) { return @{ product = $null } }
  $price = $null
  if ($item.extracted_price) { $price = [decimal]$item.extracted_price }
  elseif ($item.price) { $price = [decimal]($item.price -replace '[^\d.]','') }
  return @{ product = @{ name = $item.title; price = $price; productId = $item.product_id; url = $item.link } }
}

function OFF-Product($term) {
  $enc = [uri]::EscapeDataString($term)
  $url = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=$enc&search_simple=1&action=process&json=1&page_size=3&fields=code,product_name,brands,image_url,quantity"
  $json = Http-Get $url $null | ConvertFrom-Json
  $p = $json.products[0]
  if (-not $p) { return @{ product = $null } }
  $price = $null
  try {
    $purl = "https://prices.openfoodfacts.org/api/v1/prices?product_code=$($p.code)&limit=1"
    $prices = Http-Get $purl $null | ConvertFrom-Json
    if ($prices.results -and $prices.results.Count -gt 0) { $price = [decimal]$prices.results[0].price }
  } catch {}
  if (-not $price) { $price = 3.99 }
  $name = if ($p.brands) { "$($p.product_name) ($($p.brands))" } else { $p.product_name }
  return @{ product = @{ name = $name; price = $price; code = $p.code; url = "https://world.openfoodfacts.org/product/$($p.code)" } }
}

$url = "http://localhost:$port"
Write-Host "WeekPlate running at $url" -ForegroundColor Green
if ($lanIp) {
  $wifi = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq $lanIp } | Select-Object -First 1).InterfaceAlias
  Write-Host "Phone (same Wi-Fi): http://${lanIp}:$port" -ForegroundColor Yellow
  if ($wifi) { Write-Host "  Connect phone to Wi-Fi: $wifi" -ForegroundColor DarkYellow }
  Write-Host "  Turn off mobile data on phone · use http not https · no trailing spaces" -ForegroundColor DarkGray
  Write-Host "  Scan food: Home → Scan food → Take photo (works on phone over http)" -ForegroundColor DarkGray
  Write-Host "Open that link on your phone browser, or Add to Home Screen for an app-like icon." -ForegroundColor DarkGray
}
Write-Host "Store APIs:" -ForegroundColor Cyan
Write-Host "  Target ........... ready (live prices)" -ForegroundColor Green
Write-Host "  Open Food Facts .. ready (community prices)" -ForegroundColor Green
if ($krogerConfig) { Write-Host "  Kroger ........... configured" -ForegroundColor Green } else { Write-Host "  Kroger ........... not configured" -ForegroundColor Yellow }
if ($walmartConfig -or $rapidApiKey) { Write-Host "  Walmart .......... configured" -ForegroundColor Green } else { Write-Host "  Walmart .......... needs walmart-config or RapidAPI key" -ForegroundColor Yellow }
if ($serpApiKey) { Write-Host "  Google Shopping .. configured (SerpAPI)" -ForegroundColor Green } else { Write-Host "  Google Shopping .. optional SerpAPI key in store-apis-config" -ForegroundColor Yellow }
Write-Host "Press Ctrl+C to stop"
Start-Process $url

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.LocalPath
  try {
    if ($path -eq '/api/stores/status') {
      Send-Json $ctx @{
        kroger = @{ available = [bool]$krogerConfig; configured = [bool]$krogerConfig.clientId; label = 'Kroger' }
        target = @{ available = $true; configured = $true; label = 'Target' }
        walmart = @{ available = [bool]($walmartConfig -or $rapidApiKey); configured = [bool]($walmartConfig -or $rapidApiKey); label = 'Walmart' }
        openfoodfacts = @{ available = $true; configured = $true; label = 'Open Food Facts' }
        serpapi = @{ available = [bool]$serpApiKey; configured = [bool]$serpApiKey; label = 'Google Shopping' }
      }
      continue
    }
    if ($path -eq '/api/kroger/status') {
      Send-Json $ctx @{ configured = [bool]$krogerConfig; hasCredentials = [bool]$krogerConfig.clientId }
      continue
    }
    if ($path -eq '/api/kroger/locations') {
      $zip = $ctx.Request.QueryString['zip']; $limit = if ($ctx.Request.QueryString['limit']) { $ctx.Request.QueryString['limit'] } else { '10' }
      if (-not $zip) { Send-Json $ctx @{ error = 'zip required' } 400; continue }
      Send-Json $ctx (Kroger-Get ('locations?filter.zipCode.near=' + $zip + '&filter.radiusInMiles=25&filter.limit=' + $limit))
      continue
    }
    if ($path -eq '/api/kroger/product') {
      $term = $ctx.Request.QueryString['term']; $loc = $ctx.Request.QueryString['locationId']
      if (-not $term -or -not $loc) { Send-Json $ctx @{ error = 'term and locationId required' } 400; continue }
      Send-Json $ctx (Kroger-Get ('products?filter.term=' + [uri]::EscapeDataString($term) + '&filter.locationId=' + $loc + '&filter.limit=3'))
      continue
    }
    if ($path -eq '/api/target/location') {
      $zip = $ctx.Request.QueryString['zip']
      if (-not $zip) { Send-Json $ctx @{ error = 'zip required' } 400; continue }
      Send-Json $ctx (Target-Location $zip)
      continue
    }
    if ($path -eq '/api/target/product') {
      $term = $ctx.Request.QueryString['term']; $sid = $ctx.Request.QueryString['storeId']
      if (-not $term -or -not $sid) { Send-Json $ctx @{ error = 'term and storeId required' } 400; continue }
      Send-Json $ctx (Target-Product $term $sid)
      continue
    }
    if ($path -eq '/api/walmart/product') {
      $term = $ctx.Request.QueryString['term']
      if (-not $term) { Send-Json $ctx @{ error = 'term required' } 400; continue }
      Send-Json $ctx (Walmart-Product-Rapid $term)
      continue
    }
    if ($path -eq '/api/walmart/location') {
      $zip = $ctx.Request.QueryString['zip']
      Send-Json $ctx @{ storeId = $zip; name = 'Walmart'; zip = $zip }
      continue
    }
    if ($path -eq '/api/openfoodfacts/product') {
      $term = $ctx.Request.QueryString['term']
      if (-not $term) { Send-Json $ctx @{ error = 'term required' } 400; continue }
      Send-Json $ctx (OFF-Product $term)
      continue
    }
    if ($path -eq '/api/serp/product') {
      $term = $ctx.Request.QueryString['term']
      if (-not $term) { Send-Json $ctx @{ error = 'term required' } 400; continue }
      Send-Json $ctx (Serp-Product $term)
      continue
    }
    if ($path -eq '/') { $path = '/index.html' }
    $file = Join-Path $root ($path.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar))
    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file)
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { Send-Json $ctx @{ error = $_.Exception.Message } 500; continue }
  $ctx.Response.Close()
}