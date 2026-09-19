'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonlStrict, writeJsonl } = require('./util');
const sessionShadow = require('./session-shadow');

function parseText(text) {
  const value = String(text || '');
  if (!value.trim()) return null;
  const exit = value.match(/(?:exit_code\s*[:=]\s*|exit code\s*[:=]?\s*|exited with code\s*)(-?\d+)/i);
  if (exit) return { exit_code: Number(exit[1]), result: Number(exit[1]) === 0 ? 'pass' : 'fail', result_parse_source: 'exit_code_regex', stdout_sha256: null, stderr_sha256: null };
  if (/npm ERR!/i.test(value)) return { exit_code: null, result: 'fail', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  const passed = value.match(/(\d+)\s+passed/i);
  const failed = value.match(/(\d+)\s+failed/i);
  if (passed || failed) {
    const failedCount = failed ? Number(failed[1]) : 0;
    return { exit_code: failedCount === 0 ? 0 : 1, result: failedCount === 0 ? 'pass' : 'fail', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  }
  if (/\bPASS\b/.test(value)) return { exit_code: 0, result: 'pass', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  if (/\bFAIL\b/.test(value)) return { exit_code: 1, result: 'fail', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  if (/^\s*ok\s*$/im.test(value)) return { exit_code: 0, result: 'pass', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  return null;
}
function fromExecRecords(stateDir) {
  const file = path.join(stateDir, 'exec-records.jsonl');
  if (!fs.existsSync(file)) return [];
  return readJsonlStrict(file).map(function (record) {
    return { schema_version: 'autoarmory/structured-result/v1', source_ref: record.id, exit_code: record.exit_code, result: record.outcome === 'success' ? 'pass' : (record.outcome === 'failure' ? 'fail' : 'unknown'), result_parse_source: 'exec_record', stdout_sha256: record.output && record.output.stdout_sha256 || null, stderr_sha256: record.output && record.output.stderr_sha256 || null };
  });
}
function fromTranscript(file) {
  if (!fs.existsSync(file)) return [];
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
  const events = [];
  for (const row of rows) events.push.apply(events, sessionShadow.normalizeRows(row));
  const out = [];
  for (const event of events) {
    if (event.type !== 'tool_output') continue;
    const parsed = parseText(event.content || event.text || event.output || '');
    if (parsed) out.push(Object.assign({ schema_version: 'autoarmory/structured-result/v1', source_ref: event.tool_use_id || event.id || null }, parsed));
  }
  return out;
}
function extract(stateDir, options) {
  const opts = options || {};
  const rows = fromExecRecords(stateDir);
  for (const session of opts.sessions || []) for (const row of fromTranscript(session)) rows.push(row);
  if (opts.apply === true) writeJsonl(path.join(stateDir, 'structured-results.jsonl'), rows);
  const bySource = {};
  for (const row of rows) bySource[row.result_parse_source] = (bySource[row.result_parse_source] || 0) + 1;
  return { schema_version: 'autoarmory/result-extraction/v1', generated_at: new Date().toISOString(), count: rows.length, by_source: bySource, rows: rows };
}
module.exports = { parseText, fromExecRecords, fromTranscript, extract };