#!/usr/bin/env node
'use strict';
const fs = require('fs');
const crypto = require('crypto');
function fail(reason) { process.stdout.write(JSON.stringify({ ok: false, reason: String(reason) })); process.exit(3); }
function readStdin() { return new Promise(function (resolve, reject) { let data = ''; process.stdin.on('data', function (chunk) { data += chunk; }); process.stdin.on('end', function () { resolve(data); }); process.stdin.on('error', reject); }); }
async function main() {
  let payload;
  try { payload = JSON.parse(await readStdin()); } catch (error) { fail('invalid bridge payload: ' + error.message); }
  const statement = typeof payload.statement === 'string' ? payload.statement : '';
  const server = payload.server && typeof payload.server === 'object' ? payload.server : {};
  if (!statement) fail('statement is required');
  if (server.readonly !== true) fail('server descriptor is not declared readonly');
  let spec;
  try { spec = JSON.parse(statement); } catch (error) { fail('statement is not a JSON spec: ' + error.message); }
  if (!spec || spec.kind !== 'verification-gap') fail('spec.kind must be verification-gap');
  if (!spec.transcript || !fs.existsSync(spec.transcript)) fail('spec.transcript not found: ' + spec.transcript);
  const bytes = fs.readFileSync(spec.transcript);
  const transcriptSha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!spec.transcript_sha256 || spec.transcript_sha256 !== transcriptSha) fail('transcript digest mismatch');
  const lines = bytes.toString('utf8').split(/\r?\n/);
  const boundary = Number.isFinite(Number(spec.boundary_line)) ? Number(spec.boundary_line) : 0;
  const window = Number.isFinite(Number(spec.window)) ? Number(spec.window) : 10;
  const start = Math.max(0, boundary + 1);
  const end = Math.min(lines.length, start + Math.max(0, window));
  let checkPattern;
  try { checkPattern = new RegExp(spec.check_pattern || 'pytest|npm test|node tests|verify|sha256|git status'); } catch (error) { fail('invalid spec.check_pattern: ' + error.message); }
  let independentCheckCount = 0;
  for (let index = start; index < end; index += 1) if (checkPattern.test(lines[index])) independentCheckCount += 1;
  const gapCount = independentCheckCount > 0 ? 0 : 1;
  const observed = {
    transcript: spec.transcript,
    transcript_sha256: transcriptSha,
    boundary_line: boundary,
    window_start: start,
    window_end: end,
    independent_check_count: independentCheckCount,
    verification_gap_count: gapCount,
    complete: gapCount === 0
  };
  process.stdout.write(JSON.stringify({ ok: true, observed: observed }));
}
main().catch(function (error) { fail(error.message); });