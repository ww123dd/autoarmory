'use strict';
const crypto = require('crypto');
const precheck = require('./mechanism-precheck');
function compile(sediments) {
  return (Array.isArray(sediments) ? sediments : []).filter(function (item) { return item && item.decision === 'absorb'; }).map(function (item) {
    const text = [item.proposed_change].concat(item.absorb_parts || []).filter(Boolean).join('\n');
    const mixed = /验证缺口|混合态|单一干净|单一条件/.test(text);
    const gate = precheck.evaluate(item);
    return {
      schema_version: 'autoarmory/mechanism-candidate/v1',
      mechanism_id: 'mechanism-candidate-' + crypto.createHash('sha256').update(item.sediment_id + ':' + (item.proposed_change || '')).digest('hex').slice(0, 16),
      sediment_id: item.sediment_id,
      domain: item.target_skill,
      trigger: mixed ? ((item.mechanism_parts && item.mechanism_parts[0]) || 'skill modification claims completion without mixed-state verification') : (item.proposed_change || 'skill sediment requires review'),
      failure_mode: mixed ? 'single_clean_condition_vs_mixed_state' : 'unspecified_skill_gap',
      expected_transition: mixed ? 'UNVERIFIED->CHECKED' : 'UNKNOWN->CHECKED',
      required_action: mixed ? 'run an independent mixed-state verification before claiming completion' : 'review the sediment before activation',
      verifier_id: mixed ? 'verification-gap' : null,
      enforcement: { point: mixed ? 'stop_hook' : null, entry: mixed ? 'src/lib/hook-gate.js' : null, mode: mixed ? 'advisory' : 'advisory', coverage: 'none' },
      scope: { project: 'autoarmory', task_type: 'skill-optimization', environment: 'codex-local', artifact_type: 'skill' },
      expires_at: null,
      reopen_trigger: [{ kind: 'case_changed' }],
      evidence_refs: item.evidence_refs || [],
      severity: item.severity || null,
      lower_layer_options: item.lower_layer_options || [],
      why_lower_layer_insufficient: item.why_lower_layer_insufficient || null,
      mechanism_jurisdiction: item.mechanism_jurisdiction || null,
      outside_funnel_risk: item.outside_funnel_risk || null,
      owner: item.owner || null,
      consumer: item.consumer || null,
      enforcement: Object.assign({ point: mixed ? 'stop_hook' : null, entry: mixed ? 'src/lib/hook-gate.js' : null, mode: 'advisory', coverage: 'none' }, item.enforcement || {}),
      precheck: gate,
      status: gate.status === 'accepted' ? 'candidate' : (gate.status === 'advisory' ? 'advisory' : 'draft')
    };
  });
}
module.exports = { compile };
