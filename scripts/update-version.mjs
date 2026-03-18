import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const releaseType = process.argv[2];

if (!['fix', 'feature', 'major'].includes(releaseType)) {
  console.error('Usage: node ./scripts/update-version.mjs <fix|feature|major>');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const [major, minor, patch] = String(packageJson.version).split('.').map(Number);

if ([major, minor, patch].some(Number.isNaN)) {
  console.error(`Invalid version: ${packageJson.version}`);
  process.exit(1);
}

let nextVersion = packageJson.version;
if (releaseType === 'fix') {
  nextVersion = `${major}.${minor}.${patch + 1}`;
} else if (releaseType === 'feature') {
  nextVersion = `${major}.${minor + 1}.0`;
} else {
  nextVersion = `${major + 1}.0.0`;
}

packageJson.version = nextVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Updated version: ${nextVersion}`);