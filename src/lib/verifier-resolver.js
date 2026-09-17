'use strict';

const MECHANICAL = ['registered', 'project_test', 'file_hash', 'git_status'];
const CANDIDATE = 'verifier_candidate';
const MISSING = 'verifier_missing';

function resolveVerifier(input, options) {
  const value = input || {};
  const opts = options || {};
  const command = String(value.command || '');
  const text = [command, value.source_text, value.title, value.target_skill_ref].join(' ');
  const files = Array.isArray(value.files) ? value.files : [];
  for (const id of opts.verifier_ids || []) if (id && text.indexOf(id) !== -1) return { kind: 'registered', ref: id, reason: 'verifier id is present in the recorded change' };
  if (/(pytest|npm test|node tests|verify_all|tsc|npm run build)/i.test(command)) return { kind: 'project_test', ref: command, reason: 'project test/check command was observed' };
  if (files.some(function (item) { return item && (item.sha256 || item.hash); }) || /(sha256|hash)/i.test(command)) return { kind: 'file_hash', ref: command || null, reason: 'file hash or hash command was observed' };
  if (/(git status|git diff|git commit|git rev-parse)/i.test(command)) return { kind: 'git_status', ref: command, reason: 'git state command was observed' };
  if (/(curl|invoke-webrequest|https?:\/\/)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'http', reason: 'HTTP success is not mechanically parsed in this version' };
  if (/(select\s|explain\s|show\s|desc\s|describe\s|sql|doris)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'sql', reason: 'SQL success is not mechanically parsed in this version' };
  if (/(process|pid|tasklist|get-process|service)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'process', reason: 'process state is not mechanically parsed in this version' };
  if (/(dom|selector|playwright|puppeteer|browser)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'dom', reason: 'DOM success is not mechanically parsed in this version' };
  if (/(build|dist|bundle|artifact|package)/i.test(command)) return { kind: CANDIDATE, ref: command, inferred_kind: 'build_artifact', reason: 'build artifact semantics are not mechanically parsed in this version' };
  return { kind: MISSING, ref: null, reason: 'no registered verifier or known project check was observed' };
}
module.exports = { MECHANICAL, CANDIDATE, MISSING, resolveVerifier };