'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const decisionScan = require('../src/lib/decision-scan');

function must(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-decision-scan-'));
const state = path.join(root, 'state');
const repo = path.join(root, 'repo');
fs.mkdirSync(repo, { recursive: true });
write(path.join(state, 'owners.json'), JSON.stringify({ owners: {} }) + '\n');

const classified = decisionScan.scanDrafts([
  { change_id: 'ready', owner: 'team-a', expected_transition: 'COUNT->0', commands: ['node tests/run.js'], changed_files: [], signals: ['check_gap'], change_record_ids: ['r1'] },
  { change_id: 'owner-missing', expected_transition: 'COUNT->0', commands: ['node tests/run.js'], changed_files: [], signals: ['check_gap'] },
  { change_id: 'access', owner: 'team-a', expected_transition: 'COUNT->0', commands: ['SELECT count(*) FROM t'], changed_files: [], signals: ['check_gap'] },
  { change_id: 'transition', owner: 'team-a', commands: ['node tests/run.js'], changed_files: [], signals: ['check_gap'] }
], { stateDir: state, repo: repo });
must(classified[0].disposition === 'ready_for_verifier', 'mechanical verifier + owner + transition must be ready');
must(classified[1].reason_codes.indexOf('blocked_by_owner') !== -1, 'missing owner must block by owner');
must(classified[2].reason_codes.indexOf('blocked_by_access') !== -1, 'SQL candidate must block by access');
must(classified[3].disposition === 'unverifiable' && classified[3].reason_codes.indexOf('expected_transition_missing') !== -1, 'missing transition must stay unverifiable');

const empty = decisionScan.scan(path.join(root, 'empty'), { repo: repo, apply: true });
must(empty.insufficient_real_stream === true && empty.draft_count === 0, 'empty stream must not invent drafts');
must(!fs.existsSync(path.join(root, 'empty', 'decision-scan')), 'insufficient stream must not write a nomination projection');

write(path.join(state, 'change-inspector', 'change-records.jsonl'), JSON.stringify({ id: 'r1', session_id: 's1', turn_id: 't1', signal: 'risk_signal', source: { event_id: 'm1', line: 1 }, detail: { command: 'node tests/run.js', file_paths: ['a.js'] } }) + '\n');
const report = decisionScan.scan(state, { repo: repo, apply: true, limit: 10 });
must(report.candidate_count === 1 && report.draft_count === 1 && report.unverifiable_count === 1, 'real change record must produce one incomplete draft');
must(report.drafts[0].expected_transition === null && report.drafts[0].reason_codes.indexOf('expected_transition_missing') !== -1, 'first pass must not fabricate expected_transition');
must(fs.existsSync(path.join(state, 'decision-scan', 'decision-drafts.jsonl')), 'apply must write the draft projection');
must(!fs.existsSync(path.join(state, 'pending')), 'decision-scan must not activate pending jobs');
console.log('decision scan tests passed: nomination classifications, insufficient stream, no activation');