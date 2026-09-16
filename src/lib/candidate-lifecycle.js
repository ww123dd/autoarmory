'use strict';

// Candidate-side lifecycle: a promotion is only as good as the outcome evidence it rested
// on. When that evidence names artifacts by hash and those bytes no longer reproduce, the
// promotion has to be retired with the fact that forced it - the same rule mechanisms got
// in 0.5, applied to the candidate state machine.
//
// Honest scope: only artifact evidence with a sha256 is recomputable. Evidence that carries
// before/after observations and no hashed artifact is reported as `uncovered`; it is never
// counted as fresh, and it is never retired automatically, because nothing can be
// re-derived from it.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJsonl, writeJsonl, sha256 } = require('./util');
const state = require('./state');

function files(stateDir) {
  return { transitions: path.join(stateDir, 'transitions.jsonl') };
}
function read(file) { return fs.existsSync(file) ? readJsonl(file) : []; }

function latestTransition(records, candidateId, to) {
  const rows = records.filter(function (item) {
    return item.candidate_id === candidateId && (!to || item.to === to);
  });
  return rows.length ? rows[rows.length - 1] : null;
}

function artifactFreshness(evidence, options) {
  const opts = options || {};
  const repo = path.resolve(opts.repo || '.');
  const artifacts = evidence && Array.isArray(evidence.artifacts) ? evidence.artifacts : [];
  const hashed = artifacts.filter(function (item) { return item && item.path && item.sha256; });
  const uncovered = artifacts.length - hashed.length;
  const mismatches = [];
  for (const artifact of hashed) {
    const full = path.resolve(repo, artifact.path);
    if (full !== repo && full.indexOf(repo + path.sep) !== 0) {
      mismatches.push({ path: artifact.path, expected: artifact.sha256, actual: null, error: 'artifact escapes the repository' });
      continue;
    }
    if (!fs.existsSync(full)) {
      mismatches.push({ path: artifact.path, expected: artifact.sha256, actual: null, error: 'artifact missing' });
      continue;
    }
    const actual = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    if (actual !== artifact.sha256) mismatches.push({ path: artifact.path, expected: artifact.sha256, actual: actual });
  }
  return { repo: repo, artifacts: artifacts.length, covered: hashed.length, uncovered: uncovered, ok: hashed.length > 0 && mismatches.length === 0, mismatches: mismatches };
}

function staleEscapes(records, options) {
  const candidates = Array.from(new Set((records || []).map(function (item) { return item.candidate_id; })));
  const details = [];
  let escapes = 0;
  let uncovered = 0;
  for (const candidateId of candidates) {
    const current = state.currentState(records, candidateId, 'candidate');
    if (current !== 'promoted') continue;
    const promoting = latestTransition(records, candidateId, 'promoted');
    const freshness = artifactFreshness(promoting && promoting.evidence, options);
    if (!freshness.covered) { uncovered += 1; details.push({ candidate_id: candidateId, state: current, freshness: freshness, uncovered_reason: 'no hashed artifact to recompute' }); continue; }
    if (!freshness.ok) { escapes += 1; details.push({ candidate_id: candidateId, state: current, freshness: freshness }); }
  }
  return { escapes: escapes, uncovered: uncovered, details: details };
}

function rollbackStale(stateDir, options) {
  const opts = options || {};
  const file = files(stateDir).transitions;
  const records = read(file);
  const report = staleEscapes(records, opts);
  const appended = [];
  for (const detail of report.details) {
    if (!detail.freshness || detail.freshness.covered === 0 || detail.freshness.ok) continue;
    const already = records.concat(appended).some(function (item) {
      return item.candidate_id === detail.candidate_id && item.to === 'retired' && item.forced_by && item.forced_by.artifact_mismatches;
    });
    if (already) continue;
    const at = new Date().toISOString();
    const record = {
      schema_version: 'selfforge/transition/v1',
      id: 'tr-rb-' + sha256(detail.candidate_id + ':' + at).slice(0, 12),
      candidate_id: detail.candidate_id,
      actor: opts.actor || 'codex',
      from: 'promoted',
      to: 'retired',
      reason: 'promoted candidate lost its evidence: ' + detail.freshness.mismatches.map(function (item) { return item.path; }).join(', '),
      gate: null,
      approval: null,
      consumption: null,
      evidence: null,
      forced_by: {
        kind: 'artifact_hash_mismatch',
        artifact_mismatches: detail.freshness.mismatches,
        covered: detail.freshness.covered,
        uncovered: detail.freshness.uncovered
      },
      environment: null,
      at: at
    };
    appended.push(record);
  }
  if (appended.length) {
    fs.mkdirSync(stateDir, { recursive: true });
    writeJsonl(file, records.concat(appended));
  }
  return { ok: true, rolled_back: appended.length, records: appended, escapes_before: report.escapes, uncovered: report.uncovered, escapes_after: staleEscapes(records.concat(appended), opts).escapes };
}

module.exports = { files, artifactFreshness, staleEscapes, rollbackStale };