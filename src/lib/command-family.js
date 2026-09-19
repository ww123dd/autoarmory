'use strict';

// Single source of truth for command families, their recognition patterns and
// default transitions (2.46.0 consolidation). Every module that classifies a
// command consumes this registry; private copies are forbidden. Legacy family
// ids are read-side aliases only - new records always use canonical ids.

// Family order is load-bearing: the first matching pattern wins. Build sits
// before hash so "tsc && sha256sum" classifies as build (the build verb is the
// intent; the hash is a post-step). Bare "bundle"/"dist" are deliberately
// absent: they matched PowerShell output text in the real corpus. The bare
// tool names (tsc/webpack/esbuild/rollup/vite) are anchored to command position
// (start of the line or after ;/&&/|) - in the real corpus they otherwise
// matched Select-String patterns, config paths, "git commit -m" messages and
// arbitrary CLI flags like "--rollup".
const FAMILIES = [
  { id: 'test', transition: 'TEST->PASS', pattern: /(pytest|npm test|node(?:\.exe)?\s+tests|verify_all)/i },
  { id: 'build', transition: 'BUILD->PASS', pattern: /(npm run build|(^|[;&|]|\r?\n)\s*(npx\s+)?(tsc|webpack|esbuild|rollup|vite)(\s|$))/i },
  { id: 'hash', transition: 'HASH->MATCH', pattern: /(sha256|hash)/i },
  { id: 'git', transition: 'COMMIT->EXISTS', pattern: /(git commit|git rev-parse|git status|git diff)/i },
  { id: 'process', transition: 'STATE->RUNNING', pattern: /(get-process|pid|tasklist|\bservice\b)/i },
  { id: 'http', transition: 'HTTP->HEALTHY', pattern: /(curl|invoke-webrequest|https?:\/\/)/i },
  { id: 'sql', transition: 'COUNT->EXPECTED', pattern: /(\bselect\s|\bshow\s|\bdesc\s|\bdoris\b)/i },
  { id: 'enumeration', transition: 'TRUNCATED->ENUMERATED', pattern: /(manifest|get-childitem.*-recurse|enumeration)/i },
  { id: 'dom', transition: null, pattern: /(\bplaywright\b|\bpuppeteer\b|\bbrowser\b|\bdom\b|\bselector\b)/i }
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
const META_FAMILY = { file_write: 'write', read_command: 'read', search_command: 'search' };
const CANONICAL = ['test', 'build', 'hash', 'git', 'process', 'http', 'sql', 'enumeration', 'dom', 'write', 'read', 'search', 'meta', 'unknown'];
const ALIAS = {
  project_test: 'test',
  file_hash: 'hash',
  process_state: 'process',
  git_commit: 'git',
  git_state: 'git',
  http_health: 'http',
  sql_count: 'sql',
  file_enumeration: 'enumeration'
};
const UNKNOWN = 'unknown';

function classify(command) {
  const text = String(command || '').trim();
  if (!text) return { family: UNKNOWN, transition: null, meta_kinds: [] };
  const metaKinds = [];
  for (const item of META) if (item[1].test(text)) metaKinds.push(item[0]);
  for (const family of FAMILIES) {
    if (family.pattern.test(text)) return { family: family.id, transition: family.transition || null, meta_kinds: metaKinds };
  }
  const primary = metaKinds.indexOf('file_write') !== -1 ? 'file_write' : (metaKinds[0] || null);
  if (primary) return { family: META_FAMILY[primary] || 'meta', transition: null, meta_kinds: metaKinds };
  return { family: UNKNOWN, transition: null, meta_kinds: metaKinds };
}

// Read-side legacy resolution. project_test_or_build cannot map 1:1: the command
// decides between test and build, so it stays a build-swallowing lie without one.
function canonicalFamily(id, command) {
  const value = String(id || '').toLowerCase();
  if (value === 'project_test_or_build') {
    if (command === undefined || command === null || !String(command).trim()) return 'test';
    return classify(command).family === 'build' ? 'build' : 'test';
  }
  if (ALIAS[value]) return ALIAS[value];
  if (CANONICAL.indexOf(value) !== -1) return value;
  return UNKNOWN;
}

function isVerificationFamily(family) {
  const id = canonicalFamily(family);
  const entry = FAMILIES.find(function (item) { return item.id === id; });
  return !!(entry && entry.transition);
}
function transitionFor(family) {
  const entry = FAMILIES.find(function (item) { return item.id === canonicalFamily(family); });
  return entry && entry.transition || null;
}

module.exports = { FAMILIES, META, CANONICAL, ALIAS, UNKNOWN, classify, canonicalFamily, isVerificationFamily, transitionFor };
