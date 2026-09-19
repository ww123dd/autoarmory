'use strict';
const { normalizeCommand } = require('../src/lib/command-normalizer');
function must(condition, message) { if (!condition) throw new Error(message); }
const cases = [
  ['cd repo; pytest -q', 'test', 'TEST->PASS'],
  ['[Console]::OutputEncoding=[Text.Encoding]::UTF8', null, null],
  ['$patch = @\'\n*** Begin Patch\nSet-Content x', null, null],
  ['rg -n foo src', null, null],
  ['Get-Content x', null, null],
  ['& $exe --codex-run-as-apply-patch x', null, null],
  ['$py = "python"; & $py -m pytest -q', 'test', 'TEST->PASS'],
  ['sha256sum artifact.bin', 'hash', 'HASH->MATCH'],
  ['git rev-parse HEAD', 'git', 'COMMIT->EXISTS'],
  ['Get-Process node', 'process', 'STATE->RUNNING'],
  ['curl https://example.com/health', 'http', 'HTTP->HEALTHY'],
  ['SELECT count(*) FROM t', 'sql', 'COUNT->EXPECTED'],
  ['Get-ChildItem -Recurse | Select-String manifest', 'enumeration', 'TRUNCATED->ENUMERATED'],
  ['npm run build', 'build', 'BUILD->PASS'],
  ['npx tsc --noEmit', 'build', 'BUILD->PASS']
];
for (const item of cases) {
  const result = normalizeCommand(item[0]);
  must(result.command_family === item[1], item[0] + ' family expected ' + item[1] + ' got ' + result.command_family);
  must(result.candidate_transition === item[2], item[0] + ' transition expected ' + item[2] + ' got ' + result.candidate_transition);
}
must(normalizeCommand('$patch = @\'\nSet-Content x').observed_facts.meta_kind === 'file_write', 'patch/write meta kind');
must(normalizeCommand('rg -n foo').observed_facts.meta_kind === 'search_command', 'rg meta kind');
must(normalizeCommand('[Console]::OutputEncoding=x').observed_facts.meta_kind === 'meta_command', 'encoding meta kind');
console.log('command normalizer tests passed: meta/read/search/write/native/indirect + verifier-bearing families');