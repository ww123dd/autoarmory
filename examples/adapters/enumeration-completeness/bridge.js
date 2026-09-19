#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
function fail(reason) { process.stdout.write(JSON.stringify({ ok: false, reason: String(reason) })); process.exit(3); }
function readStdin() { return new Promise(function (resolve, reject) { let data = ''; process.stdin.on('data', function (chunk) { data += chunk; }); process.stdin.on('end', function () { resolve(data); }); process.stdin.on('error', reject); }); }
function walk(root, pattern, maxFiles, state) {
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return; }
  for (const entry of entries) {
    if (state.files >= maxFiles) { state.truncated = true; return; }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walk(full, pattern, maxFiles, state);
    else if (entry.isFile()) {
      state.files += 1;
      const rel = path.relative(state.root, full).replace(/\\/g, '/');
      if (pattern.test(rel)) state.candidates.add(rel);
    }
  }
}
async function main() {
  let payload;
  try { payload = JSON.parse(await readStdin()); } catch (error) { fail('invalid bridge payload: ' + error.message); }
  const statement = typeof payload.statement === 'string' ? payload.statement : '';
  const server = payload.server && typeof payload.server === 'object' ? payload.server : {};
  if (!statement) fail('statement is required');
  if (server.readonly !== true) fail('server descriptor is not declared readonly');
  let spec;
  try { spec = JSON.parse(statement); } catch (error) { fail('statement is not a JSON spec: ' + error.message); }
  if (!spec || spec.kind !== 'enumeration-completeness') fail('spec.kind must be enumeration-completeness');
  const repo = process.env.AUTOARMORY_REPO || process.cwd();
  const root = path.resolve(path.isAbsolute(spec.root) ? spec.root : path.join(repo, spec.root || ''));
  if (!spec.root || !fs.existsSync(root)) fail('spec.root not found: ' + root);
  let pattern;
  try { pattern = new RegExp(spec.pattern || '.'); } catch (error) { fail('invalid spec.pattern: ' + error.message); }
  const maxFiles = Number.isFinite(Number(spec.max_files)) ? Number(spec.max_files) : 200000;
  const state = { root: root, files: 0, candidates: new Set(), truncated: false };
  walk(root, pattern, maxFiles, state);
  let missing = [];
  if (spec.manifest) {
    const manifestPath = path.resolve(path.isAbsolute(spec.manifest) ? spec.manifest : path.join(repo, spec.manifest));
    const expected = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).map(function (line) { return line.trim().replace(/\\/g, '/'); }).filter(Boolean);
    missing = expected.filter(function (item) { return !state.candidates.has(item); });
  } else if (Number.isFinite(Number(spec.expected_count))) {
    const expectedCount = Number(spec.expected_count);
    if (state.candidates.size < expectedCount) missing = ['count:' + state.candidates.size + '<' + expectedCount];
  }
  const observed = {
    files_scanned: state.files,
    candidate_count: state.candidates.size,
    missing_count: missing.length,
    truncated: state.truncated,
    complete: missing.length === 0 && state.truncated === false
  };
  process.stdout.write(JSON.stringify({ ok: true, observed: observed }));
}
main().catch(function (error) { fail(error.message); });