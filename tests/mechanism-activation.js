'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const activation = require('../src/lib/mechanism-activation');
function must(condition, message) { if (!condition) throw new Error(message); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-activation-'));
const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
write(adapter, "'use strict'; process.stdout.write(JSON.stringify({ ok: true, input_sha256: '0'.repeat(64), output_sha256: '0'.repeat(64), exit_code: 0 }));\n");
write(path.join(repo, 'scripts', 'hook-gate.js'), 'module.exports = {};\n');
write(path.join(repo, 'verifiers.lock.json'), JSON.stringify({ schema_version: 'autoarmory/verifiers-lock/v1', verifiers: [{ id: 'fixture', kind: 'fixture', version: '1.0.0', invocation_contract_version: 'autoarmory/invocation-contract/v1', readonly: true, adapter: 'scripts/verify/fixture.js', adapter_sha256: sha256File(adapter), timeout_ms: 10000 }] }, null, 2) + '\n');
const base = {
  mechanism_id: 'mechanism-first',
  verifier_id: 'fixture',
  evidence_refs: ['message-1'],
  scope: { project: 'autoarmory', task_type: 'skill-optimization' },
  enforcement: { point: 'stop_hook', mode: 'block', coverage: 'none', entry: 'scripts/hook-gate.js' }
};
const advisory = activation.audit(base, { repo: repo });
must(advisory.status === 'candidate' && advisory.coverage === 'none', 'incomplete enforcement must remain candidate');
must(advisory.blockers.includes('enforcement_coverage_incomplete'), 'incomplete coverage must be named');
const noContract = activation.audit(Object.assign({}, base, { enforcement: Object.assign({}, base.enforcement, { coverage: 'complete' }) }), { repo: repo });
must(noContract.status === 'candidate' && noContract.blockers.includes('enforcement_entry_contract_missing'), 'an entry without enforceMechanism must not activate');
write(path.join(repo, 'scripts', 'hook-gate.js'), 'module.exports = { enforceMechanism: function () { return { decision: "block" }; } };\n');
const active = activation.audit(Object.assign({}, base, { enforcement: Object.assign({}, base.enforcement, { coverage: 'complete' }) }), { repo: repo });
must(active.status === 'active' && active.blockers.length === 0, 'complete enforcement with registered verifier and evidence must activate');
const missingVerifier = activation.audit(Object.assign({}, base, { verifier_id: 'missing', enforcement: Object.assign({}, base.enforcement, { coverage: 'complete' }) }), { repo: repo });
must(missingVerifier.status === 'candidate' && missingVerifier.blockers.includes('verifier_not_registered'), 'unregistered verifier must not activate');
const advisoryMode = activation.audit(Object.assign({}, base, { enforcement: Object.assign({}, base.enforcement, { mode: 'advisory', coverage: 'complete' }) }), { repo: repo });
must(advisoryMode.status === 'candidate' && advisoryMode.blockers.includes('enforcement_mode_not_block'), 'advisory mode must not activate');
const candidatesFile = path.join(repo, 'mechanism-candidates.jsonl');
write(candidatesFile, JSON.stringify(base) + '\n');
const cli = path.resolve(__dirname, '..', 'scripts', 'mechanism-activation.js');
const cliRun = require('child_process').spawnSync(process.execPath, [cli, '--repo', repo, '--candidates', candidatesFile, '--json'], { encoding: 'utf8' });
must(cliRun.status === 0, 'activation CLI must exit zero for a readable candidate report');
const cliReport = JSON.parse(cliRun.stdout);
must(cliReport.candidates[0].activation.status === 'candidate' && cliReport.candidates[0].activation.blockers.includes('enforcement_coverage_incomplete'), 'activation CLI must preserve candidate status');
console.log('mechanism activation tests passed: incomplete coverage stays candidate, complete block entry activates, missing verifier/advisory mode fail closed');
