'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonlStrict, writeJsonl } = require('./util');
const { normalizeCommand: normalizeVerifierCommand } = require('./command-normalizer');
const execRecordFlow = require('./exec-record-flow');
const historicalDerived = require('./historical-derived');
const resultExtractor = require('./result-extractor');

const commandFamily = require('./command-family');

// Classification comes from the command-family registry via command-normalizer;
// the private FAMILIES/META tables this module used to carry were unreachable
// dead code (the normalizer result is always truthy) and were removed in 2.46.0.
function normalizeCommand(command) {
  const normalized = normalizeVerifierCommand(command);
  if (normalized) return { primary_command: normalized.primary_command, command_family: normalized.command_family, candidate_transition: normalized.candidate_transition, observed_facts: normalized.observed_facts };
  return { primary_command: null, command_family: null, candidate_transition: null, observed_facts: {} };
}
function propose(draft, options) {
  const commands = Array.isArray(draft.commands) ? draft.commands : [];
  const normalized = commands.map(normalizeCommand).filter(function (item) { return item.candidate_transition; });
  const chosen = normalized[0] || null;
  const declared = draft.expected_transition || null;
  const derived = !!(chosen && Array.isArray(draft.signals) && draft.signals.indexOf('command_result_passed') !== -1);
  const sourceStrength = declared ? 'declared' : (derived ? 'derived' : 'candidate');
  const transition = declared || (chosen && chosen.candidate_transition) || null;
  if (!transition) return null;
  return {
    schema_version: 'autoarmory/transition-candidate/v1',
    change_id: draft.change_id || draft.id || null,
    observed_facts: {
      commands: commands.slice(0, 5),
      command_family: chosen && chosen.command_family || null,
      signals: draft.signals || [],
      changed_files: draft.changed_files || []
    },
    candidate_transition: transition,
    transition_source: declared ? 'owner_declared' : 'command_shape',
    source_strength: sourceStrength,
    evidence_refs: Array.isArray(draft.change_record_ids) ? draft.change_record_ids : (draft.source_refs || [])
  };
}
function proposeFile(stateDir, options) {
  const opts = options || {};
  const projected = path.join(stateDir, 'decision-scan', 'decision-drafts.jsonl');
  const missing = path.join(stateDir, 'decision-scan', 'missing-transition.jsonl');
  const input = fs.existsSync(projected) ? projected : missing;
  const drafts = readJsonlStrict(input).map(function (draft) { return Object.assign({}, draft, { expected_transition: null, transition_source: null, transition_source_strength: null, transition_candidate: null }); });
  const rows = drafts.map(function (draft) { return propose(draft, opts); }).filter(Boolean);
  const existingFile = path.join(stateDir, 'decision-scan', 'transition-candidates.jsonl');
  const existing = fs.existsSync(existingFile) ? readJsonlStrict(existingFile) : [];
  const rank = { candidate: 0, derived: 1, declared: 2 };
  for (const row of existing) {
    const index = rows.findIndex(function (item) { return item.change_id === row.change_id; });
    if (index === -1) rows.push(row);
    else if (rank[row.source_strength] > rank[rows[index].source_strength]) rows[index] = row;
  }
  const merge = function (candidate) {
    const rank = { candidate: 0, derived: 1, declared: 2 };
    const index = rows.findIndex(function (row) { return row.change_id === candidate.change_id; });
    if (index === -1) rows.push(candidate);
    else if (rank[candidate.source_strength] > rank[rows[index].source_strength]) rows[index] = candidate;
  };
  if (opts.includeExec !== false) for (const candidate of execRecordFlow.fromExecRecords(stateDir).candidates) merge(candidate);
  if (opts.includeHistory !== false) for (const candidate of historicalDerived.fromHistory(stateDir).candidates) merge(candidate);
  if (opts.includeStructured !== false) for (const candidate of resultExtractor.deriveTransitionCandidates(stateDir)) merge(candidate);
  if (opts.apply === true) writeJsonl(existingFile, rows);
  const byFamily = {};
  const byStrength = {};
  const byFamilyStrength = {};
  for (const row of rows) {
    const family = row.observed_facts.command_family || 'unknown';
    byFamily[family] = (byFamily[family] || 0) + 1;
    byStrength[row.source_strength] = (byStrength[row.source_strength] || 0) + 1;
    byFamilyStrength[family] = byFamilyStrength[family] || {};
    byFamilyStrength[family][row.source_strength] = (byFamilyStrength[family][row.source_strength] || 0) + 1;
  }
  return { schema_version: 'autoarmory/transition-proposal/v1', input_file: input, proposed: rows.length, trusted_count: rows.filter(function (row) { return row.source_strength === 'declared' || row.source_strength === 'derived'; }).length, candidate_count: rows.filter(function (row) { return row.source_strength === 'candidate'; }).length, by_family: byFamily, by_source_strength: byStrength, by_family_source_strength: byFamilyStrength, rows: rows };
}
module.exports = { normalizeCommand, propose, proposeFile, FAMILIES: commandFamily.FAMILIES };