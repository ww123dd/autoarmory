#!/usr/bin/env node
'use strict';

// Mechanical re-pin for the local verifier profile.
//
// The verifier trust root has two halves: verifiers.lock.json inside the repository
// (gitignored; it holds the pinned adapter/bridge digests) and the external anchor
// ~/.codex/hooks/verifier-lock.sha256 outside it. Expanding the profile must not be
// a manual edit of the trust root, so this tool recomputes every digest the lock
// pins and rewrites both halves in one step.
//
// It fails closed when the two halves already disagree: re-pinning must never paper
// over drift. --allow-drift exists only to recover a profile that was deliberately
// replaced out of band.
//
// usage: node scripts/verifier-pin.js [--merge new-verifiers.json] [--lock path]
//                                    [--anchor path] [--dry-run] [--allow-drift]

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const repo = path.resolve(process.env.AUTOARMORY_REPO || process.cwd());
const flags = new Set(process.argv.slice(2).filter(function (value) { return value.indexOf('--') === 0; }));
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] && process.argv[index + 1].indexOf('--') !== 0 ? process.argv[index + 1] : null;
}
const lockPath = path.resolve(arg('--lock') || process.env.AUTOARMORY_LOCK_PATH || path.join(repo, 'verifiers.lock.json'));
const anchorPath = path.resolve(arg('--anchor') || process.env.AUTOARMORY_LOCK_ANCHOR || path.join(os.homedir(), '.codex', 'hooks', 'verifier-lock.sha256'));
const mergeFile = arg('--merge');
const dryRun = flags.has('--dry-run');
const allowDrift = flags.has('--allow-drift');

function fail(message) {
  process.stderr.write('VERIFIER_PIN_BLOCK\n' + message + '\n');
  process.exit(2);
}
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function expandHome(value) {
  if (typeof value !== 'string' || !value) return value;
  if (value === '~') return os.homedir();
  if (value.indexOf('~/') === 0 || value.indexOf('~\\') === 0) return path.join(os.homedir(), value.slice(2));
  return value;
}
function resolveFromRepo(value) { return path.resolve(repo, expandHome(value)); }
function inside(target, base) {
  const full = path.resolve(target);
  const root = path.resolve(base);
  return full === root || full.indexOf(root + path.sep) === 0;
}

if (inside(anchorPath, repo)) fail('the verifier-lock anchor must live outside the repository: ' + anchorPath);
if (inside(lockPath, anchorPath) || inside(anchorPath, lockPath)) fail('lock and anchor must be separate files');

if (!fs.existsSync(lockPath)) fail('local verifier profile not found: ' + lockPath);
let lock;
try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch (error) { fail('unreadable profile: ' + error.message); }
if (lock.schema_version !== 'autoarmory/verifiers-lock/v1') fail('unexpected schema_version: ' + lock.schema_version);
if (!Array.isArray(lock.verifiers) || lock.verifiers.length === 0) fail('profile declares no verifiers');

const pinnedDigest = sha256File(lockPath);
if (fs.existsSync(anchorPath) && !allowDrift) {
  const expected = fs.readFileSync(anchorPath, 'utf8').trim().toLowerCase();
  if (expected !== pinnedDigest) {
    fail('trust root drift: anchor ' + expected.slice(0, 12) + ' != lock ' + pinnedDigest.slice(0, 12) + '; review the change, or re-pin deliberately with --allow-drift');
  }
}

if (mergeFile) {
  let incoming;
  try { incoming = JSON.parse(fs.readFileSync(path.resolve(mergeFile), 'utf8')); } catch (error) { fail('unreadable merge file: ' + error.message); }
  const list = Array.isArray(incoming) ? incoming : (incoming && Array.isArray(incoming.verifiers) ? incoming.verifiers : null);
  if (!list) fail('merge file must be an array or { verifiers: [...] }');
  for (const item of list) {
    if (!item || !item.id) fail('every merged verifier needs an id');
    const index = lock.verifiers.findIndex(function (existing) { return existing.id === item.id; });
    if (index >= 0) lock.verifiers[index] = item; else lock.verifiers.push(item);
  }
}

const rows = [];
for (const item of lock.verifiers) {
  if (!item.id) fail('every verifier needs an id');
  if (typeof item.adapter !== 'string' || !inside(resolveFromRepo(item.adapter), repo)) fail(item.id + ': adapter must stay inside the repository');
  const adapterPath = resolveFromRepo(item.adapter);
  if (!fs.existsSync(adapterPath)) fail(item.id + ': adapter missing: ' + item.adapter);
  item.adapter_sha256 = sha256File(adapterPath);
  if (typeof item.version !== 'string' || !item.version) fail(item.id + ': verifier.version must be declared (human-readable compatibility label)');
  if (typeof item.invocation_contract_version !== 'string' || !item.invocation_contract_version) fail(item.id + ': verifier.invocation_contract_version must be declared');
  const row = { id: item.id, kind: item.kind || null, version: item.version, contract: item.invocation_contract_version, adapter: item.adapter + '@' + item.adapter_sha256.slice(0, 12), bridge: null, bridge_sha256: null, extras: [] };
  if (item.bridge && typeof item.bridge === 'object') {
    if (typeof item.bridge.adapter !== 'string' || !inside(resolveFromRepo(item.bridge.adapter), repo)) fail(item.id + ': bridge must stay inside the repository');
    const bridgePath = resolveFromRepo(item.bridge.adapter);
    if (!fs.existsSync(bridgePath)) fail(item.id + ': bridge missing: ' + item.bridge.adapter);
    item.bridge.adapter_sha256 = sha256File(bridgePath);
    row.bridge = item.bridge.adapter;
    row.bridge_sha256 = item.bridge.adapter_sha256;
    const server = item.bridge.server || (item.bridge.server = {});
    for (const key of ['config', 'entry']) {
      if (typeof server[key] !== 'string' || !server[key]) continue;
      const file = resolveFromRepo(server[key]);
      if (!fs.existsSync(file)) { row.extras.push(key + '=missing'); continue; }
      server[key + '_sha256'] = sha256File(file);
      row.extras.push(key + '=' + server[key + '_sha256'].slice(0, 12));
    }
  }
  rows.push(row);
}

const text = JSON.stringify(lock, null, 2) + '\n';
const nextDigest = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const summary = rows.map(function (row) {
  const parts = [row.id, row.kind || 'unknown', 'v' + row.version, row.contract, row.adapter];
  if (row.bridge) parts.push(row.bridge + '@' + row.bridge_sha256.slice(0, 12));
  if (row.extras.length) parts.push(row.extras.join(','));
  return '  ' + parts.join(' | ');
}).join('\n');

if (dryRun) {
  process.stdout.write('verifier pin (dry run): ' + rows.length + ' verifiers\n' + summary + '\n  next lock digest ' + nextDigest + ' (anchor not written)\n');
  process.exit(0);
}
fs.writeFileSync(lockPath, text, 'utf8');
fs.mkdirSync(path.dirname(anchorPath), { recursive: true });
fs.writeFileSync(anchorPath, nextDigest + '\n', 'utf8');
process.stdout.write('verifier pin: ' + rows.length + ' verifiers pinned\n' + summary + '\n  lock   ' + lockPath + ' @ ' + nextDigest.slice(0, 12) + '\n  anchor ' + anchorPath + '\n');