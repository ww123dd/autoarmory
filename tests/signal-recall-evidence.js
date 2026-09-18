'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'signal-recall-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/signal-recall-evidence/v1', 'signal recall evidence schema');
must(report.check_recall === 1 && report.risk_recall === 1, 'positive recall must be complete');
must(report.check_false_positive_rate === 0 && report.risk_false_positive_rate === 0, 'curated negative false positives must be zero');
must(report.check_samples >= 20 && report.risk_samples >= 20, 'recall audit sample size');
must(report.llm_judge_calls === 0 && report.private_session_content_shipped === false, 'signal audit privacy/no-judge boundary');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('signal recall evidence passed: CHECK/RISK recall=1, false positives=0');
