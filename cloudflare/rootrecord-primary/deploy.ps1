# Load credentials.env (walk up from this script until RootRecord/credentials.env is found), then D1 migrate + deploy.
$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}
$repoRoot = $null
$probe = $PSScriptRoot
for ($i = 0; $i -le 12; $i++) {
    $tryCred = Join-Path $probe "credentials.env"
    if (Test-Path -LiteralPath $tryCred) {
        $repoRoot = $probe
        break
    }
    $parent = Split-Path $probe -Parent
    if (-not $parent -or $parent -eq $probe) { break }
    $probe = $parent
}
if (-not $repoRoot) {
    throw "credentials.env not found (searched parents of $PSScriptRoot)."
}
$rootCred = Join-Path $repoRoot "credentials.env"
Get-Content $rootCred | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $p = $line.IndexOf("=")
    if ($p -gt 0) {
        $k = $line.Substring(0, $p).Trim()
        $v = $line.Substring($p + 1).Trim()
        Set-Item -Path "Env:$k" -Value $v
    }
}
# Wrangler global key auth uses CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL (see Cloudflare system env docs).
if ($env:CLOUDFLARE_GLOBAL_API_KEY -and -not $env:CLOUDFLARE_API_KEY) {
    Set-Item -Path "Env:CLOUDFLARE_API_KEY" -Value $env:CLOUDFLARE_GLOBAL_API_KEY
}
Set-Location $PSScriptRoot
$wranglerToml = Get-Content -LiteralPath (Join-Path $PSScriptRoot "wrangler.toml") -Raw
if ($wranglerToml -notmatch 'database_name\s*=\s*"root-record"') {
    throw "wrangler.toml must set database_name = `"root-record`" only."
}
$expectId = [string]$env:D1_DATABASE_ID
if ($expectId.Length -ge 32 -and $wranglerToml -notmatch [regex]::Escape($expectId)) {
    throw "wrangler.toml database_id must match D1_DATABASE_ID from credentials.env."
}
$hasToken = $env:CLOUDFLARE_API_TOKEN -and $env:CLOUDFLARE_API_TOKEN.Length -ge 10
$hasGlobal = $env:CLOUDFLARE_API_KEY -and $env:CLOUDFLARE_API_KEY.Length -ge 10 -and $env:CLOUDFLARE_EMAIL -and $env:CLOUDFLARE_EMAIL.Length -gt 3
if (-not $hasToken -and -not $hasGlobal) {
    Write-Host "Set either CLOUDFLARE_API_TOKEN, or CLOUDFLARE_EMAIL + CLOUDFLARE_GLOBAL_API_KEY (mapped to CLOUDFLARE_API_KEY for Wrangler)."
    exit 1
}

$jwtFile = Join-Path $PSScriptRoot ".deploy-jwt"
$jwt = [string]$env:ROOTRECORD_PRIMARY_JWT_SECRET
if (-not $jwt -or $jwt.Length -lt 16) {
    if (Test-Path -LiteralPath $jwtFile) {
        $jwt = (Get-Content -LiteralPath $jwtFile -Raw).Trim()
    }
}
if (-not $jwt -or $jwt.Length -lt 16) {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $jwt = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "").Replace("/", "")
    Set-Content -LiteralPath $jwtFile -Value $jwt -NoNewline
    Write-Host "Generated JWT secret in .deploy-jwt (gitignored). Optional: ROOTRECORD_PRIMARY_JWT_SECRET in credentials.env."
}
$jwt | npx wrangler secret put JWT_SECRET

$pushAdmin = [string]$env:RR_PUSH_ADMIN_SECRET
if ($pushAdmin -and $pushAdmin.Length -ge 8) {
  $pushAdmin | npx wrangler secret put RR_PUSH_ADMIN_SECRET
}

$usageAdmin = [string]$env:RR_USAGE_ADMIN_SECRET
if ($usageAdmin -and $usageAdmin.Length -ge 8) {
  $usageAdmin | npx wrangler secret put RR_USAGE_ADMIN_SECRET
}

$fcmPath = [string]$env:FCM_SERVICE_ACCOUNT_JSON_PATH
if (-not $fcmPath) { $fcmPath = [string]$env:FCM_SERVICE_ACCOUNT_JSON_FILE }
if ($fcmPath -and (Test-Path -LiteralPath $fcmPath)) {
  (Get-Content -LiteralPath $fcmPath -Raw) | npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON
}

$stripeSecret = [string]$env:STRIPE_SECRET_KEY
if ($stripeSecret -match '^sk_(live|test)_' -and $stripeSecret.Length -gt 30) {
  $stripeSecret | npx wrangler secret put STRIPE_SECRET_KEY
  Write-Host "Uploaded STRIPE_SECRET_KEY to Worker (from credentials.env)."
}

$accuApiKey = [string]$env:ACCUWEATHER_API_KEY
if ($accuApiKey -and $accuApiKey.Length -ge 16) {
  $accuApiKey | npx wrangler secret put ACCUWEATHER_API_KEY
  Write-Host "Uploaded ACCUWEATHER_API_KEY to Worker (from credentials.env)."
}

npx wrangler d1 migrations apply root-record --remote
npx wrangler deploy
