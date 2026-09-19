'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const extractor = require('../src/lib/result-extractor');
function must(condition, message) { if (!condition) throw new Error(message); }
must(extractor.parseText('exit code 0').result === 'pass' && extractor.parseText('exit code 0').result_parse_source === 'exit_code_regex', 'exit code 0 must parse as pass');
must(extractor.parseText('exited with code 2').result === 'fail', 'exited with code 2 must parse as fail');
must(extractor.parseText('5 passed, 0 failed').result === 'pass', 'test summary must parse passed/failed');
must(extractor.parseText('npm ERR! code ELIFECYCLE').result === 'fail', 'npm ERR must parse as fail');
must(extractor.parseText('maybe it worked') === null, 'ambiguous text must not become a structured result');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-result-extract-'));
const state = path.join(root, 'state');
fs.mkdirSync(state, { recursive: true });
fs.writeFileSync(path.join(state, 'exec-records.jsonl'), JSON.stringify({ id: 'exec-1', exit_code: 0, outcome: 'success', output: { stdout_sha256: 'a'.repeat(64), stderr_sha256: 'b'.repeat(64) } }) + '\n', 'utf8');
const report = extractor.extract(state, { apply: true });
must(report.count === 1 && report.rows[0].result_parse_source === 'exec_record' && report.rows[0].result === 'pass', 'exec-record must become a structured result');
must(fs.existsSync(path.join(state, 'structured-results.jsonl')), 'structured results must be written');
console.log('result extractor tests passed: deterministic exit/test parsing, ambiguous text rejected, exec-record derived');