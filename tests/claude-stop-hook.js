'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-claude-stop-'));
const state = path.join(root, 'state');
const transcript = path.join(root, 'claude-session.jsonl');
const rows = [
  { type: 'assistant', uuid: 'a1', timestamp: '2026-01-01T00:00:00Z', cwd: root, sessionId: 's1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'node tests/run.js' } }] } },
  { type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:01Z', cwd: root, sessionId: 's1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }
];
fs.writeFileSync(transcript, rows.map(function (row) { return JSON.stringify(row); }).join('\n') + '\n', 'utf8');
const script = path.resolve(__dirname, '..', 'scripts', 'stop-shadow.js');
const event = { hook_event_name: 'Stop', session_id: 's1', transcript_path: transcript, cwd: root, stop_hook_active: false };
const result = spawnSync(process.execPath, [script], { input: JSON.stringify(event), encoding: 'utf8', env: Object.assign({}, process.env, { AUTOARMORY_STOP_STATE: state, AUTOARMORY_RUNNER_OFF: '1' }), windowsHide: true });
must(result.status === 0, 'Claude Stop hook must exit 0: ' + result.stderr);
const last = JSON.parse(fs.readFileSync(path.join(state, 'last-stop.json'), 'utf8'));
must(last.status === 'ran', 'Claude Stop hook must record status=ran, got ' + last.status);
const recordsFile = path.join(state, 'change-inspector', 'change-records.jsonl');
must(fs.existsSync(recordsFile), 'Claude Stop hook must write normalized change records');
const records = fs.readFileSync(recordsFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
must(records.length >= 1 && records.some(function (row) { return row.detail && row.detail.command === 'node tests/run.js'; }), 'Claude Stop hook must normalize the tool call, got ' + JSON.stringify(records));
console.log('claude stop hook tests passed: Claude Stop -> stop-shadow -> normalized change record');