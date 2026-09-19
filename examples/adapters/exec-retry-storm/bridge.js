#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
function fail(reason) { process.stdout.write(JSON.stringify({ ok: false, reason: String(reason) })); process.exit(3); }
function readStdin() { return new Promise(function (resolve, reject) { let data = ''; process.stdin.on('data', function (chunk) { data += chunk; }); process.stdin.on('end', function () { resolve(data); }); process.stdin.on('error', reject); }); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalized(text) { return String(text || '').toLowerCase().replace(/[0-9a-f]{8,}/g, '<id>').replace(/\d+/g, '<n>').replace(/\s+/g, ' ').trim().slice(0, 300); }
function signatureOf(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.signature || item.signature_hash) return { signature: item.signature || item.signature_hash, observed: item.observed || item.signature_text || item.signature || item.signature_hash };
  const n = normalized(item.text || item.output || '');
  if (!/(error|exception|failed|failure|not found|traceback|fatal|exit code [1-9])/i.test(n)) return null;
  return { signature: sha256(n).slice(0, 16), observed: n };
}
async function main() {
  let payload;
  try { payload = JSON.parse(await readStdin()); } catch (error) { fail('invalid bridge payload: ' + error.message); }
  const statement = typeof payload.statement === 'string' ? payload.statement : '';
  const server = payload.server && typeof payload.server === 'object' ? payload.server : {};
  if (!statement) fail('statement is required');
  if (payload.statement_sha256 && payload.statement_sha256 !== sha256(statement)) fail('statement hash mismatch');
  if (server.readonly !== true) fail('server descriptor is not declared readonly');
  let spec;
  try { spec = JSON.parse(statement); } catch (error) { fail('statement is not a JSON spec: ' + error.message); }
  if (!spec || spec.kind !== 'exec-retry-storm') fail('spec.kind must be exec-retry-storm');
  const file = spec.sequence_file ? path.resolve(spec.sequence_file) : null;
  if (!file || !fs.existsSync(file)) fail('spec.sequence_file not found: ' + String(file));
  const bytes = fs.readFileSync(file);
  const digest = sha256(bytes);
  if (!spec.sequence_sha256 || spec.sequence_sha256 !== digest) fail('sequence digest mismatch');
  const threshold = Math.max(1, Number(spec.threshold || 3));
  let last = null;
  let run = 0;
  let max = 0;
  let maxSignature = null;
  let maxObserved = null;
  let firstStopIndex = null;
  const lines = bytes.toString('utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    let item;
    try { item = JSON.parse(line); } catch (error) { fail('invalid sequence line ' + (index + 1) + ': ' + error.message); }
    const found = signatureOf(item);
    if (!found) continue;
    if (found.signature === last) run += 1;
    else { last = found.signature; run = 1; }
    if (run > max) { max = run; maxSignature = found.signature; maxObserved = found.observed; }
    if (firstStopIndex === null && run >= threshold) firstStopIndex = index;
  }
  process.stdout.write(JSON.stringify({ ok: true, observed: { should_have_stopped: firstStopIndex !== null, occurrences: max, first_stop_index: firstStopIndex, signature: maxSignature, observed: maxObserved, sequence_sha256: digest, threshold: threshold } }));
  process.exit(0);
}
main().catch(function (error) { fail(error.message); });
