'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const script = path.join(__dirname, '..', 'scripts', 'mechanism-preflight.js');
function must(condition, message) { if (!condition) throw new Error(message); }
function run(cwd, state) { return spawnSync(process.execPath, [script], { cwd: cwd, env: Object.assign({}, process.env, { AUTOARMORY_STATE: state }), encoding: 'utf8' }); }
let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-mechanism-preflight-'));
const state = path.join(dir, '.selfforge');
fs.mkdirSync(state, { recursive: true });
fs.writeFileSync(path.join(state, 'mechanisms.jsonl'), JSON.stringify({ schema_version: 'autoarmory/mechanism/v1', id: 'mech-debt', name: 'Debt guard', covered_failure_modes: ['drift'], trigger: 't', action: 'a', verification: 'v', verifier_id: 'fixture', closure_criteria: 'c', owner: 'codex', version: '1.0.0' }) + '\n');
let result = run(dir, state);
must(result.status === 2 && /MECHANISM_PREFLIGHT_BLOCK/.test(result.stderr) && /mech-debt/.test(result.stderr), 'unverified mechanism must block preflight');
dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-mechanism-preflight-empty-'));
result = run(dir, path.join(dir, '.selfforge'));
must(result.status === 0, 'missing mechanism state must be a no-op');
console.log('mechanism preflight tests passed: unverified=BLOCK, no-state=no-op');
