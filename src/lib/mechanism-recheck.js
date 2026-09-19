'use strict';
const fs = require('fs');
const path = require('path');
const mechanism = require('./mechanism');
const { readJsonl, writeJson, writeJsonl } = require('./util');
const historyRunner = require('./history-runner');
const priorityEngine = require('./priority-engine');

function reuseForMechanism(stateDir, mechanismId) {
  const root = path.join(stateDir, 'reuse-records');
  if (!fs.existsSync(root)) return null;
  for (const name of fs.readdirSync(root).filter(function (item) { return /\.json$/i.test(item); })) {
    try {
      const record = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
      const recordMechanism = record.mechanism_id || (record.run && record.run.mechanism_id) || null;
      if (recordMechanism === mechanismId) return record;
    } catch (_) {}
  }
  return null;
}
function hasClaimIdentity(record) {
  return !!(record && record.change_id && record.claim_sha256 && record.expected_sha256 && record.claim_instance && record.expected_provenance);
}
function pendingJob(mechanismRecord, record) {
  return {
    schema_version: 'autoarmory/pending-change/v1',
    change_id: record.change_id,
    session_id: record.session_id || null,
    turn_id: record.turn_id || null,
    source_message_id: record.source_message_id || null,
    changed_files: [],
    commands: [],
    signals: ['mechanism_recheck'],
    expected_transition: record.expected_transition || 'RECHECK->PASS',
    claim_instance: record.claim_instance,
    expected_value: record.expected_value,
    expected_provenance: record.expected_provenance,
    verifier_id: mechanismRecord.verifier_id,
    owner: mechanismRecord.owner || null,
    action_class: null
  };
}
function recheck(stateDir, options) {
  const opts = options || {};
  const root = path.resolve(stateDir || opts.state || '.');
  const repo = path.resolve(opts.repo || '.');
  const mechanisms = readJsonl(path.join(root, 'mechanisms.jsonl'));
  const pendingDir = path.join(root, 'pending');
  const rows = [];
  let pendingWritten = 0, alreadyPending = 0, noAction = 0, blocked = 0;
  for (const item of mechanisms) {
    if (!item || !item.id) continue;
    const current = mechanism.status(root, item.id, { repo: repo });
    let action = 'none';
    let reason = current.reason || null;
    if (current.ok && ['verified', 'closed'].indexOf(current.status) !== -1) action = 'none';
    else if (!current.ok) { action = 'blocked_by_claim_identity'; reason = (current.errors || []).join('; '); blocked += 1; }
    else {
      const record = reuseForMechanism(root, item.id);
      if (!hasClaimIdentity(record)) { action = 'blocked_by_claim_identity'; reason = 'reuse-record has no claim instance/provenance'; blocked += 1; }
      else {
        const job = pendingJob(item, record);
        const file = path.join(pendingDir, record.change_id + '.json');
        if (fs.existsSync(file)) { action = 'already_pending'; alreadyPending += 1; }
        else if (opts.apply === true) { writeJson(file, job); action = 'pending_written'; pendingWritten += 1; }
        else { action = 'would_write_pending'; pendingWritten += 1; }
      }
    }
    if (action === 'none') noAction += 1;
    rows.push({ schema_version: 'autoarmory/mechanism-recheck/v1', at: new Date().toISOString(), mechanism_id: item.id, verifier_id: item.verifier_id || null, status: current.status || null, action: action, reason: reason, authority: 'registered_verifier_only' });
  }
  if (opts.apply === true && rows.length) writeJsonl(path.join(root, 'mechanism-recheck.jsonl'), rows);
  return { schema_version: 'autoarmory/mechanism-recheck-report/v1', state_root: root, repo: repo, apply: opts.apply === true, mechanisms: mechanisms.length, pending_written: pendingWritten, already_pending: alreadyPending, no_action: noAction, blocked_by_claim_identity: blocked, rows: rows };
}
function drain(stateDir, options) {
  const opts = options || {};
  const report = recheck(stateDir, Object.assign({}, opts, { apply: true }));
  const runner = historyRunner.drain({ stateDir: path.resolve(stateDir), repo: path.resolve(opts.repo || '.') });
  const priority = priorityEngine.run(path.resolve(stateDir), path.resolve(opts.repo || '.'));
  return { schema_version: 'autoarmory/mechanism-recheck-drain/v1', recheck: report, runner: runner, priority: priority };
}
module.exports = { recheck, drain, reuseForMechanism, pendingJob };