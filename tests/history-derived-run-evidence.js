'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'history-derived-run-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/history-derived-run-evidence/v1', 'history-derived run evidence schema');
must(report.history_derived_run_count === 1 && report.run.status === 'closed' && report.run.result === 'pass', 'one history-derived run must be closed and passing');
must(report.verifier_expresses_transition === true && report.expected_transition === 'COUNT->>=3' && report.assertion.path === 'count' && report.assertion.op === 'gte' && report.assertion.value === 3, 'verifier assertion must express the transition');
must(report.no_fabricated_verifier === true && report.promoted === true, 'no fabricated verifier; promotion may follow the closed run');
must(report.private_session_content_shipped === false, 'private session content must not ship');
must(!/[A-Za-z]:[\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('history-derived run evidence passed: 1 closed run, verifier expresses COUNT->>=3');
