#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies common tools for RootRecord Windows / Electron development.
#>

function Test-ToolOnPath {
  param(
    [string]$Label,
    [string]$CommandName
  )
  $cmd = Get-Command -Name $CommandName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) {
    Write-Host ('  [OK] ' + $Label) -ForegroundColor Green
    Write-Host ('       ' + $cmd.Source) -ForegroundColor DarkGray
  } else {
    Write-Host ('  [--] ' + $Label + ' not on PATH') -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host 'RootRecord - prerequisite check' -ForegroundColor Cyan
Write-Host ''

Write-Host 'Runtime / tooling:' -ForegroundColor White
Test-ToolOnPath 'Node.js' 'node'
Test-ToolOnPath 'npm' 'npm'

Write-Host ''
Write-Host 'Inno Setup (optional, for .iss installers):' -ForegroundColor White
$innoCandidates = @(
  $env:INNO_SETUP,
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if ($innoCandidates) {
  Write-Host '  [OK] ISCC.exe found at:' -ForegroundColor Green
  Write-Host ('       ' + $innoCandidates) -ForegroundColor DarkGray
} else {
  Write-Host '  [--] ISCC.exe not found (set INNO_SETUP or install Inno Setup 6)' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Workspace layout:' -ForegroundColor White
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$appsDir = Join-Path $workspaceRoot 'apps'
if (Test-Path -LiteralPath $appsDir) {
  Write-Host ('  apps -> ' + $appsDir) -ForegroundColor DarkGray
}

Write-Host ''
