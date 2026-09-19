'use strict';
const priority = require('../src/lib/priority-engine');
function must(condition, message) { if (!condition) throw new Error(message); }
const report = priority.prioritize({
  scorecard: { rows: [
    { verifier_id: 'good', correct_count: 3, overturned_count: 0, reopen_count: 0, false_close_count: 0, sample_size: 3, earned_candidate: true },
    { verifier_id: 'bad', correct_count: 3, overturned_count: 1, reopen_count: 0, false_close_count: 1, sample_size: 4, earned_candidate: false }
  ] },
  tripwire: { ok: true, verifiers: [{ verifier_id: 'good', passed: true }, { verifier_id: 'bad', passed: true }] },
  claims: [
    { change_id: 'ready-good', disposition: 'ready_for_verifier', verifier_candidate: { ref: 'good' } },
    { change_id: 'ready-bad', disposition: 'ready_for_verifier', verifier_candidate: { ref: 'bad' } }
  ]
});
must(report.verifiers.find(function (row) { return row.verifier_id === 'good'; }).action === 'earned', 'good verifier must earn');
must(report.verifiers.find(function (row) { return row.verifier_id === 'bad'; }).action === 'manual', 'overturned verifier must return to manual');
must(report.next_claims[0].change_id === 'ready-good', 'priority must order earned verifier claims first');
console.log('priority engine tests passed: earned/manual projection and claim ordering');