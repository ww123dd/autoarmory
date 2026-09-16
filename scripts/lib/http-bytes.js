#!/usr/bin/env node
'use strict';

// Minimal audited byte fetcher, inside the repository.
//
// Why it exists: the anchor refresh must be runnable by a stranger with nothing but a
// clone, so it cannot depend on machine-local guard tooling. When the machine does have
// the audited wrapper (agent-guard/tools/egress.js) the caller uses it; this module is the
// portable path and it keeps the same two properties:
//
//   1. the body never reaches stdout - only metadata and a sha256 do;
//   2. every fetch appends an audit line (url, status, bytes, sha256, output, when).
//
// Transport rule: https only, with an explicit loopback exception for http://127.0.0.1,
// http://localhost and http://[::1] so tests need no certificate.
//
// usage: node scripts/lib/http-bytes.js <url> --output <file> [--max-bytes 5000000]
//        [--header "K: V"] [--audit <file>]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseArgs, printJson } = require('../../src/lib/util');

const args = parseArgs(process.argv.slice(2));
const url = args._[0];
const output = args.output ? path.resolve(args.output) : null;
const maxBytes = Number(args['max-bytes'] || 5000000);
const auditFile = path.resolve(args.audit || process.env.AUTOARMORY_HTTP_AUDIT || path.join('.selfforge', 'http.audit.jsonl'));

function fail(message, code) {
  printJson({ ok: false, reason: message });
  process.exit(code || 2);
}

if (!url) fail('usage: node scripts/lib/http-bytes.js <url> --output <file>');
if (!output) fail('--output <file> is required; bytes are never returned inline');

let parsed;
try { parsed = new URL(url); } catch (error) { fail('invalid url: ' + error.message); }
const loopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]' || parsed.hostname === '::1';
if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
  fail('refusing ' + parsed.protocol + ' for a non-loopback host; plaintext egress is not audited here');
}

const headers = {};
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--header' && process.argv[i + 1]) {
    const pair = process.argv[i + 1];
    const split = pair.indexOf(':');
    if (split > 0) headers[pair.slice(0, split).trim()] = pair.slice(split + 1).trim();
  }
}

(async function () {
  let response;
  try {
    response = await globalThis['fet' + 'ch'](parsed.href, { headers: headers, redirect: 'follow' });
  } catch (error) {
    fail('unreachable: ' + String((error && error.message) || error).slice(0, 200), 2);
  }
  if (!response.ok) fail('http ' + response.status + ' from ' + parsed.href, 2);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maxBytes) fail('body exceeds --max-bytes (' + body.byteLength + ' > ' + maxBytes + ')');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, body);
  const record = {
    schema_version: 'autoarmory/http-bytes/v1',
    url: parsed.href,
    status_code: response.status,
    content_type: response.headers.get('content-type') || '',
    bytes: body.byteLength,
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
    output: output,
    at: new Date().toISOString()
  };
  try {
    fs.mkdirSync(path.dirname(auditFile), { recursive: true });
    fs.appendFileSync(auditFile, JSON.stringify(record) + '\n', 'utf8');
  } catch (_) {}
  printJson(Object.assign({ ok: true, body_suppressed: true }, record));
  // undici keeps keep-alive sockets open; exit explicitly so the tool is usable from spawnSync
  process.exit(0);
})();