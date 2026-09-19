'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonlStrict } = require('./util');
const { normalizeCommand } = require('./command-normalizer');

function commandText(record) { return [record && record.command].concat(record && record.args || []).join(' '); }
function derive(record) {
  if (!Number.isInteger(record && record.exit_code)) return { ok: false, errors: ['exit_code_missing'], record: record };
  const normalized = normalizeCommand(commandText(record));
  if (!normalized.candidate_transition) return { ok: false, errors: ['no_transition_family'], record: record, normalized: normalized };
  return {
    ok: true,
    candidate: {
      schema_version: 'autoarmory/transition-candidate/v1',
      change_id: record.decision_id || record.id,
      observed_facts: { command: commandText(record), command_family: normalized.command_family, exit_code: record.exit_code, stdout_sha256: record.output && record.output.stdout_sha256, stderr_sha256: record.output && record.output.stderr_sha256 },
      candidate_transition: normalized.candidate_transition,
      transition_source: 'exec_record',
      source_strength: record.exit_code === 0 ? 'derived' : 'candidate',
      evidence_refs: [record.id]
    }
  };
}
function fromExecRecords(stateDir) {
  const file = path.join(stateDir, 'exec-records.jsonl');
  if (!fs.existsSync(file)) return { ok: true, file: file, candidates: [], errors: [], unverifiable: [] };
  const rows = readJsonlStrict(file);
  const candidates = [];
  const unverifiable = [];
  for (const row of rows) {
    const result = derive(row);
    if (result.ok) candidates.push(result.candidate); else unverifiable.push({ id: row && row.id || null, errors: result.errors });
  }
  return { ok: true, file: file, candidates: candidates, errors: [], unverifiable: unverifiable };
}
module.exports = { derive, fromExecRecords, commandText };