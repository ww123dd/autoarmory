'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const shadow = require('../src/lib/session-shadow');
function must(condition, message) { if (!condition) throw new Error(message); }
const assistant = {
  type: 'assistant', uuid: 'a1', timestamp: '2026-01-01T00:00:00Z', cwd: '/tmp/work', sessionId: 's1',
  message: { role: 'assistant', content: [
    { type: 'text', text: 'working' },
    { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'a.js' } },
    { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'pytest -q' } }
  ] }
};
const user = {
  type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:01Z', cwd: '/tmp/work', sessionId: 's1',
  message: { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
    { type: 'tool_result', tool_use_id: 't2', content: 'FAILED', is_error: true },
    { type: 'text', text: '继续' }
  ] }
};
const events = shadow.normalizeRows(assistant).concat(shadow.normalizeRows(user));
must(events.filter(function (e) { return e.type === 'tool_call'; }).length === 2, 'Claude assistant row must split into multiple tool_use events');
must(events.filter(function (e) { return e.type === 'tool_output'; }).length === 2, 'Claude user row must split into multiple tool_result events');
const audit = shadow.normalizationAudit({ tool_use: 2, tool_result: 2 }, events);
must(audit.ok && audit.normalized.tool_call === 2 && audit.normalized.tool_output === 2, 'Claude raw/normalized accounting must pass');
const empty = shadow.normalizationAudit({ tool_use: 1, tool_result: 0 }, []);
must(!empty.ok && empty.errors.indexOf('SESSION_SHADOW_EMPTY') !== -1, 'zero normalization must fail closed as SESSION_SHADOW_EMPTY');
const partial = shadow.normalizationAudit({ tool_use: 2, tool_result: 2 }, [{ type: 'tool_call' }]);
must(!partial.ok && partial.errors.indexOf('SESSION_SHADOW_PARTIAL') !== -1, 'partial normalization must fail closed as SESSION_SHADOW_PARTIAL');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-claude-shadow-'));
const file = path.join(temp, 'session.jsonl');
fs.writeFileSync(file, [assistant, user].map(function (row) { return JSON.stringify(row); }).join('\n') + '\n', 'utf8');
const script = path.resolve(__dirname, '..', 'scripts', 'session-shadow.js');
const result = spawnSync(process.execPath, [script, '--mode', 'articles', '--session', file, '--out', path.join(temp, 'out'), '--json'], { encoding: 'utf8' });
const cliReport = JSON.parse(result.stdout);
must(result.status === 0 && cliReport.reports[0].counts.tool_calls === 2, 'Claude session shadow must run with real normalized counts');
const brokenFile = path.join(temp, 'broken-format.jsonl');
fs.writeFileSync(brokenFile, JSON.stringify({ type: 'system', message: { content: [{ type: 'tool_use', id: 'broken', name: 'Bash' }] } }) + '\n', 'utf8');
const broken = spawnSync(process.execPath, [script, '--mode', 'articles', '--session', brokenFile, '--out', path.join(temp, 'broken-out'), '--json'], { encoding: 'utf8' });
must(broken.status === 2 && /SESSION_SHADOW_EMPTY/.test(broken.stderr), 'unsupported raw tool format must exit 2 with SESSION_SHADOW_EMPTY');
console.log('session shadow Claude tests passed: multi-block split, tool_use/result linkage, raw=2 normalized=2, empty/partial fail closed');