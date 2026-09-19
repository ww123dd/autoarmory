#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, readJson, writeJson, writeJsonl, appendJsonl, pruneBackups } = require('../src/lib/util');
const stateLock = require('../src/lib/state-lock');
const shadow = require('../src/lib/session-shadow');
const inspector = require('../src/lib/change-inspector');
const sessionState = require('../src/lib/session-state');

function loadState(file) { return fs.existsSync(file) ? readJson(file) : { schema_version: 'autoarmory/change-inspector-state/v1', sessions: {} }; }
function readIncrement(file, cursor) {
  const size = fs.statSync(file).size;
  const start = cursor && cursor.offset && cursor.offset <= size ? cursor.offset : 0;
  const text = fs.readFileSync(file, 'utf8').slice(start);
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  const events = [];
  const raw = { tool_use: 0, tool_result: 0 };
  for (const line of lines) { if (!line.trim()) continue; let row; try { row = JSON.parse(line); } catch (_) { continue; } const rawCounts = shadow.countRawTools(row); raw.tool_use += rawCounts.tool_use; raw.tool_result += rawCounts.tool_result; const normalized = shadow.normalizeRows(row); if (normalized.length) events.push.apply(events, normalized); }
  return { events: events, raw: raw, audit: shadow.normalizationAudit(raw, events), offset: size };
}
function verifierIds(profile) { if (!profile || !fs.existsSync(profile)) return []; try { return (readJson(profile).verifiers || []).map(function (x) { return x.id; }); } catch (_) { return []; } }
function scan(sessions, state, options) {
  const all = [];
  const events = [];
  for (const session of sessions) {
    const cursor = state.sessions[session] || { offset: 0 };
    const memory = sessionState.load(options.stateDir, session, cursor.offset);
    const inc = readIncrement(session, memory);
    if (!inc.audit.ok) throw new Error('SESSION_SHADOW_FAIL_CLOSED ' + JSON.stringify(inc.audit));
    if (!inc.events.length) { state.sessions[session] = sessionState.save(options.stateDir, session, Object.assign(memory, { offset: inc.offset })); continue; }
    const currentSessionState = { session_id: path.basename(session), seen_ids: memory.seen_ids || {}, signatures: memory.signatures || {}, high_signal_crossed: memory.high_signal_crossed || {}, line: 0 };
    const report = inspector.inspect(inc.events, currentSessionState, { verifier_ids: options.verifier_ids || [], execRecords: options.exec_records || [] });
    state.sessions[session] = sessionState.save(options.stateDir, session, { offset: inc.offset, seen_ids: currentSessionState.seen_ids, signatures: currentSessionState.signatures, high_signal_crossed: currentSessionState.high_signal_crossed });
    all.push.apply(all, report.records);
    events.push.apply(events, inc.events);
  }
  return { records: all, events: events };
}
const args = parseArgs(process.argv.slice(2));
const sessionArgs = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i] === '--session' && argv[i + 1]) sessionArgs.push(path.resolve(argv[++i]));
if (!sessionArgs.length) { const emptyMetrics = { change_record_count: 0, file_changed_count: 0, command_called_count: 0, check_seen_count: 0, check_gap_count: 0, command_result_passed_count: 0, command_result_failed_count: 0, result_text_unstructured_count: 0, repeat_signature_count: 0, risk_signal_count: 0, exec_record_gap_count: 0, candidate_case_draft_count: 0, suppressed_count: 0, high_signal_notification_count: 0, correctly_reported_unverifiable_count: 0, transcript_field_fabrication_count: 0, close_without_verifier_count: 0, false_close_count: null, false_close_status: 'lagging_indicator_requires_future_counterexample' }; if (args.json) printJson({ schema_version: 'autoarmory/change-inspector-run/v1', sessions: 0, records: 0, metrics: emptyMetrics }); else process.stdout.write('change inspector: no source sessions; empty inventory\n'); process.exit(0); }
const stateDir = path.resolve(args.state || '.change-inspector');
fs.mkdirSync(stateDir, { recursive: true });
const stateFile = path.join(stateDir, 'state.json');
const runOnce = function () {
  const state = loadState(stateFile);
  const scanned = scan(sessionArgs, state, { stateDir: stateDir, verifier_ids: verifierIds(args['verifier-profile'] ? path.resolve(args['verifier-profile']) : path.resolve('verifiers.lock.json')), exec_records: [] });
  const records = scanned.records;
  writeJsonl(path.join(stateDir, 'new-events.jsonl'), scanned.events);
  if (records.length) {
    const inventoryFile = path.join(stateDir, 'change-inventory.jsonl');
    const canonicalFile = path.join(stateDir, 'change-records.jsonl');
    appendJsonl(canonicalFile, records);
    appendJsonl(inventoryFile, records);
  }
  const ids = verifierIds(args['verifier-profile'] ? path.resolve(args['verifier-profile']) : path.resolve('verifiers.lock.json'));
  const drafts = records.length ? inspector.candidateCases(records, { verifier_ids: ids }) : [];
  writeJsonl(path.join(stateDir, 'new-drafts.jsonl'), drafts);
  if (drafts.length) {
    const candidateFile = path.join(stateDir, 'candidate-cases.jsonl');
    appendJsonl(candidateFile, drafts);
  }
  const notifications = drafts.filter(function (d) { return d.high_signal === true; });
  if (notifications.length) {
    const notificationFile = path.join(stateDir, 'notifications.jsonl');
    appendJsonl(notificationFile, notifications);
  }
  const changes = inspector.buildChanges(records);
  const metrics = inspector.summarize(records, drafts);
  const gaps = changes.filter(function (c) { return c.check_status === 'check_gap'; });
  metrics.check_gap_path_computable = gaps.length === 0 || gaps.every(function (c) { return c.changed_files.every(function (f) { return !!f.path; }); });
  metrics.change_inventory_idempotent = new Set(records.map(function (r) { return r.id; })).size === records.length;
  metrics.manual_scan_trigger_count = 0;
  metrics.edit_write_blocked_count = 0;
  metrics.append_row_count = records.length;
  metrics.bytes_written_per_stop = Buffer.byteLength(records.map(function (row) { return JSON.stringify(row); }).join('\\n')) + Buffer.byteLength(drafts.map(function (row) { return JSON.stringify(row); }).join('\\n'));
  metrics.full_rewrite_count = 0;
  metrics.large_file_backup_count = 0;
  writeJsonl(path.join(stateDir, 'changes.jsonl'), changes, { backup: false });
  writeJson(path.join(stateDir, 'check-gap-report.json'), { schema_version: 'autoarmory/check-gap-report/v1', check_gap_path_computable: metrics.check_gap_path_computable, check_gap_count: gaps.length, changes: gaps });
  writeJson(path.join(stateDir, 'high-signal-changes.json'), { schema_version: 'autoarmory/high-signal-changes/v1', count: drafts.filter(function (d) { return d.high_signal === true; }).length, changes: drafts.filter(function (d) { return d.high_signal === true; }) });
  writeJson(path.join(stateDir, 'change-summary.json'), { schema_version: 'autoarmory/change-inspector-summary/v1', sessions: sessionArgs, records: records.length, changes: changes.length, metrics: metrics, generated_at: new Date().toISOString() });
  pruneBackups(stateDir, { maxPerFile: 3, maxAgeDays: 7 });
  writeJson(stateFile, state, { backup: false });
  if (args.json) printJson({ schema_version: 'autoarmory/change-inspector-run/v1', sessions: sessionArgs.length, records: records.length, metrics: metrics }); else process.stdout.write('change inspector: records=' + records.length + '\n');
};
const lock = stateLock.acquire(stateDir, { staleMs: 60000 });
if (!lock.ok) {
  if (args.json) printJson({ schema_version: 'autoarmory/change-inspector-run/v1', locked: true, reason: lock.reason, records: 0 });
  else process.stdout.write('change inspector: locked (' + lock.reason + ')\n');
  process.exit(0);
}
try {
  runOnce();
} catch (error) {
  process.stderr.write(String(error.message || error) + '\n');
  process.exit(/SESSION_SHADOW_FAIL_CLOSED/.test(String(error.message || error)) ? 2 : 1);
} finally {
  lock.release();
}
if (args.watch) setInterval(function () { try { runOnce(); } catch (error) { process.stderr.write(String(error.message || error) + '\n'); process.exit(2); } }, 2000);