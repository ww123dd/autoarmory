#!/usr/bin/env node
'use strict';

// Pinned bridge to local, read-only observability facts.
//
// Same contract as examples/adapters/doris-readonly/bridge.js, but the source of
// truth is the local filesystem instead of an MCP server. It is itself pinned by
// SHA-256 in verifiers.lock.json; it does not accept a caller-provided executable
// or shell command, and it never writes.
//
// stdin : { statement, statement_sha256, server }
// stdout: { ok: true, observed } | { ok: false, reason }   (exit 3 on failure)

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function fail(reason) {
  process.stdout.write(JSON.stringify({ ok: false, reason: String(reason) }));
  process.exit(3);
}
function expandHome(value) {
  if (typeof value !== 'string' || !value) return value;
  if (value === '~') return os.homedir();
  if (value.indexOf('~/') === 0 || value.indexOf('~\\') === 0) return path.join(os.homedir(), value.slice(2));
  return value;
}
function sha256Text(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function readStdin() {
  return new Promise(function (resolve, reject) {
    let data = '';
    process.stdin.on('data', function (chunk) { data += chunk; });
    process.stdin.on('end', function () { resolve(data); });
    process.stdin.on('error', reject);
  });
}

// Kinds this bridge knows how to observe. Anything else is refused, not guessed.
const KINDS = {
  // Count host-side Skill invocations recorded in agent session transcripts.
  'skill-invocation-count': function (spec, server) {
    const root = path.resolve(expandHome(server.root || spec.root || ''));
    if (!root || !fs.existsSync(root)) return { reason: 'transcript root not found: ' + root };
    const target = spec.skill;
    if (typeof target !== 'string' || !target) return { reason: 'spec.skill is required' };

    const files = [];
    (function walk(dir) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
      }
    })(root);

    let count = 0;
    let sessions = 0;
    for (const file of files) {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
      let hit = false;
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let row;
        try { row = JSON.parse(line); } catch (_) { continue; }
        const content = row && row.message && row.message.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (!block || block.type !== 'tool_use' || block.name !== 'Skill') continue;
          if (block.input && block.input.skill === target) { count += 1; hit = true; }
        }
      }
      if (hit) sessions += 1;
    }
    return { observed: { skill: target, count: count, sessions: sessions, files_scanned: files.length, root: root } };
  }
};

async function main() {
  let payload;
  try { payload = JSON.parse(await readStdin()); } catch (error) { fail('invalid bridge payload: ' + error.message); }

  const statement = typeof payload.statement === 'string' ? payload.statement : '';
  const server = payload.server && typeof payload.server === 'object' ? payload.server : {};
  if (!statement) fail('statement is required');
  if (payload.statement_sha256 && payload.statement_sha256 !== sha256Text(statement)) fail('statement hash mismatch');
  if (server.readonly !== true) fail('server descriptor is not declared readonly');

  let spec;
  try { spec = JSON.parse(statement); } catch (error) { fail('statement is not a JSON spec: ' + error.message); }
  if (!spec || typeof spec.kind !== 'string') fail('spec.kind is required');

  const observer = KINDS[spec.kind];
  if (!observer) fail('unsupported spec.kind: ' + spec.kind);

  const result = observer(spec, server);
  if (!result || result.reason) fail((result && result.reason) || 'observation produced no result');

  process.stdout.write(JSON.stringify({ ok: true, observed: result.observed }));
  process.exit(0);
}

main().catch(function (error) { fail(error.message); });
