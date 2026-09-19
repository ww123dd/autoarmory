'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeProjection, readJsonlDedup } = require('../src/lib/util');
function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-storage-'));
const projection = path.join(root, 'drafts.jsonl');
writeProjection(projection, [{ id: 'a' }, { id: 'b' }], { retain: 2 });
const firstSnapshotCount = fs.readdirSync(projection + '.snapshots').length;
writeProjection(projection, [{ id: 'a' }, { id: 'b' }], { retain: 2 });
must(fs.readdirSync(projection + '.snapshots').length === firstSnapshotCount, 'same projection content must reuse its snapshot');
must(!fs.existsSync(projection + '.bak'), 'projection must not create a large .bak');
const duplicateFile = path.join(root, 'dupes.jsonl');
fs.writeFileSync(duplicateFile, '{"id":"x"}\n{"id":"x"}\n{"id":"y"}\n', 'utf8');
must(readJsonlDedup(duplicateFile, function (row) { return row.id; }).length === 2, 'read-time dedupe must collapse duplicate ids');
const session = path.join(root, 'session.jsonl');
fs.writeFileSync(session, [
  JSON.stringify({ type: 'assistant', uuid: 'a1', timestamp: '2026-01-01T00:00:00Z', cwd: root, sessionId: 's1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'node tests/run.js' } }] } }),
  JSON.stringify({ type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:01Z', cwd: root, sessionId: 's1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } })
].join('\n') + '\n', 'utf8');
const engine = path.join(root, 'engine');
const script = path.resolve(__dirname, '..', 'scripts', 'change-inspect.js');
let result = spawnSync(process.execPath, [script, '--session', session, '--state', engine, '--json'], { encoding: 'utf8' });
must(result.status === 0, 'first inspect must succeed: ' + result.stderr);
const canonical = path.join(engine, 'change-records.jsonl');
const firstLines = fs.readFileSync(canonical, 'utf8').trim().split(/\r?\n/).length;
result = spawnSync(process.execPath, [script, '--session', session, '--state', engine, '--json'], { encoding: 'utf8' });
must(result.status === 0, 'second inspect must succeed: ' + result.stderr);
must(fs.readFileSync(canonical, 'utf8').trim().split(/\r?\n/).length === firstLines, 'session offset must prevent duplicate canonical rows');
must(!fs.existsSync(canonical + '.bak'), 'canonical append must not create a large .bak');
const globalState = JSON.parse(fs.readFileSync(path.join(engine, 'state.json'), 'utf8'));
must(!globalState.seen_ids && !globalState.signatures, 'global state must not hold per-session dedupe maps');
const sessionEntry = globalState.sessions[session];
must(sessionEntry && sessionEntry.state_file && fs.existsSync(path.join(engine, sessionEntry.state_file)), 'per-session state must be written separately');
console.log('storage amplification tests passed: append-only canonical, snapshot pointer, read-time dedupe, per-session state');