'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const clusters = require('../src/lib/no-capability-clusters');
function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-no-cap-clusters-'));
const state = path.join(root, 'state');
fs.mkdirSync(path.join(state, 'decision-scan'), { recursive: true });
const rows = [
  { change_id: 'c1', session_id: 's1', changed_files: ['a.js'], commands: ['node tests/a.js'], signals: ['check_gap'], expected_provenance: 'baseline_manifest', claim_shape: { transition: 'FAIL->PASS', artifact_type: 'file' } },
  { change_id: 'c2', session_id: 's2', changed_files: ['b.js'], commands: ['node tests/b.js'], signals: ['check_gap'], expected_provenance: 'baseline_manifest', claim_shape: { transition: 'FAIL->PASS', artifact_type: 'file' } },
  { change_id: 'c3', session_id: 's3', changed_files: ['schema.sql'], commands: ['SELECT count(*) FROM t'], signals: ['risk_signal'], expected_provenance: 'owner_approval', claim_shape: { transition: 'COUNT->0', artifact_type: 'doris-table', access_required: true } }
];
fs.writeFileSync(path.join(state, 'decision-scan', 'no-capability.jsonl'), rows.map(function (row) { return JSON.stringify(row); }).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(state, 'decision-scan', 'decision-drafts.jsonl'), rows.concat([{ change_id: 'ready' }]).map(function (row) { return JSON.stringify(row); }).join('\n') + '\n', 'utf8');
const report = clusters.cluster(state);
must(report.total_no_capability === 3 && report.total_decision_drafts === 4, 'cluster input counts must be exact');
must(report.cluster_count === 2 && report.clusters[0].size === 2, 'similar command families must cluster together');
must(report.clusters[0].mechanical_feasibility === 'high' && report.clusters[1].access_required === true, 'cluster feasibility/access must be mechanical');
must(report.no_capability_rate === 0.75 && report.top10_coverage === 1, 'cluster metrics must be computed');
must(clusters.writeReport(state, report) && fs.existsSync(path.join(state, 'decision-scan', 'no-capability-clusters.json')), 'cluster report must be writable');
console.log('no capability cluster tests passed: mechanical clustering, coverage/rate metrics, exemplars');