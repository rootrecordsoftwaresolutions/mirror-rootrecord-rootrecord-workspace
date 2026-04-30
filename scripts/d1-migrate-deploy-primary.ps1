$ErrorActionPreference = "Stop"
$rootCred = Join-Path (Split-Path $PSScriptRoot -Parent) "credentials.env"
if (-not (Test-Path -LiteralPath $rootCred)) {
  throw "credentials.env not found at $rootCred"
}
Get-Content -LiteralPath $rootCred | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $p = $line.IndexOf("=")
  if ($p -gt 0) {
    $k = $line.Substring(0, $p).Trim()
    $v = $line.Substring($p + 1).Trim()
    Set-Item -Path "Env:$k" -Value $v
  }
}
if ($env:CLOUDFLARE_GLOBAL_API_KEY -and -not $env:CLOUDFLARE_API_KEY) {
  Set-Item -Path "Env:CLOUDFLARE_API_KEY" -Value $env:CLOUDFLARE_GLOBAL_API_KEY
}
$primary = Join-Path (Split-Path $PSScriptRoot -Parent) "cloudflare\rootrecord-primary"
Set-Location $primary
Write-Host "--- D1 migrations apply (remote) ---"
npx wrangler d1 migrations apply root-record --remote
Write-Host "--- wrangler deploy ---"
npx wrangler deploy
Write-Host "Done."
