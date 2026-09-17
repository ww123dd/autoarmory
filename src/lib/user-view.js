'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonl } = require('./util');
const mechanism = require('./mechanism');
const stateLib = require('./state');
const artifact = require('./artifact');

function read(file) { return fs.existsSync(file) ? readJsonl(file) : []; }
function files(stateDir) {
  return {
    candidates: path.join(stateDir, 'candidates.jsonl'),
    transitions: path.join(stateDir, 'transitions.jsonl'),
    cases: path.join(stateDir, 'cases.jsonl'),
    mechanisms: path.join(stateDir, 'mechanisms.jsonl'),
    runs: path.join(stateDir, 'mechanism-runs.jsonl')
  };
}
function caseCard(candidate) {
  return {
    schema_version: 'autoarmory/result-card/v1',
    id: candidate.id,
    case: { id: candidate.id, title: candidate.title || candidate.action || candidate.target && candidate.target.id || candidate.id, expected_transition: candidate.expected_transition || null },
    verifier: null,
    run: null,
    lifetime: { state: 'pending', reason: 'awaiting operator approval' },
    action: 'approve'
  };
}
function mechanismCard(stateDir, item, options) {
  const state = files(stateDir);
  const runs = read(state.runs).filter(function (run) { return run.mechanism_id === item.id; });
  const latest = runs.slice().sort(function (a, b) { return Date.parse(a.finished_at || a.recorded_at || 0) - Date.parse(b.finished_at || b.recorded_at || 0); }).pop() || null;
  const cases = read(state.cases);
  const caseRecord = latest ? cases.find(function (entry) { return entry.id === latest.case_id; }) : null;
  let current = null;
  try { current = mechanism.status(stateDir, item.id, options); } catch (error) { current = { ok: false, status: 'unknown', reason: error.message }; }
  const life = mechanism.lifecycle(stateDir, item.id);
  let lifetimeState = 'pending';
  if (life.to === 'retired') lifetimeState = 'revoked';
  else if (current.status === 'verified' || current.status === 'closed') lifetimeState = 'approved';
  else if (current.status === 'expired') lifetimeState = 'expired';
  else if (current.status === 'bypassed') lifetimeState = 'attention';
  const action = lifetimeState === 'pending' ? 'approve' : (lifetimeState === 'approved' ? 'none' : 'review');
  return {
    schema_version: 'autoarmory/result-card/v1',
    id: caseRecord ? caseRecord.id : item.id,
    case: caseRecord ? { id: caseRecord.id, title: caseRecord.title, expected_transition: caseRecord.expected_transition } : { id: item.id, title: item.name, expected_transition: null },
    verifier: { id: item.verifier_id, status: current.status || 'unknown', reason: current.reason || null },
    run: latest ? { id: latest.id, result: latest.result || null, exit_code: Number.isInteger(latest.exit_code) ? latest.exit_code : null, input_sha256: latest.input_sha256 || null, output_sha256: latest.output_sha256 || null, finished_at: latest.finished_at || latest.recorded_at || null } : null,
    lifetime: { state: lifetimeState, reason: current.reason || (life.to ? 'lifecycle=' + life.to : 'no lifecycle record'), at: life.at || null },
    action: action
  };
}
function artifactCard(record) {
  return {
    schema_version: 'autoarmory/result-card/v1',
    id: record.artifact_id,
    case: null,
    verifier: null,
    run: null,
    lifetime: { state: 'intaken', reason: 'artifact has no case and no verifier yet' },
    action: 'bind'
  };
}
function allCards(stateDir, options) {
  const state = files(stateDir);
  const candidates = read(state.candidates);
  const transitions = read(state.transitions);
  const pending = candidates.filter(function (item) { return stateLib.currentState(transitions, item.id, item.status || 'candidate') === 'pending_approval'; }).map(caseCard);
  const mechanisms = read(state.mechanisms).map(function (item) { return mechanismCard(stateDir, item, options || {}); });
  const latestArtifacts = new Map();
  for (const item of artifact.readArtifacts(stateDir)) if (!item.case_id) latestArtifacts.set(item.artifact_id, item);
  const artifacts = Array.from(latestArtifacts.values());
  return { pending: pending, mechanisms: mechanisms, artifacts: artifacts };
}
function inbox(stateDir, options) {
  const all = allCards(stateDir, options);
  return {
    schema_version: 'autoarmory/inbox/v1',
    pending: all.pending,
    results: all.mechanisms.filter(function (card) { return card.lifetime.state === 'approved' || card.lifetime.state === 'attention'; }),
    expired_or_revoked: all.mechanisms.filter(function (card) { return card.lifetime.state === 'expired' || card.lifetime.state === 'revoked'; }),
    unbound_artifacts: all.artifacts.map(artifactCard)
  };
}
function status(stateDir, options) {
  const all = allCards(stateDir, options);
  const cards = all.mechanisms.concat(all.pending);
  const count = function (name) { return cards.filter(function (card) { return card.lifetime.state === name; }).length; };
  return { schema_version: 'autoarmory/status/v1', pending: count('pending'), approved: count('approved'), attention: count('attention'), expired: count('expired'), revoked: count('revoked'), unbound_artifacts: all.artifacts.length };
}
function result(stateDir, id, options) {
  const all = allCards(stateDir, options);
  const candidates = all.pending.concat(all.mechanisms);
  const hit = candidates.find(function (card) { return card.id === id || (card.run && card.run.id === id); });
  if (hit) return { ok: true, card: hit };
  const record = artifact.readArtifacts(stateDir).filter(function (item) { return item.artifact_id === id; }).pop();
  if (record) return { ok: true, card: artifactCard(record) };
  return { ok: false, errors: ['no case, run or artifact found for ' + id] };
}

module.exports = { inbox, status, result };