'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'session-shadow-resolver-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/session-shadow-resolver-evidence/v1', 'resolver evidence schema');
must(report.old_verified_candidate === 18 && report.after_fix.verified_candidate === 0 && report.after_fix.verifier_mismatch === 18, '18 old candidates must become 18 mismatches and 0 verified');
must(report.source_session_totals.auto_case_draft_count === 102 && report.source_session_totals.verified_candidate === 0, 'source session rerun totals');
const c33 = report.selected_sessions_after_fix.find(function (item) { return item.source_session === 'c33fa0cf00d9'; });
const d4d = report.selected_sessions_after_fix.find(function (item) { return item.source_session === 'd4d33e1accd4'; });
must(c33 && c33.verified_candidate === 3 && c33.verifier_mismatch === 153, 'main-session threshold candidates after resolver fix');
must(d4d && d4d.verified_candidate === 0 && d4d.verifier_mismatch === 59, 'article-session candidates after resolver fix');
must(report.no_fabricated_candidate === true && report.llm_judge_calls === 0, 'no fabricated candidate or judge');
must(report.private_session_content_shipped === false, 'private session content must not ship');
must(!/[A-Za-z]:[\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('session shadow resolver evidence passed: 18 old candidates -> 0 verified, 18 verifier_mismatch');
