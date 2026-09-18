'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readJsonl } = require('../src/lib/util');
const merge = require('../src/lib/state-merge');
function must(c, m) { if (!c) throw new Error(m); }
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-state-merge-'));
const target = path.join(temp, 'root');
const legacyPhaseA = path.join(temp, 'phase-a-like');
const legacySelfforge = path.join(temp, 'selfforge-like');
fs.mkdirSync(target, { recursive: true });
fs.mkdirSync(legacyPhaseA, { recursive: true });
fs.mkdirSync(path.join(legacyPhaseA, 'reuse-records'), { recursive: true });
fs.mkdirSync(legacySelfforge, { recursive: true });
fs.writeFileSync(path.join(target, 'cases.jsonl'), JSON.stringify({ id: 'case-1', title: 'kept-from-target' }) + '\n', 'utf8');
fs.writeFileSync(path.join(legacyPhaseA, 'cases.jsonl'), JSON.stringify({ id: 'case-1', title: 'duplicate-from-source' }) + '\n' + JSON.stringify({ id: 'case-2', title: 'first-real-decision' }) + '\n', 'utf8');
fs.writeFileSync(path.join(legacyPhaseA, 'reuse-records', 'change-2.json'), JSON.stringify({ change_id: 'change-2', status: 'closed' }) + '\n', 'utf8');
fs.writeFileSync(path.join(legacySelfforge, 'cases.jsonl'), JSON.stringify({ id: 'case-3', title: 'operator-legacy' }) + '\n', 'utf8');

const report = merge.mergeRoots(target, [legacyPhaseA, legacySelfforge]);
must(report.ok, 'merge must succeed');
const cases = readJsonl(path.join(target, 'cases.jsonl'));
must(cases.length === 3 && cases[0].title === 'kept-from-target' && cases.some(function (row) { return row.id === 'case-2'; }), 'target rows win and legacy rows append by id');
must(report.reuse_records.added === 1 && fs.existsSync(path.join(target, 'reuse-records', 'change-2.json')), 'missing reuse-record must be copied by change_id');

const before = fs.readFileSync(path.join(target, 'cases.jsonl'), 'utf8');
const rerun = merge.mergeRoots(target, [legacyPhaseA, legacySelfforge]);
must(rerun.ledgers.every(function (ledger) { return ledger.added === 0 && !ledger.changed; }), 'second merge must be a no-op');
must(rerun.reuse_records.added === 0, 'second merge must not copy reuse-records again');
must(fs.readFileSync(path.join(target, 'cases.jsonl'), 'utf8') === before, 'target bytes must stay identical on rerun');
console.log('state merge tests passed: union by id, target rows win, idempotent rerun, reuse-record copy');
