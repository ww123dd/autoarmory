'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'high-signal-policy-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/high-signal-policy-evidence/v1', 'high signal evidence schema');
must(report.metrics.candidate_case_draft_count === 530 && report.metrics.high_signal_notification_count === 8, 'candidate and high signal counts must be separated');
must(report.metrics.high_signal_notification_count < report.metrics.candidate_case_draft_count, 'high signal is narrower than candidate');
must(report.policy.risk_alone_high_signal === false && report.policy.command_failed_alone_high_signal === false && report.policy.repeat_threshold === 3, 'high signal policy must not notify on weak single signals');
must(report.no_llm_judge === true && report.private_session_content_shipped === false, 'high signal policy privacy and judge boundary');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('high signal policy evidence passed: 530 candidates -> 8 high signals');
