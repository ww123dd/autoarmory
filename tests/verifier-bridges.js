'use strict';

// Engine test for the verifier expansion route.
//
// The claim under test: a new fact source costs a thin bridge, not another adapter.
// Each committed bridge must stay small, must accept a JSON payload on stdin, must
// emit { ok, observed }, and must fail closed (ok:false + reason) instead of crashing
// when the payload is empty or malformed.
//
// The only exception is the pinned MCP transport bridge, which speaks the MCP stdio
// protocol on behalf of a registered server.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ADAPTERS = path.join(ROOT, 'examples', 'adapters');
const HEAVY_ALLOWED = new Set(['doris-readonly']);
const MIN_SOURCES = 8;
const MAX_BRIDGE_LINES = 60;

function must(condition, message) { if (!condition) throw new Error(message); }

const dirs = fs.readdirSync(ADAPTERS).filter(function (name) {
  return fs.statSync(path.join(ADAPTERS, name)).isDirectory();
}).sort();

must(dirs.length >= MIN_SOURCES, 'expected at least ' + MIN_SOURCES + ' heterogeneous fact sources, found ' + dirs.length);

const rows = [];
for (const dir of dirs) {
  const bridge = path.join(ADAPTERS, dir, 'bridge.js');
  must(fs.existsSync(bridge), dir + ': bridge.js is missing');
  const source = fs.readFileSync(bridge, 'utf8');
  const lines = source.split(/\r?\n/).filter(function (line) { return line.trim() !== ''; }).length;
  if (!HEAVY_ALLOWED.has(dir)) {
    must(lines <= MAX_BRIDGE_LINES, dir + ': bridge is ' + lines + ' lines; a fact source must stay a thin bridge (<= ' + MAX_BRIDGE_LINES + ')');
  }
  must(/readFileSync\(0|process\.stdin/.test(source), dir + ': bridge must read its payload from stdin');
  const empty = spawnSync(process.execPath, [bridge, '--json'], { input: '', encoding: 'utf8', timeout: 60000, windowsHide: true });
  must(!empty.error, dir + ': bridge failed to start: ' + (empty.error && empty.error.message));
  must(empty.status === 0 || empty.status === 3, dir + ': bridge exited ' + empty.status + ' on empty input; it must fail closed with ok:false instead of crashing');
  let parsed = null;
  try { parsed = JSON.parse(String(empty.stdout || '').trim()); } catch (error) { must(false, dir + ': bridge emitted no JSON on empty input: ' + String(empty.stdout || '').slice(0, 120)); }
  must(parsed && typeof parsed.ok === 'boolean', dir + ': bridge must emit { ok: boolean }');
  if (parsed.ok === true) must(parsed.observed && typeof parsed.observed === 'object', dir + ': ok:true evidence must carry an observed object');
  else must(typeof parsed.reason === 'string' && parsed.reason.length > 0, dir + ': ok:false must explain why it declined');
  rows.push(dir + ' bridge_lines=' + lines + ' empty_input=' + (parsed.ok ? 'observed' : 'declined'));
}

// A local profile is optional, but when it exists it must be exactly pinned: the
// re-pin tool's dry run has to reproduce the digest of the lock file on disk, and
// the external anchor has to carry that same digest.
const lockPath = path.join(ROOT, 'verifiers.lock.json');
let profile = 'absent (core stays profile-free)';
if (fs.existsSync(lockPath)) {
  const pin = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verifier-pin.js'), '--dry-run'], { cwd: ROOT, encoding: 'utf8', timeout: 60000, windowsHide: true });
  must(pin.status === 0, 'verifier pin dry run failed: ' + String(pin.stderr || pin.stdout || '').slice(0, 300));
  const match = String(pin.stdout || '').match(/next lock digest ([a-f0-9]{64})/);
  must(match, 'verifier pin dry run did not report a lock digest');
  const onDisk = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
  must(match[1] === onDisk, 'local profile is not fully pinned: dry-run digest ' + match[1].slice(0, 12) + ' != lock ' + onDisk.slice(0, 12) + '; run node scripts/verifier-pin.js');
  const anchor = path.join(os.homedir(), '.codex', 'hooks', 'verifier-lock.sha256');
  must(fs.existsSync(anchor), 'external verifier-lock anchor is missing: ' + anchor + '; run node scripts/verifier-pin.js');
  const anchored = fs.readFileSync(anchor, 'utf8').trim().toLowerCase();
  must(anchored === onDisk, 'external verifier-lock anchor drifted: ' + anchored.slice(0, 12) + ' != lock ' + onDisk.slice(0, 12));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  profile = lock.verifiers.length + ' verifiers pinned and anchored';
}

console.log('verifier bridge tests passed: ' + dirs.length + ' heterogeneous fact sources, local profile ' + profile + '\n' + rows.join('\n'));