'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'session-shadow-resolver-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/session-shadow-resolver-evidence/v1', 'resolver evidence schema');
must(report.old_verified_candidate === 18 && report.after_fix.verified_candidate === 0 && report.after_fix.verifier_mismatch === 18, '18 old candidates must become 18 mismatches and 0 verified');
must(report.source_session_totals.auto_case_draft_count === 102 && report.source_session_totals.verified_candidate === 0, 'source session rerun totals');
must(report.selected_sessions_after_fix.every(function (item) { return item.verified_candidate === 0 && item.verifier_mismatch > 0; }), 'all selected sessions must have no verified candidate after resolver fix');
must(report.no_fabricated_candidate === true && report.llm_judge_calls === 0, 'no fabricated candidate or judge');
must(report.private_session_content_shipped === false, 'private session content must not ship');
must(!/[A-Za-z]:[\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('session shadow resolver evidence passed: 18 old candidates -> 0 verified, 18 verifier_mismatch');
