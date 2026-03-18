import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const stageDirectory = path.join(projectRoot, '.vsce-stage');
const runtimeDependenciesDirectory = path.join(stageDirectory, 'runtime-deps');
const command = process.argv[2] ?? 'package';

const runtimePackageMap = {
  sharp: 'sharp@',
  'detect-libc': 'detect-libc@',
  semver: 'semver@',
  color: 'color@',
  'color-string': 'color-string@',
  'color-convert': 'color-convert@',
  'color-name': 'color-name@',
  'simple-swizzle': 'simple-swizzle@',
  'is-arrayish': 'is-arrayish@',
  '@img/sharp-darwin-arm64': '@img+sharp-darwin-arm64@',
  '@img/sharp-libvips-darwin-arm64': '@img+sharp-libvips-darwin-arm64@'
};

function materializeSymlinks(rootDirectory) {
  const entries = fs.readdirSync(rootDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDirectory, entry.name);
    const stats = fs.lstatSync(entryPath);

    if (stats.isSymbolicLink()) {
      const resolvedPath = fs.realpathSync(entryPath);
      fs.rmSync(entryPath, { recursive: true, force: true });

      const resolvedStats = fs.statSync(resolvedPath);
      if (resolvedStats.isDirectory()) {
        fs.cpSync(resolvedPath, entryPath, { recursive: true, dereference: true, force: true });
        materializeSymlinks(entryPath);
      } else {
        fs.copyFileSync(resolvedPath, entryPath);
      }

      continue;
    }

    if (stats.isDirectory()) {
      materializeSymlinks(entryPath);
    }
  }
}

function copyPackageFromPnpmStore(packageName, packageDirectoryPrefix, destinationRoot) {
  const pnpmDirectory = path.join(stageDirectory, 'node_modules', '.pnpm');
  const matchedEntry = fs.readdirSync(pnpmDirectory).find((entry) => entry.startsWith(packageDirectoryPrefix));

  if (!matchedEntry) {
    throw new Error(`Unable to locate runtime package ${packageName} in staged pnpm directory.`);
  }

  const sourceDirectory = path.join(pnpmDirectory, matchedEntry, 'node_modules', ...packageName.split('/'));
  const targetDirectory = path.join(destinationRoot, ...packageName.split('/'));
  fs.mkdirSync(path.dirname(targetDirectory), { recursive: true });
  fs.cpSync(sourceDirectory, targetDirectory, { recursive: true, dereference: true, force: true });
}

function pruneRuntimeFiles(rootDirectory) {
  const entries = fs.readdirSync(rootDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDirectory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'src' || entry.name === 'install' || entry.name === '.bin') {
        fs.rmSync(entryPath, { recursive: true, force: true });
        continue;
      }

      pruneRuntimeFiles(entryPath);
      continue;
    }

    if (entry.name === '.DS_Store') {
      fs.rmSync(entryPath, { force: true });
      continue;
    }

    if (entry.name.endsWith('.md') || entry.name.endsWith('.ts') || entry.name.endsWith('.map') || entry.name.endsWith('.gyp')) {
      fs.rmSync(entryPath, { force: true });
    }
  }
}

fs.rmSync(stageDirectory, { recursive: true, force: true });

const build = spawnSync(process.execPath, [path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', './'], {
  cwd: projectRoot,
  stdio: 'inherit'
});

if ((build.status ?? 1) !== 0) {
  process.exit(build.status ?? 1);
}

const deploy = spawnSync('pnpm', ['--filter', '.', 'deploy', '--prod', '.vsce-stage'], {
  cwd: projectRoot,
  stdio: 'inherit'
});

if ((deploy.status ?? 1) !== 0) {
  process.exit(deploy.status ?? 1);
}

fs.rmSync(runtimeDependenciesDirectory, { recursive: true, force: true });
const runtimeNodeModulesDirectory = path.join(runtimeDependenciesDirectory, 'node_modules');
fs.mkdirSync(runtimeNodeModulesDirectory, { recursive: true });

for (const [packageName, directoryPrefix] of Object.entries(runtimePackageMap)) {
  copyPackageFromPnpmStore(packageName, directoryPrefix, runtimeNodeModulesDirectory);
}

materializeSymlinks(runtimeDependenciesDirectory);
pruneRuntimeFiles(runtimeDependenciesDirectory);
fs.rmSync(path.join(runtimeNodeModulesDirectory, '.modules.yaml'), { force: true });

const runVsce = spawnSync(process.execPath, [path.join(scriptDirectory, 'run-vsce.mjs'), command, '--no-dependencies', '--allow-missing-repository'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    SHARK_IMAGE_VSCE_CWD: '.vsce-stage'
  }
});

if ((runVsce.status ?? 1) !== 0) {
  process.exit(runVsce.status ?? 1);
}

for (const entry of fs.readdirSync(projectRoot)) {
  if (!entry.endsWith('.vsix')) {
    continue;
  }

  fs.rmSync(path.join(projectRoot, entry), { force: true });
}

for (const entry of fs.readdirSync(stageDirectory)) {
  if (!entry.endsWith('.vsix')) {
    continue;
  }

  fs.copyFileSync(path.join(stageDirectory, entry), path.join(projectRoot, entry));
}