'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonlStrict, writeJsonl } = require('./util');

const FAMILIES = [
  { id: 'project_test', transition: 'TEST->PASS', pattern: /(pytest|npm test|node tests|tsc|verify_all|npm run build)/i },
  { id: 'file_hash', transition: 'HASH->MATCH', pattern: /(sha256|hash)/i },
  { id: 'process_state', transition: 'STATE->RUNNING', pattern: /(get-process|pid|tasklist|\bservice\b)/i },
  { id: 'git_commit', transition: 'COMMIT->EXISTS', pattern: /(git commit|git rev-parse)/i },
  { id: 'http_health', transition: 'HTTP->HEALTHY', pattern: /(curl|invoke-webrequest|https?:\/\/)/i },
  { id: 'sql_count', transition: 'COUNT->EXPECTED', pattern: /(\bselect\b|\bshow\b|\bdesc\b|\bdoris\b)/i },
  { id: 'enumeration', transition: 'TRUNCATED->ENUMERATED', pattern: /(manifest|get-childitem.*-recurse|enumeration)/i }
];
const META = [
  ['meta_command', /\[Console\]::OutputEncoding/i],
  ['file_write', /(set-content|add-content|out-file|begin patch|apply-patch)/i],
  ['search_command', /(^|[;&|]\s*)(rg|select-string|findstr)\b/i],
  ['read_command', /(^|[;&|]\s*)(get-content|cat|type)\b/i],
  ['cd', /(^|[;&|]\s*)cd\s+/i]
];

function normalizeCommand(command) {
  const text = String(command || '').trim();
  if (!text) return { primary_command: null, command_family: null, candidate_transition: null, observed_facts: {} };
  for (const family of FAMILIES) {
    if (family.pattern.test(text)) return { primary_command: text, command_family: family.id, candidate_transition: family.transition, observed_facts: { command: text, command_family: family.id } };
  }
  for (const item of META) {
    if (item[1].test(text)) return { primary_command: null, command_family: null, candidate_transition: null, observed_facts: { command: text, meta_kind: item[0] } };
  }
  return { primary_command: null, command_family: null, candidate_transition: null, observed_facts: { command: text, meta_kind: 'unknown' } };
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
  const input = path.join(stateDir, 'decision-scan', 'missing-transition.jsonl');
  const drafts = readJsonlStrict(input);
  const rows = drafts.map(function (draft) { return propose(draft, opts); }).filter(Boolean);
  if (opts.apply === true) writeJsonl(path.join(stateDir, 'decision-scan', 'transition-candidates.jsonl'), rows);
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
module.exports = { normalizeCommand, propose, proposeFile, FAMILIES };