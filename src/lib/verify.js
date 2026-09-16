'use strict';

// External-fact primitive.
//
// A record is `verified` only when the fact behind it can be re-derived right now:
// a registered verifier adapter is re-run, and the digest it produces matches the
// digest stored in the record. Anything that cannot be recomputed is `unverifiable`,
// never `verified`. Self-reported booleans are not accepted as evidence.
//
// Trust root: `verifiers.lock.json` at the repository root pins the SHA-256 of every
// adapter. Swapping an adapter to always return success changes its digest and is
// reported as `mismatch`. The lock file itself is trusted because it is committed.
// If history can be rewritten, this primitive cannot help - that boundary is real.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');
const { readJson } = require('./util');

const STATUSES = ['verified', 'mismatch', 'unverifiable'];
const LOCK_FILE = 'verifiers.lock.json';
const LOCK_SCHEMA = 'autoarmory/verifiers-lock/v1';
const ADAPTER_TIMEOUT_MS = 120000;
const DEFAULT_TRIALS = 3;
const HASH = /^[a-f0-9]{64}$/i;
const INVOCATION_CONTRACT = 'autoarmory/invocation-contract/v1';

function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonicalize(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256Value(value) {
  return crypto.createHash('sha256').update(canonicalize(value)).digest('hex');
}
function sha256Text(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

// Runner identity: who produced the fact, through which fixed contract.
//
// runner_sha256 covers every pinned artifact plus the declared statement and
// assertion, so replacing any of them replaces the runner. The human-readable
// `version` is deliberately excluded: it is compatibility metadata, not a trust
// root, so bumping it must not invalidate an otherwise identical verdict.
function runnerDescriptor(declared) {
  const item = declared || {};
  const bridge = item.bridge || {};
  const server = bridge.server || {};
  const contract = item.invocation_contract_version || INVOCATION_CONTRACT;
  const identity = {
    verifier_id: item.id || null,
    adapter_sha256: item.adapter_sha256 || null,
    bridge_adapter_sha256: bridge.adapter_sha256 || null,
    server_config_sha256: server.config_sha256 || null,
    server_entry_sha256: server.entry_sha256 || null,
    statement_sha256: typeof item.statement === 'string' ? sha256Text(item.statement) : null,
    assertion: item.assertion || null,
    invocation_contract_version: contract
  };
  return {
    runner_id: item.id || null,
    runner_sha256: sha256Value(identity),
    invocation_contract_version: contract,
    verifier_version: item.version || null
  };
}

// The single freshness rule used by close, status and preflight: a recorded
// verdict is fresh only while it still names the runner the active profile
// declares. Anything else is stale and must not be reported as verified/closed.
function runnerFreshness(value, options) {
  const opts = options || {};
  const record = value || {};
  const repo = resolveRepo(opts.repo || process.cwd());
  const lock = loadLock(repo);
  const refVerifier = Array.isArray(record.evidence_refs) && record.evidence_refs[0] ? record.evidence_refs[0].verifier : null;
  const verifierId = opts.verifier || record.verifier || refVerifier || record.verifier_id || record.runner_id || null;
  if (!lock.ok) return { ok: false, status: 'unregistered', reason: lock.reason, repo: repo, expected: null, recorded: null };
  const declared = findVerifier(lock, verifierId);
  if (!declared) return { ok: false, status: 'unregistered', reason: 'verifier is not registered: ' + verifierId, repo: repo, expected: null, recorded: null };
  const expected = runnerDescriptor(declared);
  const recorded = {
    runner_id: record.runner_id || null,
    runner_sha256: record.runner_sha256 || null,
    invocation_contract_version: record.invocation_contract_version || null
  };
  const versionDrift = !!(record.verifier_version && expected.verifier_version && record.verifier_version !== expected.verifier_version);
  const base = { repo: repo, expected: expected, recorded: recorded, version_drift: versionDrift };
  if (!HASH.test(String(recorded.runner_sha256 || ''))) {
    return Object.assign(base, { ok: false, status: 'unbound', reason: 'record carries no runner_sha256; a verdict that cannot name its runner is not fresh' });
  }
  if (recorded.runner_sha256 !== expected.runner_sha256 || recorded.runner_id !== expected.runner_id || (recorded.invocation_contract_version || '') !== expected.invocation_contract_version) {
    return Object.assign(base, {
      ok: false,
      status: 'drifted',
      reason: 'runner identity changed: recorded ' + String(recorded.runner_sha256).slice(0, 12) + '/' + String(recorded.invocation_contract_version) + ' vs current ' + expected.runner_sha256.slice(0, 12) + '/' + expected.invocation_contract_version
    });
  }
  return Object.assign(base, { ok: true, status: 'current', reason: 'runner identity matches the active profile' });
}

function runnerFor(repoRoot, verifierId) {
  const repo = resolveRepo(repoRoot || process.cwd());
  const lock = loadLock(repo);
  if (!lock.ok) return null;
  const declared = findVerifier(lock, verifierId);
  return declared ? runnerDescriptor(declared) : null;
}

function fileDigest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function expandHome(value) {
  if (typeof value !== 'string' || !value) return value;
  if (value === '~') return os.homedir();
  if (value.indexOf('~/') === 0 || value.indexOf('~\\') === 0) return path.join(os.homedir(), value.slice(2));
  return value;
}
function resolvePath(repo, value) {
  return path.resolve(repo, expandHome(value));
}

function resolveRepo(start) {
  let dir = path.resolve(start || '.');
  for (let depth = 0; depth < 24; depth++) {
    if (fs.existsSync(path.join(dir, LOCK_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start || '.');
}

function loadLock(repo) {
  const file = path.join(repo, LOCK_FILE);
  if (!fs.existsSync(file)) return { ok: false, reason: LOCK_FILE + ' not found in ' + repo, verifiers: [] };
  let lock;
  try { lock = readJson(file); } catch (error) { return { ok: false, reason: LOCK_FILE + ' unreadable: ' + error.message, verifiers: [] }; }
  if (lock.schema_version !== LOCK_SCHEMA) return { ok: false, reason: LOCK_FILE + ' has unexpected schema_version', verifiers: [] };
  if (!Array.isArray(lock.verifiers) || lock.verifiers.length === 0) return { ok: false, reason: LOCK_FILE + ' declares no verifiers', verifiers: [] };
  return { ok: true, reason: null, verifiers: lock.verifiers };
}

function findVerifier(lock, id) {
  return lock.verifiers.find(function (item) { return item.id === id; }) || null;
}

function insideRepo(repo, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) return null;
  const base = path.resolve(repo);
  const full = path.resolve(base, relative);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function check(status, id, detail) { return { id: id, status: status, detail: detail }; }

function report(repo, status, reason, checks, refs, extra) {
  const base = {
    schema_version: 'autoarmory/verification/v1',
    status: status,
    reason: reason,
    repo: repo,
    verified_at: new Date().toISOString(),
    checks: checks || [],
    refs: refs || []
  };
  return Object.assign(base, extra || {});
}

function runAdapter(repo, adapterPath, payload, timeoutMs) {
  const result = spawnSync(process.execPath, [adapterPath, '--json'], {
    cwd: repo,
    encoding: 'utf8',
    input: JSON.stringify(payload),
    timeout: timeoutMs
  });
  if (result.error) return { ok: false, reason: 'adapter failed to start: ' + result.error.message };
  if (result.status !== 0) {
    let detail = String(result.stderr || '').trim().replace(/\s+/g, ' ').slice(0, 240);
    try {
      const declined = JSON.parse(String(result.stdout || '').trim());
      if (declined && declined.reason) detail = String(declined.reason);
    } catch (_) {}
    detail = String(detail || '').replace(/\s+/g, ' ').slice(0, 400);
    return { ok: false, reason: 'adapter exited ' + result.status + (detail ? ': ' + detail : '') };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(String(result.stdout || '').trim());
  } catch (error) {
    return { ok: false, reason: 'adapter produced no JSON: ' + error.message };
  }
  if (!parsed || parsed.ok !== true) return { ok: false, reason: 'adapter declined: ' + ((parsed && parsed.reason) || 'ok!=true') };
  for (const field of ['input_sha256', 'output_sha256']) {
    if (!HASH.test(String(parsed[field] || ''))) return { ok: false, reason: 'adapter did not produce ' + field };
  }
  if (!Number.isInteger(parsed.exit_code)) return { ok: false, reason: 'adapter did not produce integer exit_code' };
  return { ok: true, result: parsed };
}

function inspectRef(repo, lock, ref, options) {
  const opts = options || {};
  const capture = opts.capture === true;
  const checks = [];
  const id = (ref && ref.id) || 'ref';
  if (!ref || typeof ref !== 'object') {
    return { id: id, status: 'unverifiable', checks: [check('unverifiable', 'ref_shape', 'evidence_ref must be an object')], fresh: null };
  }

  const verifierId = typeof ref.verifier === 'string' ? ref.verifier : '';
  if (!verifierId) {
    return { id: id, status: 'unverifiable', checks: [check('unverifiable', 'ref_shape', 'evidence_ref.verifier is required')], fresh: null };
  }

  const declared = findVerifier(lock, verifierId);
  if (!declared) {
    return { id: id, status: 'unverifiable', checks: [check('unverifiable', 'verifier_registered', 'verifier not in ' + LOCK_FILE + ': ' + verifierId)], fresh: null };
  }
  if (declared.readonly !== true) {
    return { id: id, status: 'unverifiable', checks: [check('unverifiable', 'verifier_readonly', 'verifier ' + verifierId + ' is not declared readonly; anything not explicitly read-only is denied')], fresh: null };
  }
  checks.push(check('pass', 'verifier_registered', verifierId + ' (readonly)'));

  const adapterPath = insideRepo(repo, declared.adapter);
  if (!adapterPath || !fs.existsSync(adapterPath)) {
    return { id: id, status: 'unverifiable', checks: checks.concat([check('unverifiable', 'adapter_present', 'adapter missing: ' + declared.adapter)]), fresh: null };
  }
  const adapterDigest = fileDigest(adapterPath);
  if (!HASH.test(String(declared.adapter_sha256 || '')) || adapterDigest !== declared.adapter_sha256) {
    return {
      id: id,
      status: 'mismatch',
      checks: checks.concat([check('mismatch', 'adapter_integrity', 'adapter ' + declared.adapter + ' digest ' + adapterDigest.slice(0, 12) + ' does not match the pinned ' + String(declared.adapter_sha256 || '(none)').slice(0, 12))]),
      fresh: null
    };
  }
  checks.push(check('pass', 'adapter_integrity', declared.adapter + '@' + adapterDigest.slice(0, 12)));

  if (!capture) {
    const missing = [];
    if (!HASH.test(String(ref.input_sha256 || ''))) missing.push('input_sha256');
    if (!HASH.test(String(ref.output_sha256 || ''))) missing.push('output_sha256');
    if (!Number.isInteger(ref.exit_code)) missing.push('exit_code');
    if (missing.length) {
      return {
        id: id,
        status: 'unverifiable',
        checks: checks.concat([check('unverifiable', 'recorded_fact', 'recorded evidence_ref is missing: ' + missing.join(', '))]),
        fresh: null
      };
    }
  }

  if (ref.artifact) {
    const artifactPath = insideRepo(repo, ref.artifact);
    if (!artifactPath) {
      return { id: id, status: 'mismatch', checks: checks.concat([check('mismatch', 'artifact_path', 'artifact must stay inside the repository: ' + ref.artifact)]), fresh: null };
    }
    if (!fs.existsSync(artifactPath)) {
      checks.push(check('unverifiable', 'artifact_present', 'artifact missing: ' + ref.artifact));
    } else {
      const artifactDigest = fileDigest(artifactPath);
      const expected = String(ref.artifact_sha256 || ref.output_sha256 || '');
      if (HASH.test(expected) && artifactDigest !== expected) {
        return { id: id, status: 'mismatch', checks: checks.concat([check('mismatch', 'artifact_integrity', 'artifact digest ' + artifactDigest.slice(0, 12) + ' != recorded ' + expected.slice(0, 12))]), fresh: null };
      }
      checks.push(check('pass', 'artifact_integrity', ref.artifact + '@' + artifactDigest.slice(0, 12)));
    }
  }

  if (opts.rederive === false) {
    return { id: id, status: 'unverifiable', checks: checks.concat([check('unverifiable', 'rederivation', 'rederivation disabled; a stored digest is not a fact')]), fresh: null };
  }

  const trials = Math.max(1, Number(opts.trials || DEFAULT_TRIALS));
  const declaredRunner = runnerDescriptor(declared);
  const payload = {
    ref: { id: id, verifier: verifierId, artifact: ref.artifact || null, params: ref.params || {} },
    runner: declaredRunner,
    case_id: opts.case_id || null,
    mechanism_id: opts.mechanism_id || null,
    run_id: opts.run_id || null
  };
  const mismatches = [];
  const seen = [];
  let fresh = null;
  for (let trial = 0; trial < trials; trial++) {
    const run = runAdapter(repo, adapterPath, payload, declared.timeout_ms || ADAPTER_TIMEOUT_MS);
    if (!run.ok) {
      return { id: id, status: 'unverifiable', checks: checks.concat([check('unverifiable', 'rederivation', 'trial ' + (trial + 1) + '/' + trials + ': ' + run.reason)]), fresh: null };
    }
    const produced = run.result;
    if (produced.runner && produced.runner.runner_sha256 !== declaredRunner.runner_sha256) {
      return { id: id, status: 'mismatch', checks: checks.concat([check('mismatch', 'runner_identity', 'adapter reported runner ' + String(produced.runner.runner_sha256).slice(0, 12) + ' but the active profile declares ' + declaredRunner.runner_sha256.slice(0, 12))]), fresh: null };
    }
    fresh = {
      verifier: verifierId,
      runner: declaredRunner,
      input_sha256: String(produced.input_sha256),
      output_sha256: String(produced.output_sha256),
      exit_code: produced.exit_code,
      observed: produced.observed === undefined ? null : produced.observed
    };
    seen.push(fresh.output_sha256);
    if (!capture) {
      for (const field of ['input_sha256', 'output_sha256']) {
        if (String(ref[field]) !== String(fresh[field])) mismatches.push('trial ' + (trial + 1) + ' ' + field + ' recorded=' + String(ref[field]).slice(0, 12) + ' recomputed=' + String(fresh[field]).slice(0, 12));
      }
      if (ref.exit_code !== fresh.exit_code) mismatches.push('trial ' + (trial + 1) + ' exit_code recorded=' + ref.exit_code + ' recomputed=' + fresh.exit_code);
    }
  }
  if (mismatches.length) {
    return { id: id, status: 'mismatch', checks: checks.concat([check('mismatch', 'rederivation', mismatches.slice(0, 4).join('; '))]), fresh: fresh };
  }
  const distinct = Array.from(new Set(seen));
  if (distinct.length !== 1) {
    return { id: id, status: 'mismatch', checks: checks.concat([check('mismatch', 'stability', trials + ' trials produced ' + distinct.length + ' distinct digests: ' + distinct.join(', '))]), fresh: fresh };
  }
  checks.push(check('pass', 'rederivation', trials + '/' + trials + ' trials reproduced ' + distinct[0].slice(0, 12)));
  checks.push(check('pass', 'stability', 'Pass^' + trials + ': every trial agreed'));
  return { id: id, status: capture ? 'captured' : 'verified', checks: checks, trials: trials, fresh: fresh };
}

function verifyRefs(refs, options) {
  const opts = options || {};
  const repo = resolveRepo(opts.repo || process.cwd());
  const list = Array.isArray(refs) ? refs : [];
  const lock = loadLock(repo);
  if (!lock.ok) return report(repo, 'unverifiable', lock.reason, [], []);
  if (!list.length) return report(repo, 'unverifiable', 'no evidence refs: a record without recomputable evidence is not verified', [], []);

  const results = list.map(function (ref) { return inspectRef(repo, lock, ref, opts); });
  const flat = results.reduce(function (all, item) { return all.concat(item.checks); }, []);
  let status = 'verified';
  let reason = 'every evidence ref was re-derived from a registered verifier';
  if (results.some(function (item) { return item.status === 'mismatch'; })) {
    status = 'mismatch';
    reason = 'at least one evidence ref no longer reproduces its recorded fact';
  } else if (results.some(function (item) { return item.status === 'unverifiable'; })) {
    status = 'unverifiable';
    reason = 'at least one evidence ref could not be recomputed';
  }

  let input_sha256 = null;
  let output_sha256 = null;
  let exit_code = null;
  let result = null;
  if (status === 'verified') {
    const facts = results.map(function (item) { return item.fresh; });
    const codes = Array.from(new Set(facts.map(function (item) { return item.exit_code; })));
    if (codes.length !== 1) {
      status = 'mismatch';
      reason = 'evidence refs disagree on exit_code: ' + codes.join(', ');
      flat.push(check('mismatch', 'exit_code_consistency', reason));
    } else {
      exit_code = codes[0];
      result = exit_code === 0 ? 'pass' : 'fail';
      input_sha256 = facts.length === 1
        ? facts[0].input_sha256
        : sha256Value(facts.map(function (item) { return { id: item.id, verifier: item.verifier, input_sha256: item.input_sha256 }; }));
      output_sha256 = facts.length === 1
        ? facts[0].output_sha256
        : sha256Value(facts.map(function (item) { return { id: item.id, verifier: item.verifier, output_sha256: item.output_sha256 }; }));
    }
  }

  return report(repo, status, reason, flat, results, {
    input_sha256: input_sha256,
    output_sha256: output_sha256,
    exit_code: exit_code,
    result: result,
    runner: status === 'verified' && results[0] && results[0].fresh ? results[0].fresh.runner || null : null
  });
}

function verifyRecord(record, options) {
  const opts = options || {};
  const refs = record && Array.isArray(record.evidence_refs) ? record.evidence_refs : [];
  const freshness = runnerFreshness(record, opts);
  if (!freshness.ok) {
    const staleStatus = freshness.status === 'drifted' ? 'mismatch' : 'unverifiable';
    return report(freshness.repo, staleStatus, 'runner freshness: ' + freshness.reason, [check(staleStatus, 'runner_freshness', freshness.reason)], [], {
      runner: { expected: freshness.expected || null, recorded: freshness.recorded || null },
      version_drift: freshness.version_drift === true
    });
  }
  const result = verifyRefs(refs, opts);
  if (result.status !== 'verified') return result;

  const errors = [];
  const requireRecord = opts.require_record !== false;
  if (requireRecord) {
    for (const field of ['input_sha256', 'output_sha256']) {
      if (!HASH.test(String(record[field] || ''))) errors.push('record.' + field + ' must be a sha256 hex string');
    }
    if (!Number.isInteger(record.exit_code)) errors.push('record.exit_code must be an integer');
    if (record.result !== 'pass' && record.result !== 'fail') errors.push('record.result must be pass or fail');
  }
  if (record.input_sha256 !== undefined && record.input_sha256 !== result.input_sha256) errors.push('record.input_sha256 does not match the re-derived aggregate');
  if (record.output_sha256 !== undefined && record.output_sha256 !== result.output_sha256) errors.push('record.output_sha256 does not match the re-derived aggregate');
  if (record.exit_code !== undefined && record.exit_code !== result.exit_code) errors.push('record.exit_code does not match the re-derived exit code');
  if (record.result !== undefined && record.result !== result.result) errors.push('record.result does not match the re-derived exit code');

  if (errors.length) {
    return report(result.repo, 'mismatch', errors.join('; '), result.checks.concat(errors.map(function (error) { return check('mismatch', 'record_consistency', error); })), result.refs, {
      input_sha256: result.input_sha256,
      output_sha256: result.output_sha256,
      exit_code: result.exit_code,
      result: result.result
    });
  }
  return Object.assign({}, result, { runner: freshness.expected, version_drift: freshness.version_drift === true });
}

function captureRefs(refs, options) {
  const opts = Object.assign({}, options || {}, { capture: true });
  const repo = resolveRepo(opts.repo || process.cwd());
  const list = Array.isArray(refs) ? refs : [];
  const lock = loadLock(repo);
  if (!lock.ok) return { schema_version: 'autoarmory/verification-capture/v1', status: 'unverifiable', reason: lock.reason, repo: repo, refs: [], captured: [] };
  if (!list.length) return { schema_version: 'autoarmory/verification-capture/v1', status: 'unverifiable', reason: 'no evidence refs to capture', repo: repo, refs: [], captured: [] };

  const results = list.map(function (ref) { return inspectRef(repo, lock, ref, opts); });
  const status = results.some(function (item) { return item.status === 'mismatch'; })
    ? 'mismatch'
    : (results.some(function (item) { return item.status === 'unverifiable'; }) ? 'unverifiable' : 'captured');
  const captured = results.map(function (item, index) {
    if (item.status !== 'captured') return null;
    return Object.assign({}, list[index], {
      input_sha256: item.fresh.input_sha256,
      output_sha256: item.fresh.output_sha256,
      exit_code: item.fresh.exit_code
    });
  }).filter(Boolean);
  return {
    schema_version: 'autoarmory/verification-capture/v1',
    status: status,
    reason: status === 'captured' ? 'every evidence ref was re-derived and can now be recorded' : 'at least one evidence ref could not be captured',
    repo: repo,
    refs: results,
    captured: captured
  };
}

function listVerifiers(repoRoot) {
  const repo = resolveRepo(repoRoot || process.cwd());
  const lock = loadLock(repo);
  if (!lock.ok) return { ok: false, errors: [lock.reason], verifiers: [] };
  const verifiers = lock.verifiers.map(function (item) {
    const checks = [];
    const adapterPath = insideRepo(repo, item.adapter);
    const adapterPresent = !!(adapterPath && fs.existsSync(adapterPath));
    const adapterDigest = adapterPresent ? fileDigest(adapterPath) : null;
    checks.push({ id: 'adapter', ok: !!adapterDigest && adapterDigest === item.adapter_sha256, path: item.adapter });

    let bridgeOk = true;
    if (item.bridge && typeof item.bridge === 'object') {
      const bridgePath = insideRepo(repo, item.bridge.adapter);
      const bridgePresent = !!(bridgePath && fs.existsSync(bridgePath));
      const bridgeDigest = bridgePresent ? fileDigest(bridgePath) : null;
      bridgeOk = !!bridgeDigest && bridgeDigest === item.bridge.adapter_sha256;
      checks.push({ id: 'bridge_adapter', ok: bridgeOk, path: item.bridge.adapter || null });

      const server = item.bridge.server || {};
      let configOk = true;
      if (server.config || server.config_sha256) {
        const configPath = server.config ? resolvePath(repo, server.config) : null;
        configOk = !!(configPath && fs.existsSync(configPath) && HASH.test(String(server.config_sha256 || '')) && fileDigest(configPath) === server.config_sha256);
        checks.push({ id: 'bridge_config', ok: configOk, path: server.config || null });
      } else {
        checks.push({ id: 'bridge_config', ok: true, path: null, optional: true });
      }
      let entryOk = true;
      if (server.entry || server.entry_sha256) {
        const entryPath = server.entry ? resolvePath(repo, server.entry) : null;
        entryOk = !!(entryPath && fs.existsSync(entryPath) && HASH.test(String(server.entry_sha256 || '')) && fileDigest(entryPath) === server.entry_sha256);
        checks.push({ id: 'bridge_entry', ok: entryOk, path: server.entry || null });
      } else {
        checks.push({ id: 'bridge_entry', ok: true, path: null, optional: true });
      }
      bridgeOk = bridgeOk && configOk && entryOk;
    } else {
      checks.push({ id: 'bridge_adapter', ok: true, path: null, optional: true });
    }

    return { id: item.id, adapter: item.adapter, present: adapterPresent, integrity: checks.every(function (check) { return check.ok === true; }), kind: item.kind || 'artifact', checks: checks };
  });
  const ok = verifiers.every(function (item) { return item.integrity === true; });
  return { ok: ok, repo: repo, verifiers: verifiers, errors: ok ? [] : ['one or more verifier artifacts failed integrity checks'] };
}

module.exports = {
  STATUSES,
  INVOCATION_CONTRACT,
  expandHome,
  LOCK_FILE,
  LOCK_SCHEMA,
  canonicalize,
  sha256Value,
  sha256Text,
  fileDigest,
  resolveRepo,
  loadLock,
  runnerDescriptor,
  runnerFreshness,
  runnerFor,
  verifyRefs,
  verifyRecord,
  captureRefs,
  listVerifiers,
  insideRepo
};
