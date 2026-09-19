'use strict';
const path = require('path');
const benchmark = require('../src/lib/resolver-benchmark');
function must(condition, message) { if (!condition) throw new Error(message); }
const repo = path.resolve(__dirname, '..');
const report = benchmark.run(repo, path.join(repo, 'docs', 'evidence', 'resolver-label-set-v1.jsonl'));
must(report.ok === true && report.resolver_false_match_rate === 0, 'resolver benchmark must fail closed on false matches');
must(report.correct_count === report.total && report.total >= 14, 'every labeled capability must resolve to its declared shape');
console.log('resolver benchmark tests passed: labeled set, false_match_rate=0, miss_rate=0');