$ErrorActionPreference = 'Stop'
$credPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'credentials.env'
if (-not (Test-Path $credPath)) { throw "Missing credentials.env at $credPath" }
Get-Content $credPath | ForEach-Object {
  $line = $_
  if ($line -match '^\s*#' -or $line -match '^\s*$') { return }
  $i = $line.IndexOf('=')
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim()
  [Environment]::SetEnvironmentVariable($k, $v, 'Process')
}

$email = $env:CLOUDFLARE_EMAIL
$key = $env:CLOUDFLARE_API_KEY
if (-not $email -or -not $key) { throw 'Set CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY in credentials.env' }

$h = @{
  'X-Auth-Email' = $email
  'X-Auth-Key'   = $key
}

$zones = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/zones?name=rootrecord.info' -Headers $h
if (-not $zones.success) {
  throw ('Zone list failed: ' + ($zones.errors | ConvertTo-Json -Compress))
}
$z = $zones.result | Select-Object -First 1
Write-Host ('ZONE_ID=' + $z.id)

$uri = "https://api.cloudflare.com/client/v4/zones/$($z.id)/dns_records?name=solana.rootrecord.info"
$all = Invoke-RestMethod -Uri $uri -Headers $h
Write-Host ('Total DNS rows for solana.rootrecord.info: ' + $all.result.Count)
foreach ($r in $all.result) {
  Write-Host ("  type=$($r.type) id=$($r.id) name=$($r.name) content=$($r.content) proxied=$($r.proxied) ttl=$($r.ttl)")
}
