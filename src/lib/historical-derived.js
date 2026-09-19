'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonlStrict } = require('./util');

function readOptional(file) { return fs.existsSync(file) ? readJsonlStrict(file) : []; }
function fromHistory(stateDir) {
  const cases = readOptional(path.join(stateDir, 'cases.jsonl'));
  const runs = readOptional(path.join(stateDir, 'mechanism-runs.jsonl'));
  const closures = readOptional(path.join(stateDir, 'closures.jsonl'));
  const reuse = [];
  const reuseDir = path.join(stateDir, 'reuse-records');
  if (fs.existsSync(reuseDir)) for (const name of fs.readdirSync(reuseDir).filter(function (item) { return /\.json$/i.test(item); })) { try { reuse.push(JSON.parse(fs.readFileSync(path.join(reuseDir, name), 'utf8'))); } catch (_) {} }
  const byMechanism = {};
  for (const record of reuse) { const id = record.mechanism_id || record.run && record.run.mechanism_id; if (id) byMechanism[id] = record; }
  const candidates = [];
  const seen = {};
  for (const run of runs) {
    if (!run || run.result !== 'pass' || run.exit_code !== 0) continue;
    const c = cases.find(function (item) { return item.id === run.case_id; });
    const r = byMechanism[run.mechanism_id];
    const transition = c && c.expected_transition;
    if (!transition) continue;
    const changeId = (r && r.change_id) || run.mechanism_id || run.id;
    const key = changeId + '|' + transition;
    if (seen[key]) continue;
    seen[key] = true;
    candidates.push({
      schema_version: 'autoarmory/transition-candidate/v1',
      change_id: changeId,
      observed_facts: { mechanism_id: run.mechanism_id, case_id: run.case_id, run_id: run.id, exit_code: run.exit_code, output_sha256: run.output_sha256 || null },
      candidate_transition: transition,
      transition_source: 'historical_mechanism_run',
      source_strength: 'derived',
      evidence_refs: [run.id].concat(closures.filter(function (item) { return item.run_id === run.id; }).map(function (item) { return item.id; }))
    });
  }
  return { schema_version: 'autoarmory/historical-derived/v1', state_root: path.resolve(stateDir), candidates: candidates, count: candidates.length };
}
module.exports = { fromHistory };