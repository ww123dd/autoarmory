#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, printJson, readJson, writeJson, appendJsonl, dedupeJsonl } = require('../src/lib/util');
const shadow = require('../src/lib/session-shadow');
const inspector = require('../src/lib/change-inspector');
const stateLock = require('../src/lib/state-lock');

const args = parseArgs(process.argv.slice(2));
const stopState = path.resolve(process.env.AUTOARMORY_STATE || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow'));
const engineDir = path.resolve(args.state || path.join(stopState, 'change-inspector'));
const root = path.resolve(args.root || path.join(os.homedir(), '.codex', 'sessions'));
const stateFile = path.join(engineDir, 'state.json');
const lock = stateLock.acquire(engineDir, { staleMs: 120000 });
if (!lock.ok) { process.stderr.write('engine state is locked: ' + lock.reason + '\n'); process.exit(1); }

function walk(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/^rollout.*\.jsonl$/i.test(entry.name)) out.push(full);
  }
  return out;
}
function verifierIds() { try { const lock = JSON.parse(fs.readFileSync(path.resolve(args.repo || process.cwd(), 'verifiers.lock.json'), 'utf8')); return (lock.verifiers || []).map(function (v) { return v.id; }); } catch (_) { return []; } }

const files = walk(root, []).sort();
const state = fs.existsSync(stateFile) ? readJson(stateFile) : { schema_version: 'autoarmory/change-inspector-state/v1', sessions: {} };
if (!state.seen_ids) state.seen_ids = {};
if (!state.signatures) state.signatures = {};
if (!state.high_signal_crossed) state.high_signal_crossed = {};
if (!state.sessions) state.sessions = {};
const canonicalFile = path.join(engineDir, 'change-records.jsonl');
const inventoryFile = path.join(engineDir, 'change-inventory.jsonl');
const report = { schema_version: 'autoarmory/session-backfill/v1', root: root, engine_dir: engineDir, files: files.length, scanned: 0, skipped_current: 0, errors: [], records_added: 0, sessions_registered: Object.keys(state.sessions).length };
const verifierIdsList = verifierIds();
let pendingRecords = [];
let sinceSave = 0;

function flushRecords() {
  if (!pendingRecords.length) return;
  appendJsonl(canonicalFile, pendingRecords);
  appendJsonl(inventoryFile, pendingRecords);
  report.records_added += pendingRecords.length;
  pendingRecords = [];
}
function saveState() { writeJson(stateFile, state); sinceSave = 0; }

for (const file of files) {
  try {
    const size = fs.statSync(file).size;
    const cursor = state.sessions[file] || { offset: 0 };
    if (cursor.offset >= size) { report.skipped_current += 1; continue; }
    const text = fs.readFileSync(file, 'utf8').slice(cursor.offset);
    const lines = text.split(/\r?\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    const events = [];
    const raw = { tool_use: 0, tool_result: 0 };
    for (const line of lines) {
      if (!line.trim()) continue;
      let row; try { row = JSON.parse(line); } catch (_) { continue; }
      const counts = shadow.countRawTools(row); raw.tool_use += counts.tool_use; raw.tool_result += counts.tool_result;
      const normalized = shadow.normalizeRows(row);
      if (normalized.length) events.push.apply(events, normalized);
    }
    const audit = shadow.normalizationAudit(raw, events);
    if (!audit.ok) { report.errors.push({ file: file, reason: 'normalization audit fail-closed', audit: audit }); continue; }
    if (!events.length) { state.sessions[file] = { offset: size }; sinceSave += 1; continue; }
    const sessionState = { session_id: path.basename(file), seen_ids: state.seen_ids, signatures: state.signatures, high_signal_crossed: state.high_signal_crossed, line: 0 };
    const result = inspector.inspect(events, sessionState, { verifier_ids: verifierIdsList, exec_records: [] });
    state.seen_ids = sessionState.seen_ids; state.signatures = sessionState.signatures; state.high_signal_crossed = sessionState.high_signal_crossed;
    state.sessions[file] = { offset: size };
    if (result.records.length) for (const record of result.records) pendingRecords.push(record);
    report.scanned += 1;
    report.sessions_registered = Object.keys(state.sessions).length;
    sinceSave += 1;
    if (pendingRecords.length >= 5000) flushRecords();
    if (sinceSave >= 15) { saveState(); stateLock.heartbeat(lock); }
  } catch (error) {
    report.errors.push({ file: file, reason: String((error && error.message) || error) });
  }
}
flushRecords();
dedupeJsonl(canonicalFile, function (row) { return row.id; });
saveState();
lock.release();
if (args.json) printJson(report);
else process.stdout.write('backfill: files=' + report.files + ' scanned=' + report.scanned + ' skipped_current=' + report.skipped_current + ' records_added=' + report.records_added + ' sessions=' + report.sessions_registered + ' errors=' + report.errors.length + '\n');
