'use strict';
const compiler = require('../src/lib/mechanism-candidate-compiler');
function must(condition, message) { if (!condition) throw new Error(message); }
const rows = compiler.compile([{ sediment_id: 's1', decision: 'absorb', target_skill: 'vibe-coding', proposed_change: '把验证缺口落地为混合态检查', absorb_parts: ['验证缺口'], evidence_refs: ['m1'] }]);
must(rows.length === 1 && rows[0].failure_mode === 'single_clean_condition_vs_mixed_state', 'mixed-state sediment must compile to the expected failure mode');
must(rows[0].verifier_id === 'verification-gap' && rows[0].enforcement.point === 'stop_hook' && rows[0].enforcement.entry === 'src/lib/hook-gate.js' && rows[0].enforcement.mode === 'advisory', 'first mechanism must reference verifier and remain advisory until coverage is complete');
console.log('mechanism candidate compiler tests passed: sediment -> candidate mechanism with enforced status boundary');
