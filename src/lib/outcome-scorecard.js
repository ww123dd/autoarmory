'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl, writeJson } = require('./util');
function reuseIndex(stateDir) {
  const root = path.join(stateDir, 'reuse-records');
  const index = {};
  if (!fs.existsSync(root)) return index;
  for (const name of fs.readdirSync(root).filter(function (item) { return /\.json$/i.test(item); })) {
    try { const record = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); if (record.decision_id) index[record.decision_id] = record; } catch (_) {}
  }
  return index;
}
function scorecard(stateDir) {
  const outcomes = readJsonl(path.join(stateDir, 'outcome-records.jsonl'));
  const reuse = reuseIndex(stateDir);
  const rows = {};
  const rowFor = function (id) { return rows[id] || (rows[id] = { verifier_id: id, correct_count: 0, rejected_count: 0, overturned_count: 0, reopen_count: 0, expire_count: 0, retract_count: 0, false_close_count: 0, sample_size: 0, last_outcome_at: null }); };
  for (const outcome of outcomes) {
    const id = outcome.verifier_id || 'unknown';
    const row = rowFor(id);
    row.sample_size += 1;
    if (outcome.type === 'accepted') row.correct_count += 1;
    else if (outcome.type === 'rejected') row.rejected_count += 1;
    else if (outcome.type === 'overturned') { row.overturned_count += 1; const record = reuse[outcome.decision_id]; if (record && record.status === 'closed') row.false_close_count += 1; }
    else if (outcome.type === 'reopened') row.reopen_count += 1;
    else if (outcome.type === 'expired') row.expire_count += 1;
    else if (outcome.type === 'retracted') row.retract_count += 1;
    if (!row.last_outcome_at || String(outcome.observed_at) > row.last_outcome_at) row.last_outcome_at = outcome.observed_at;
  }
  for (const id of Object.keys(rows)) rows[id].earned_candidate = rows[id].correct_count >= 3 && rows[id].overturned_count === 0 && rows[id].reopen_count === 0 && rows[id].false_close_count === 0;
  return { schema_version: 'autoarmory/outcome-scorecard/v1', generated_at: new Date().toISOString(), outcome_count: outcomes.length, rows: Object.values(rows).sort(function (a, b) { return b.sample_size - a.sample_size; }) };
}
function writeScorecard(stateDir, report) { const file = path.join(stateDir, 'verifier-outcomes.json'); writeJson(file, report); return file; }
module.exports = { scorecard, writeScorecard };