'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtureHelper = require('./helpers/mechanism-fixture');
const ledger = require('../src/lib/outcome-ledger');
function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-outcome-ledger-'));
const fixture = fixtureHelper.createFixture(root, 'outcome');
fixtureHelper.registerCaseAndMechanism(fixture);
const run = fixtureHelper.recordRun(fixture, 'run-outcome');
const closure = fixtureHelper.closeRun(fixture, run);
const reuse = fixtureHelper.reuseRecord(fixture, 'change-outcome', { run: run, closure: closure });
const accepted = ledger.recordOutcome(fixture.state, { decision_id: reuse.decision_id, type: 'accepted', actor: 'user', source: 'user', reason: 'operator accepted the verdict' });
must(accepted.decision_id === reuse.decision_id && accepted.claim_sha256 && accepted.verifier_id === 'fixture' && accepted.type === 'accepted', 'outcome must link back to decision and claim');
const overturned = ledger.recordOutcome(fixture.state, { decision_id: reuse.decision_id, type: 'overturned', actor: 'user', source: 'user_correction', reason: 'approved value changed' });
must(overturned.type === 'overturned' && overturned.evidence_ref, 'overturn must carry evidence reference');
must(ledger.readOutcomes(fixture.state).length === 2, 'outcome ledger must append both events');
let threw = false;
try { ledger.recordOutcome(fixture.state, { decision_id: reuse.decision_id, type: 'accepted', actor: 'agent', source: 'llm_judge', reason: 'agent inferred' }); } catch (_) { threw = true; }
must(threw, 'LLM/agent-inferred outcomes must be rejected');
console.log('outcome ledger tests passed: decision/claim linkage, accepted/overturned append, LLM source rejected');