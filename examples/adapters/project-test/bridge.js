#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
function fail(reason) { process.stdout.write(JSON.stringify({ ok: false, reason: String(reason) })); process.exit(3); }
function readStdin() { return new Promise(function (resolve, reject) { let data = ''; process.stdin.on('data', function (chunk) { data += chunk; }); process.stdin.on('end', function () { resolve(data); }); process.stdin.on('error', reject); }); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function argv(command) { return String(command).match(/"[^"]*"|'[^']*'|\S+/g).map(function (part) { return part.replace(/^['"]|['"]$/g, ''); }); }
async function main() {
  let payload;
  try { payload = JSON.parse(await readStdin()); } catch (error) { fail('invalid bridge payload: ' + error.message); }
  const statement = typeof payload.statement === 'string' ? payload.statement : '';
  const server = payload.server && typeof payload.server === 'object' ? payload.server : {};
  if (!statement) fail('statement is required');
  if (server.readonly !== true) fail('server descriptor is not declared readonly');
  let spec; try { spec = JSON.parse(statement); } catch (error) { fail('statement is not a JSON spec: ' + error.message); }
  if (!spec || spec.kind !== 'project-test-result') fail('spec.kind must be project-test-result');
  const command = String(spec.command || '');
  if (!/^(pytest|npm test|node(?:\.exe)?\s+tests[\\/]\S+|tsc|npm run build)(?:\s|$)/i.test(command)) fail('command is not in the project-test allowlist');
  if (/[;&|<>`$]/.test(command)) fail('command contains shell metacharacters');
  const repo = process.cwd();
  const cwd = path.resolve(repo, spec.cwd || '.');
  if (cwd !== repo && !cwd.startsWith(repo + path.sep)) fail('cwd escapes repository root');
  const timeout = Number.isFinite(Number(spec.timeout_ms)) ? Number(spec.timeout_ms) : 60000;
  const started = Date.now();
  const parts = argv(command);
  const result = spawnSync(parts[0], parts.slice(1), { cwd: cwd, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, timeout: timeout, windowsHide: true, shell: false });
  const stdout = result.stdout || Buffer.alloc(0), stderr = result.stderr || Buffer.alloc(0);
  const exitCode = result.status === null ? 124 : result.status;
  const observed = { kind: 'project-test-result', command: command, cwd: cwd, exit_code: exitCode, passed: exitCode === 0, stdout_sha256: hash(stdout), stderr_sha256: hash(stderr) };
  process.stdout.write(JSON.stringify({ ok: true, observed: observed }));
}
main().catch(function (error) { fail(error.message); });