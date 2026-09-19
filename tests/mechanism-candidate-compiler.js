'use strict';
const compiler = require('../src/lib/mechanism-candidate-compiler');
function must(condition, message) { if (!condition) throw new Error(message); }
const rows = compiler.compile([{ sediment_id: 's1', decision: 'absorb', target_skill: 'vibe-coding', proposed_change: '把验证缺口落地为混合态检查', absorb_parts: ['验证缺口'], evidence_refs: ['m1'] }]);
must(rows.length === 1 && rows[0].failure_mode === 'single_clean_condition_vs_mixed_state', 'mixed-state sediment must compile to the expected failure mode');
must(rows[0].verifier_id === 'verification-gap' && rows[0].enforcement.point === 'stop_hook' && rows[0].enforcement.entry === 'src/lib/hook-gate.js' && rows[0].enforcement.mode === 'advisory', 'first mechanism must reference verifier and remain advisory until coverage is complete');
must(rows[0].status === 'draft' && rows[0].precheck.status === 'rejected_missing', 'missing mechanism precheck must remain draft');
const ready = compiler.compile([{ sediment_id: 's2', decision: 'absorb', target_skill: 'vibe-coding', proposed_change: '把验证缺口落地为混合态检查', absorb_parts: ['验证缺口'], evidence_refs: ['m2'], severity: 'must_fix_now', lower_layer_options: ['template', 'code_test', 'structural_gate'], why_lower_layer_insufficient: '外部事实会漂移，低层静态方案不能持续复算', mechanism_jurisdiction: { external_fact_drifts: true, reusable: true, lifetime_accounting: true, enforcement_required: true }, outside_funnel_risk: '合取饿死导致高信号长期不可见' }]);
must(ready[0].status === 'candidate' && ready[0].precheck.status === 'accepted', 'complete precheck must produce candidate');
console.log('mechanism candidate compiler tests passed: sediment -> candidate mechanism with enforced status boundary');
