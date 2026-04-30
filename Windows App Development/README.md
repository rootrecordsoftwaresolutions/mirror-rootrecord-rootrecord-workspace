# RootRecord — Windows app development

Central workspace for **RootRecord** Windows desktop apps (Electron, installers, release assets).

## Layout

| Path | Purpose |
|------|---------|
| `apps/` | One folder per application (each has its own `package.json` and `npm install`). |
| `docs/` | Workspace conventions, release notes, and shared checklists. |
| `scripts/` | Cross-project helpers (prerequisite checks, paths, shared env loader). |
| `.env` (you create) | **Shared** API keys and credentials for every app under `apps/` — one file at workspace root. |

## Shared environment (`.env`)

All apps can use the **same** workspace-root `.env` for local development. Copy `.env.example` to `.env` in this folder, fill in values, and run `npm install` once at the workspace root. Each Electron **main** process should call `scripts/load-workspace-env.cjs` early (see `docs/WORKSPACE.md` for paths and packaged-build notes).

## Prerequisites

- **Node.js** LTS (v18+ recommended) — [nodejs.org](https://nodejs.org/)
- **Git** — commits and remotes are how this workspace stays safe.
- **Inno Setup** (if you ship `.iss` installers) — one machine install; see `docs/WORKSPACE.md`.

### Git identity (before your first commit)

If `git commit` fails with “tell me who you are”, set your name and email once (use your real values):

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Then from this folder: `git add -A` and `git commit -m "Initial workspace"`.

Run a quick check from this folder:

```powershell
npm run check
```

Build **unsigned** installers for **both** desktop apps (after **`npm install`** in each app folder that needs it):

```bat
build-both-installers.bat
```

## Daily workflow

1. Open the **app folder** under `apps/<your-app>/` in Cursor or VS Code.
2. `npm install` inside that app (not necessarily at the workspace root).
3. Use each app’s `package.json` scripts (`npm run dev`, `npm run build`, etc.).
4. **Commit and push** from each app’s repo (or from a monorepo root if you later merge apps under one git root).

## Adding an app

1. Create `apps/<short-name>/` (kebab-case recommended).
2. Copy or clone the project into that folder so `package.json` sits at `apps/<short-name>/package.json`.
3. Run `npm install` inside the app folder.
4. Optionally adopt **npm workspaces** later by adding a root `workspaces` field — see `docs/WORKSPACE.md`.

## Optional: one git repo for everything

If you want a single repository for all apps, initialize git **here** at the workspace root and remove nested `.git` folders from apps (or use submodules). The default layout assumes **you choose** mono-repo vs one-repo-per-app; both work with this folder structure.
