#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, printJson, readJsonlStrict } = require('../src/lib/util');
const checker = require('../src/lib/exec-retry-storm');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
const records = path.resolve(args.records || path.join(args.state || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow'), 'change-inspector', 'change-records.jsonl'));
if (!fs.existsSync(records)) fail('change records not found: ' + records);
let rows;
try { rows = readJsonlStrict(records); } catch (error) { fail('change records unreadable: ' + error.message); }
const report = checker.fromChangeRecords(rows, { threshold: Number(args.threshold || 3) });
report.generated_at = new Date().toISOString();
report.records_file = records;
report.negative_control = checker.analyze([
  { signature: 'sig-a', observed: 'a' },
  { signature: 'sig-b', observed: 'b' },
  { signature: 'sig-a', observed: 'a' },
  { signature: 'sig-b', observed: 'b' }
], { threshold: report.threshold }).should_have_stopped ? 'FAIL' : 'pass';
report.ok = report.false_positive_on_count_two === 0 && report.negative_control === 'pass';
if (args.out) {
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2) + '\n', 'utf8');
}
if (args.json) printJson(report);
else process.stdout.write('retry-storm replay: positive_sessions=' + report.positive_sessions + ' count2=' + report.count_two_signatures + ' false_positive_count2=' + report.false_positive_on_count_two + '\n');
process.exit(report.ok ? 0 : 1);
