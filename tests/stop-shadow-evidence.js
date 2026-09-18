'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'stop-shadow-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/stop-shadow-evidence/v1', 'stop shadow evidence schema');
const a = report.acceptance;
must(a.stop_hook_ran === true && a.auto_scan_count >= 1 && a.auto_case_draft_count > 0, 'stop hook must run and produce drafts');
must(a.duplicate_run_draft_count === 0 && a.stop_hook_blocked_session_count === 0, 'stop hook must be idempotent and non-blocking');
must(a.llm_judge_calls === 0 && a.auto_close_count === 0 && a.manual_case_creation_count === 0, 'stop hook must not judge, close or require manual case creation');
must(report.no_verifier_binding === true && report.no_run === true && report.no_closure === true && report.no_verdict === true, 'stop hook must stop before verifier/run/close/verdict');
must(report.hook_detached === true && report.heartbeat === 'last-run.jsonl' && report.event_file_removed_after_read === true, 'detached hook, heartbeat and event cleanup');
must(report.session_shadow_attached === true && report.session_shadow_incremental === 'new-events.jsonl', 'session-shadow must run incrementally from the Stop hook');
must(report.real_stop_verified === true && report.real_stop_match === 'exact' && report.real_stop_draft_count > 0, 'a real Stop must produce drafts');
must(report.last_run_json === true && report.cwd_fallback === true && report.gap_diagnostics.length === 6, 'heartbeat and failure diagnostics');
must(report.private_session_content_shipped === false, 'private session content must not ship');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('stop shadow evidence passed: automatic scan, idempotent drafts, non-blocking, no verifier/run/close/verdict');
