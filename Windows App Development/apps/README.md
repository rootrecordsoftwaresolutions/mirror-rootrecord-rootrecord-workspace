# Applications

Each **RootRecord** Windows / Electron product lives in its **own subdirectory** with its own `package.json`.

## Current apps

| Folder | Product | Recovery |
|--------|---------|----------|
| `root-record-business-manager/` | Root Record Business Manager (setup 2.0.12) | Inno silent install → `app/`; Electron payload and project files under `app/resources/app/`. |
| `root-record-weather-manager/` | Root Record Weather Manager (setup 1.0.18) | NSIS + nested `app-64.7z` → `app/` (Electron runtime + `resources/app.asar`). |
| `rootrecord-solana-toolkit/` | RootRecord Solana Toolkit (Vite + Electron) | Clone of [solana.rootrecord.info](https://solana.rootrecord.info) tooling; `npm install` in-folder, `npm run dev` / `npm run dist:win`. See that folder’s `README.md`. |

Each app folder has its own `README.md` with layout notes.

After copying a project in, open that folder and run:

```powershell
npm install
```

Use that app’s documented scripts for development and release builds.

**Shared credentials:** keep a single `.env` at the **workspace root** (next to `.rootrecord-workspace`). Call `scripts/load-workspace-env.cjs` from each app’s Electron main entry — see `docs/WORKSPACE.md`.
