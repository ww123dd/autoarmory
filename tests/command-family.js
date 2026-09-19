'use strict';
const registry = require('../src/lib/command-family');
function must(condition, message) { if (!condition) throw new Error(message); }

// canonical enum is frozen; every classify result lands inside it
const frozen = ['test', 'build', 'hash', 'git', 'process', 'http', 'sql', 'enumeration', 'dom', 'write', 'read', 'search', 'meta', 'unknown'];
must(JSON.stringify(registry.CANONICAL) === JSON.stringify(frozen), 'canonical family enum must stay frozen');
must(registry.FAMILIES.every(function (f) { return frozen.indexOf(f.id) !== -1; }), 'every registry family id must be canonical');

const table = [
  ['pytest -q', 'test', 'TEST->PASS'],
  ['npm test', 'test', 'TEST->PASS'],
  ['node tests/run.js', 'test', 'TEST->PASS'],
  ['node.exe tests/foo.js', 'test', 'TEST->PASS'],
  ['npm run build', 'build', 'BUILD->PASS'],
  ['npx tsc --noEmit', 'build', 'BUILD->PASS'],
  ['rollup -c', 'build', 'BUILD->PASS'],
  ['sha256sum artifact.bin', 'hash', 'HASH->MATCH'],
  ['git rev-parse HEAD', 'git', 'COMMIT->EXISTS'],
  ['git status --short', 'git', 'COMMIT->EXISTS'],
  ['Get-Process node', 'process', 'STATE->RUNNING'],
  ['curl https://example.com/health', 'http', 'HTTP->HEALTHY'],
  ['SELECT count(*) FROM t', 'sql', 'COUNT->EXPECTED'],
  ['Get-ChildItem -Recurse | Select-String manifest', 'enumeration', 'TRUNCATED->ENUMERATED'],
  ['npx playwright test', 'dom', null],
  ['Set-Content x y', 'write', null],
  ['rg -n foo src', 'search', null],
  ['Get-Content config.json', 'read', null],
  ['cd repo && echo hi', 'meta', null]
];
for (const item of table) {
  const result = registry.classify(item[0]);
  must(result.family === item[1], item[0] + ' family expected ' + item[1] + ' got ' + result.family);
  must(result.transition === item[2], item[0] + ' transition expected ' + item[2] + ' got ' + result.transition);
}

// negative control: an unknown command must land in unknown - never a legacy id
const unknownFamily = registry.classify('flibbertigibbet --nonsense /xyzzy quux').family;
must(unknownFamily === 'unknown', 'unknown command must classify as unknown, got ' + unknownFamily);
must(['test', 'build', 'project_test', 'project_test_or_build'].indexOf(unknownFamily) === -1, 'unknown command must never resolve to test/build/legacy ids');

// read-side aliases: 1:1 renames resolve without a command
must(registry.canonicalFamily('project_test') === 'test', 'project_test aliases to test');
must(registry.canonicalFamily('file_hash') === 'hash', 'file_hash aliases to hash');
must(registry.canonicalFamily('git_state') === 'git', 'git_state aliases to git');
must(registry.canonicalFamily('git_commit') === 'git', 'git_commit aliases to git');
must(registry.canonicalFamily('process_state') === 'process', 'process_state aliases to process');
must(registry.canonicalFamily('http_health') === 'http', 'http_health aliases to http');
must(registry.canonicalFamily('sql_count') === 'sql', 'sql_count aliases to sql');
must(registry.canonicalFamily('file_enumeration') === 'enumeration', 'file_enumeration aliases to enumeration');

// project_test_or_build splits by command - build is never swallowed into test
must(registry.canonicalFamily('project_test_or_build', 'npm run build') === 'build', 'legacy merged id must resolve to build for build commands');
must(registry.canonicalFamily('project_test_or_build', 'pytest -q') === 'test', 'legacy merged id must resolve to test for test commands');
must(registry.canonicalFamily('project_test_or_build', 'tsc --noEmit') === 'build', 'tsc must resolve to build through the legacy merged id');
must(registry.canonicalFamily('project_test_or_build') === 'test', 'legacy merged id without a command falls back to test');

// helpers
must(registry.isVerificationFamily('test') === true && registry.isVerificationFamily('write') === false, 'verification families carry transitions');
must(registry.transitionFor('sql_count') === 'COUNT->EXPECTED', 'transitionFor resolves through aliases');

console.log('command family registry tests passed: frozen canonical enum, build split from test, legacy aliases, unknown negative control');
