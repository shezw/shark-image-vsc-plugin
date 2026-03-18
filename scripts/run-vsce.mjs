import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const targetWorkingDirectory = process.env.SHARK_IMAGE_VSCE_CWD
  ? path.resolve(projectRoot, process.env.SHARK_IMAGE_VSCE_CWD)
  : projectRoot;

function resolveNpmCli() {
  if (process.env.SHARK_IMAGE_NPM_CLI && fs.existsSync(process.env.SHARK_IMAGE_NPM_CLI)) {
    return process.env.SHARK_IMAGE_NPM_CLI;
  }

  const realNode = fs.realpathSync(process.execPath);
  const nodeDir = path.dirname(realNode);
  const version = process.version.replace(/^v/, '');
  const candidates = [
    path.resolve(nodeDir, '../libexec/lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDir, '../../libexec/lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDir, `../Cellar/node/${version}/libexec/lib/node_modules/npm/bin/npm-cli.js`),
    path.resolve(nodeDir, '../opt/node/libexec/lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDir, '../opt/node@24/libexec/lib/node_modules/npm/bin/npm-cli.js'),
    '/Volumes/disk-ultra/homebrew/opt/node/libexec/lib/node_modules/npm/bin/npm-cli.js'
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function createNpmShim() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'shark-image-vsce-'));
  const shimPath = path.join(tempDirectory, 'npm');
  const npmCli = resolveNpmCli();

  const shimSource = npmCli
    ? `#!/bin/sh\nexec "${process.execPath}" "${npmCli}" "$@"\n`
    : "#!/bin/sh\nif [ \"$1\" = \"-v\" ] || [ \"$1\" = \"--version\" ]; then\n  echo 10.0.0\n  exit 0\nfi\necho 'npm CLI not found for Shark Image packaging.' >&2\nexit 1\n";

  fs.writeFileSync(shimPath, shimSource, { mode: 0o755 });
  return tempDirectory;
}

const shimDirectory = createNpmShim();
const vsceBinary = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'vsce.cmd' : 'vsce');
const result = spawnSync(vsceBinary, process.argv.slice(2), {
  stdio: 'inherit',
  cwd: targetWorkingDirectory,
  env: {
    ...process.env,
    PATH: `${shimDirectory}${path.delimiter}${process.env.PATH ?? ''}`
  }
});

process.exit(result.status ?? 1);