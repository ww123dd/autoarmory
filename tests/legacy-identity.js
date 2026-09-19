'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const identity = require('../src/lib/legacy-identity');
function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-legacy-identity-'));
const state = path.join(root, 'state');
fs.mkdirSync(path.join(state, 'reuse-records'), { recursive: true });
fs.writeFileSync(path.join(state, 'reuse-records', 'legacy.json'), JSON.stringify({ change_id: 'legacy', status: 'closed', run: { result: 'pass' } }) + '\n', 'utf8');
fs.writeFileSync(path.join(state, 'reuse-records', 'complete.json'), JSON.stringify({ change_id: 'complete', status: 'closed', claim_sha256: 'a', expected_sha256: 'b', claim_instance: {}, expected_provenance: 'pinned_verifier' }) + '\n', 'utf8');
const dry = identity.audit(state, {});
must(dry.missing === 1 && dry.present === 1, 'identity audit must classify legacy and complete records');
const report = identity.audit(state, { apply: true });
const legacy = JSON.parse(fs.readFileSync(path.join(state, 'reuse-records', 'legacy.json'), 'utf8'));
const complete = JSON.parse(fs.readFileSync(path.join(state, 'reuse-records', 'complete.json'), 'utf8'));
must(report.missing === 1 && legacy.status === 'closed' && legacy.claim_identity_status === 'missing', 'legacy identity must be marked missing without changing status');
must(complete.claim_identity_status === 'present' && complete.claim_sha256 === 'a', 'complete identity must be marked present without changing claim');
console.log('legacy identity tests passed: missing/present audit, status unchanged, no guessed identity');