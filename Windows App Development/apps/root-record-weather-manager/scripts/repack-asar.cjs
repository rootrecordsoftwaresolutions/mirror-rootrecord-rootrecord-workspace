'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const asarPath = path.join(root, 'app', 'resources', 'app.asar');
const asarCli = path.join(root, 'node_modules', '@electron', 'asar', 'bin', 'asar.js');

if (!fs.existsSync(asarPath)) {
  console.error('[repack-asar] Missing', asarPath);
  process.exit(1);
}
if (!fs.existsSync(asarCli)) {
  console.error('[repack-asar] Missing asar CLI. Run npm install in', root);
  process.exit(1);
}

function asarCmd(args) {
  const r = spawnSync(process.execPath, [asarCli, ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: false
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rrwm-asar-'));
const outNew = `${asarPath}.new`;
try {
  asarCmd(['extract', asarPath, tmp]);
  const innerPkgPath = path.join(tmp, 'package.json');
  const inner = JSON.parse(fs.readFileSync(innerPkgPath, 'utf8'));
  inner.version = pkg.version;
  fs.writeFileSync(innerPkgPath, `${JSON.stringify(inner, null, 2)}\n`, 'utf8');
  if (fs.existsSync(outNew)) fs.rmSync(outNew, { force: true });
  asarCmd(['pack', tmp, outNew]);
  fs.rmSync(asarPath, { force: true });
  fs.renameSync(outNew, asarPath);
  console.log(`[repack-asar] app.asar package.json version -> ${pkg.version}`);
} catch (e) {
  if (fs.existsSync(outNew)) fs.rmSync(outNew, { force: true });
  throw e;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
