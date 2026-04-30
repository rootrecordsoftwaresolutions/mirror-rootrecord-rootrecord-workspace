# Workspace conventions

## Shared `.env` (workspace root)

All apps can read the **same** local credentials from a single file next to the workspace marker:

| File | Purpose |
|------|---------|
| `.rootrecord-workspace` | Marker so tools find the workspace root (committed). |
| `.env` | Your real secrets and URLs (never committed). |
| `.env.example` | Documented template; copy to `.env` and fill in (committed). |

**Setup**

1. At workspace root, run `npm install` once (installs `dotenv` for the loader).
2. Copy `.env.example` to `.env` and edit values.
3. In each Electron app **main process**, load before other code that reads `process.env`.

From `apps/<app>/src/main.js` (three `..` segments reach the workspace root):

```javascript
const path = require('path');
const loadWorkspaceEnv = require(path.join(__dirname, '..', '..', '..', 'scripts', 'load-workspace-env.cjs'));
loadWorkspaceEnv({ startDir: __dirname, optional: true });
```

`optional: true` avoids console noise when the app is **packaged** (no workspace marker) or when `.env` is missing.

If your entry file is at `apps/<app>/main.js`, use two `..` segments instead of three.

**Packaged installs:** Installed users do not have this workspace tree. Keep using your existing pattern (for example data under `%USERPROFILE%` or app-specific env). The shared `.env` is for **developer machines** only unless you deliberately ship other config.

**Variable names:** Use the same `process.env.MY_KEY` names across apps, or map once in a small shared module. `.env.example` lists suggested placeholders; rename lines to match your code.

## One Inno Setup install

Install [Inno Setup](https://jrsoftware.org/isinfo.php) once (typically v6 under Program Files). Point build scripts at `ISCC.exe`, for example:

- `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`

Optional: set a user or machine environment variable `INNO_SETUP` to that path so scripts stay portable.

Do **not** copy Inno into each app repository.

## Electron and node_modules

- Keep **`electron`** and **`electron-builder`** as `devDependencies` in **each app’s** `package.json` so versions stay pinned per product.
- Electron’s **binary cache** is shared under your user profile (e.g. `%LOCALAPPDATA%\electron` and `%LOCALAPPDATA%\electron-builder`), so you are not re-downloading full runtimes for every project unnecessarily.

## Monorepo (optional)

If multiple apps share the same major versions, you can switch the workspace root `package.json` to [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces):

```json
"workspaces": ["apps/*"]
```

Then run `npm install` once at the root. Each app still has its own `package.json`; hoisting reduces duplicate packages. **Only do this** when every app under `apps/` is part of the same git tree.

## Commits and backups

- Commit **source, configs, and lockfiles** (`package-lock.json` / `pnpm-lock.yaml`).
- Do **not** commit `node_modules/`, `release/`, or signing keys.
- Push to a **remote** (GitHub/GitLab/etc.) regularly.

## Naming

- App folders: **kebab-case** (`root-record-weather-manager`).
- `package.json` `name` field: scoped npm style is fine (`@rootrecord/weather-manager`) if you publish or align internal tooling.
