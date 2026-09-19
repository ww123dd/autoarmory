'use strict';

const FAMILIES = [
  { id: 'test', transition: 'TEST->PASS', pattern: /(pytest|npm test|node(?:\.exe)?\s+tests|tsc|verify_all|npm run build)/i },
  { id: 'hash', transition: 'HASH->MATCH', pattern: /(sha256|hash)/i },
  { id: 'git', transition: 'COMMIT->EXISTS', pattern: /(git commit|git rev-parse|git status|git diff)/i },
  { id: 'process', transition: 'STATE->RUNNING', pattern: /(get-process|pid|tasklist|\bservice\b)/i },
  { id: 'http', transition: 'HTTP->HEALTHY', pattern: /(curl|invoke-webrequest|https?:\/\/)/i },
  { id: 'sql', transition: 'COUNT->EXPECTED', pattern: /(\bselect\s|\bshow\s|\bdesc\s|\bdoris\b)/i },
  { id: 'file_enumeration', transition: 'TRUNCATED->ENUMERATED', pattern: /(manifest|get-childitem.*-recurse|enumeration)/i },
  { id: 'build', transition: 'BUILD->PASS', pattern: /(npm run build|tsc|bundle|dist|artifact)/i }
];
const META = [
  ['cd', /(^|[;&|]\s*)cd\s+/i],
  ['meta_command', /\[Console\]::OutputEncoding/i],
  ['variable_assignment', /(^|[;&|]\s*)\$(?:patch|py|exe|codex|p|path|[A-Za-z_]\w*)\s*=/i],
  ['powershell_indirect', /&\s*\$(?:exe|codex|py|[\w]+)/i],
  ['native_exe', /&\s*['"]?[A-Za-z]:\\[^'";]+\.exe/i],
  ['file_write', /(set-content|add-content|out-file|begin patch|apply-patch)/i],
  ['search_command', /(^|[;&|]\s*)(rg|select-string|findstr)\b/i],
  ['read_command', /(^|[;&|]\s*)(get-content|cat|type)\b/i],
  ['chain', /(^|[;&|]\s*)(cd|echo|write-output|if|foreach|try|catch)\b/i]
];
function detectFamily(text) {
  for (const family of FAMILIES) if (family.pattern.test(text)) return { id: family.id, transition: family.transition };
  return null;
}
function detectMeta(text) {
  const kinds = [];
  for (const item of META) if (item[1].test(text)) kinds.push(item[0]);
  return kinds;
}
function normalizeCommand(command) {
  const text = String(command || '').trim();
  if (!text) return { primary_command: null, command_family: null, candidate_transition: null, meta_kinds: [], observed_facts: {} };
  const family = detectFamily(text);
  const metaKinds = detectMeta(text);
  if (family) return { primary_command: text, command_family: family.id, candidate_transition: family.transition, meta_kinds: metaKinds, observed_facts: { command: text, command_family: family.id, meta_kinds: metaKinds } };
  const primaryMeta = metaKinds.indexOf('file_write') !== -1 ? 'file_write' : (metaKinds[0] || 'unknown');
  return { primary_command: null, command_family: null, candidate_transition: null, meta_kinds: metaKinds, observed_facts: { command: text, meta_kind: primaryMeta, meta_kinds: metaKinds } };
}
module.exports = { normalizeCommand, FAMILIES, META };