#!/usr/bin/env node
// Syncs release version metadata after `npm version` bumps server/package.json.
// Never touches server/package.json — npm version owns it.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const INDEX_VERSION_RE = /version: '\d+\.\d+\.\d+'/;
const UNRELEASED_HEADING_RE = /^## Unreleased$/m;

function fail(message) {
  console.error(`bump-version: error: ${message}`);
  process.exit(1);
}

function parseSetArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--set') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) fail('--set requires a value, e.g. --set 1.7.0');
      return value;
    }
    if (arg.startsWith('--set=')) return arg.slice('--set='.length);
  }
  return null;
}

function localDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    fail(`cannot read ${path}: ${err.message}`);
  }
}

function write(path, contents) {
  try {
    writeFileSync(path, contents);
  } catch (err) {
    fail(`cannot write ${path}: ${err.message}`);
  }
}

// Resolve every path from the script location so the cwd never matters.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(scriptDir, '..');
const repoRoot = resolve(serverDir, '..');
const indexTsPath = join(serverDir, 'src', 'index.ts');
const lockPath = join(serverDir, 'package-lock.json');
const changelogPath = join(repoRoot, 'CHANGELOG.md');

const setVersion = parseSetArg(process.argv.slice(2));
const version = setVersion ?? process.env.npm_package_version ?? null;

if (!version) {
  fail('no version provided: pass --set <x.y.z>, or run via npm so npm_package_version is set');
}
if (!SEMVER_RE.test(version)) {
  fail(`invalid version "${version}": expected MAJOR.MINOR.PATCH, e.g. 1.7.0`);
}

const summary = [];

// a. server/src/index.ts — the FastMCP version constant.
const before = read(indexTsPath);
if (!INDEX_VERSION_RE.test(before)) {
  fail(`version constant not found in ${indexTsPath} (expected: version: '<x.y.z>',)`);
}
const after = before.replace(INDEX_VERSION_RE, `version: '${version}'`);
const currentVersion = before.match(INDEX_VERSION_RE)[0].match(/'\d+\.\d+\.\d+'/)[0].slice(1, -1);
write(indexTsPath, after);
summary.push(`server/src/index.ts        version: '${currentVersion}' -> '${version}'${currentVersion === version ? ' (unchanged)' : ''}`);

// b. server/package-lock.json — top-level and packages[""] version fields
// (npm version only rewrites package.json; this also fixes historical drift).
const lock = JSON.parse(read(lockPath));
if (!lock.packages || !lock.packages['']) {
  fail(`unexpected ${lockPath}: missing packages[""] entry (lockfileVersion ${lock.lockfileVersion})`);
}
const lockTopBefore = lock.version;
const lockPkgBefore = lock.packages[''].version;
lock.version = version;
lock.packages[''].version = version;
write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
summary.push(
  `server/package-lock.json   top-level: ${lockTopBefore} -> ${version}, packages[""]: ${lockPkgBefore} -> ${version}` +
    (lockTopBefore === version && lockPkgBefore === version ? ' (unchanged)' : ''),
);

// c. CHANGELOG.md — promote the first Unreleased heading (double-release guard:
// a second run with no Unreleased section must fail loudly, not re-release).
const changelogBefore = read(changelogPath);
if (!UNRELEASED_HEADING_RE.test(changelogBefore)) {
  fail(`no "## Unreleased" heading found in ${changelogPath} — has this version already been released?`);
}
const releaseHeading = `## ${version} - ${localDate(new Date())}`;
const changelogAfter = changelogBefore.replace(UNRELEASED_HEADING_RE, releaseHeading);
write(changelogPath, changelogAfter);
summary.push(`CHANGELOG.md              "## Unreleased" -> "${releaseHeading}"`);

console.log(`bump-version: synced to ${version}`);
for (const line of summary) console.log(`  ${line}`);
