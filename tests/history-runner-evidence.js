'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'history-runner-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/history-runner-evidence/v1', 'history runner evidence schema');
must(report.pending_job_count === 1 && report.history_derived_run_count === 1 && report.closed === 1, 'pending job must become one closed history-derived run');
must(report.verifier === 'windows-service-state' && report.observed.state === 'RUNNING', 'reuse record must bind a real verifier fact');
must(report.idempotent_rerun === true && report.unverifiable_recorded === true, 'runner must be idempotent and keep unverifiable open');
must(report.manual_step_after_goal === 0 && report.canonical_projection_writeback_count === 0 && report.provenance_overwrite_count === 0, 'runner must not require manual steps or write back canonical provenance');
must(report.close_without_verifier_count === 0 && report.llm_judge_calls === 0 && report.private_session_content_shipped === false, 'runner closure and privacy boundary');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('history runner evidence passed: pending -> closed reuse record, idempotent, unverifiable recorded');
