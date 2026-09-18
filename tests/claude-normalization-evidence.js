'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'claude-normalization-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/claude-normalization-evidence/v1', 'Claude normalization evidence schema');
must(report.source_session === '1ac86d26-cd5b-4d24-ba94-a3bc69d6d46d', 'Claude source session');
must(report.raw_tool_use_count === 699 && report.normalized_tool_call_count === 699, 'Claude tool_use counts must match');
must(report.raw_tool_result_count === 699 && report.normalized_tool_output_count === 699, 'Claude tool_result counts must match');
must(report.silent_zero === false && report.fail_closed_exit_code === 0 && report.negative_control_exit_code === 2, 'silent zero and fail-closed contract');
must(report.normalized_event_count > 0 && report.private_session_content_shipped === false, 'normalized events and privacy boundary');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('Claude normalization evidence passed: 699/699 raw and normalized tool events, silent_zero=false, fail-closed negative control=2');