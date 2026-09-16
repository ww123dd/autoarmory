#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const verify = require('../src/lib/verify');
const ROOT = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'verifiers.lock.json'), 'utf8'));
const rows = lock.verifiers.map(function (item) {
  const bridge = path.resolve(ROOT, item.bridge && item.bridge.adapter || '');
  const lines = fs.existsSync(bridge) ? fs.readFileSync(bridge, 'utf8').split(/\r?\n/).filter(function (line) { return line.trim() !== ''; }).length : null;
  const capture = verify.captureRefs([{ id: 'score-' + item.id, verifier: item.id, params: {} }], { repo: ROOT, trials: 1 });
  const pinnedPaths = [item.adapter].concat(item.bridge && item.bridge.adapter ? [item.bridge.adapter] : []).filter(Boolean);
  const tracked = pinnedPaths.every(function (relative) {
    return spawnSync('git', ['ls-files', '--error-unmatch', relative], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).status === 0;
  });
  const fresh = capture.refs && capture.refs[0] && capture.refs[0].fresh;
  return { id: item.id, kind: item.kind, bridge_lines: lines, tracked: tracked, status: capture.status, exit_code: fresh ? fresh.exit_code : null, observed: fresh ? fresh.observed : null, reason: capture.reason };
});
const report = { schema_version: 'autoarmory/verifier-scorecard/v1', generated_at: new Date().toISOString(), verifier_count: rows.length, rows: rows };
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1 && process.argv[outputIndex + 1]) {
  const file = path.resolve(process.argv[outputIndex + 1]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', 'utf8');
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');