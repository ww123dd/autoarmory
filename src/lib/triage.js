'use strict';

const CATEGORIES = ['must_fix_now', 'backlog', 'only_if_decision_impact', 'do_not_do', 'needs_evidence'];
const NOW_KINDS = ['external_red', 'safety_boundary', 'data_error', 'live_fact_conflict', 'stale_verdict', 'verification_mismatch', 'security_violation', 'evidence_mismatch'];
const BACKLOG_KINDS = ['missing_consumer', 'missing_stop_condition', 'missing_outsourcing_target'];
const LOW_IMPACT_KINDS = ['naming', 'documentation', 'version', 'format', 'extra_evidence'];
const hasEvidence = function (item) { return Array.isArray(item && item.evidence_refs) && item.evidence_refs.length > 0; };
const includes = function (list, value) { return Array.isArray(list) && list.indexOf(value) !== -1; };

function classifyFinding(finding) {
  const item = finding || {};
  const source = item.source_decision_id || item.source_decision || item.id || null;
  const reasons = [];
  const evidenceRefs = Array.isArray(item.evidence_refs) ? item.evidence_refs : [];
  if (!source) reasons.push('source_decision_id is required');
  if (!hasEvidence(item)) reasons.push('evidence_refs are required before a finding can be classified');
  const nowKind = NOW_KINDS.indexOf(item.kind) !== -1;
  const nowFlag = item.external_red === true || item.safety_boundary === true || item.data_error === true || item.live_fact_conflict === true || item.conflicts_with_live_fact === true;
  const backlogKind = BACKLOG_KINDS.indexOf(item.kind) !== -1 || includes(item.missing, 'consumer') || includes(item.missing, 'stop_condition') || includes(item.missing, 'outsourcing_target');
  const lowImpactKind = LOW_IMPACT_KINDS.indexOf(item.kind) !== -1 || LOW_IMPACT_KINDS.indexOf(item.change_type) !== -1;
  const theoretical = item.theoretical_completeness === true || item.kind === 'theoretical_completeness';

  if (nowKind || nowFlag) {
    return {
      id: item.id || null, source_decision_id: source, category: hasEvidence(item) ? 'must_fix_now' : 'needs_evidence',
      reasons: reasons.concat([nowKind ? 'external/safety/data/live-fact signal' : 'hard external boundary flag']),
      evidence_refs: evidenceRefs
    };
  }
  if (backlogKind) {
    return { id: item.id || null, source_decision_id: source, category: 'backlog', reasons: reasons.concat(['missing consumer, stop condition or outsourcing target']), evidence_refs: evidenceRefs };
  }
  if (theoretical) {
    return { id: item.id || null, source_decision_id: source, category: 'do_not_do', reasons: reasons.concat(['theoretical completeness has no real decision consumer']), evidence_refs: evidenceRefs };
  }
  if (lowImpactKind) {
    return {
      id: item.id || null, source_decision_id: source,
      category: item.decision_impact === true ? 'must_fix_now' : 'only_if_decision_impact',
      reasons: reasons.concat([item.decision_impact === true ? 'low-impact change has a recorded decision impact' : 'low-impact change without a real decision impact']),
      evidence_refs: evidenceRefs
    };
  }
  return { id: item.id || null, source_decision_id: source, category: 'needs_evidence', reasons: reasons.concat(['no deterministic triage rule matched']), evidence_refs: evidenceRefs };
}

function triage(findings) {
  const decisions = (findings || []).map(classifyFinding);
  const counts = { must_fix_now: 0, backlog: 0, only_if_decision_impact: 0, do_not_do: 0, needs_evidence: 0 };
  for (const decision of decisions) counts[decision.category] += 1;
  return {
    schema_version: 'autoarmory/triage/v1',
    total: decisions.length,
    counts: counts,
    blocking_count: counts.must_fix_now + counts.needs_evidence,
    decisions: decisions
  };
}

module.exports = { CATEGORIES, classifyFinding, triage };