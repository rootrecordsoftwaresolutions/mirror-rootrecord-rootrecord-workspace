# Root Record Weather Manager

Recovered from `Root.Record.Weather.Manager-Setup-1.0.18.exe` (NSIS + nested 7z). Use **`Build-Installer.bat`** in this folder to repack `app.asar` to the version in **`package.json`** and produce **`dist\Root.Record.Weather.Manager-Setup-{version}.exe`** (requires Node.js and **`npm install`** once).

## Layout

- **`app/`** — Full Electron runtime: `RootRecordWeatherManager.exe`, `resources/app.asar`, `resources/app.asar.unpacked/` (native modules and assets).

The workspace installer copy lives at:

`../../Root.Record.Weather.Manager-Setup-1.0.18.exe`

## Re-run extract (7-Zip)

From this folder, with 7-Zip on `PATH` or using the full path to `7z.exe`:

```powershell
$root = $PWD.Path
$setup = Join-Path $root "..\..\Root.Record.Weather.Manager-Setup-1.0.18.exe"
$stage = Join-Path $root "extracted-staging"
$seven = "C:\Program Files\7-Zip\7z.exe"
Remove-Item -LiteralPath $stage, (Join-Path $root "app") -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null
& $seven x $setup "-o$stage" -y
& $seven x (Join-Path $stage '$PLUGINSDIR\app-64.7z') "-o$(Join-Path $root 'app')" -y
Remove-Item -LiteralPath $stage -Recurse -Force
```

If `$PLUGINSDIR` path issues appear in PowerShell, use the literal path from Explorer once, then keep it in a small `.ps1` beside this README.
