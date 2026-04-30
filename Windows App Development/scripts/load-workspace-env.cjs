'use strict';

/**
 * Loads the workspace-root `.env` (next to `.rootrecord-workspace`).
 * Use from Electron main or Node scripts during local development.
 *
 * In packaged builds there is usually no workspace marker: call only when
 * `!app.isPackaged` or pass `{ optional: true }` so missing files are silent.
 */

const fs = require('fs');
const path = require('path');

function findWorkspaceRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const marker = path.join(dir, '.rootrecord-workspace');
    if (fs.existsSync(marker)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.startDir] - Walk upward from this directory (use `__dirname` of your entry file).
 * @param {boolean} [options.optional] - If true, missing marker or `.env` is silent (no console warnings).
 * @returns {{ ok: boolean, root?: string, envPath?: string, reason?: string }}
 */
function loadWorkspaceEnv(options = {}) {
  const start = options.startDir || process.cwd();
  const optional = Boolean(options.optional);
  const root = findWorkspaceRoot(start);

  if (!root) {
    if (!optional) {
      console.warn('[load-workspace-env] .rootrecord-workspace not found above:', start);
    }
    return { ok: false, reason: 'no-marker' };
  }

  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    if (!optional) {
      console.warn('[load-workspace-env] Missing .env — copy .env.example to .env at:', envPath);
    }
    return { ok: false, reason: 'no-env-file', root, envPath };
  }

  let dotenv;
  try {
    dotenv = require('dotenv');
  } catch {
    if (!optional) {
      console.warn(
        '[load-workspace-env] Install workspace dependencies: cd workspace root && npm install'
      );
    }
    return { ok: false, reason: 'no-dotenv', root, envPath };
  }

  dotenv.config({ path: envPath });
  process.env.ROOTRECORD_WORKSPACE_ROOT = root;
  return { ok: true, root, envPath };
}

module.exports = loadWorkspaceEnv;
