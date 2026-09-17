'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJsonl, writeJsonl } = require('./util');

function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let read = 0;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function artifactsFile(stateDir) { return path.join(stateDir, 'artifacts.jsonl'); }
function readArtifacts(stateDir) { const file = artifactsFile(stateDir); return fs.existsSync(file) ? readJsonl(file) : []; }

function fail(errors) { return { ok: false, errors: Array.isArray(errors) ? errors : [String(errors)] }; }

function intakeArtifact(stateDir, descriptor, options) {
  const opts = options || {};
  const repo = path.resolve(opts.repo || '.');
  const input = descriptor || {};
  const errors = [];
  if (input.schema_version && input.schema_version !== 'autoarmory/artifact-intake/v1') errors.push('schema_version must be autoarmory/artifact-intake/v1');
  if (!input.artifact_id || typeof input.artifact_id !== 'string') errors.push('artifact_id is required');
  if (!input.source || typeof input.source !== 'string') errors.push('source is required');
  if (!input.path || typeof input.path !== 'string') errors.push('path is required');
  if (errors.length) return fail(errors);

  const absolute = path.isAbsolute(input.path) ? path.resolve(input.path) : path.resolve(repo, input.path);
  if (!fs.existsSync(absolute)) return fail('artifact path does not exist: ' + absolute);
  if (!fs.statSync(absolute).isFile()) return fail('artifact path is not a file: ' + absolute);

  const digest = fileSha256(absolute);
  if (input.sha256 && String(input.sha256).toLowerCase() !== digest) {
    return fail('artifact sha256 mismatch: declared ' + String(input.sha256).slice(0, 12) + ' != actual ' + digest.slice(0, 12));
  }

  const rows = readArtifacts(stateDir);
  const previous = rows.filter(function (item) { return item.artifact_id === input.artifact_id; }).pop() || null;
  if (previous && previous.sha256 === digest) {
    return { ok: true, duplicate: true, record: previous, next: 'bind a case and a verifier before claiming anything' };
  }

  const record = {
    schema_version: 'autoarmory/artifact/v1',
    artifact_id: input.artifact_id,
    source: input.source,
    path: input.path,
    resolved_path: absolute,
    sha256: digest,
    size: fs.statSync(absolute).size,
    produced_at: input.produced_at || null,
    case_hint: input.case_hint || null,
    verifier_hint: input.verifier_hint || null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    status: 'intaken',
    revision: previous ? Number(previous.revision || 1) + 1 : 1,
    previous_sha256: previous ? previous.sha256 : null,
    intaken_at: new Date().toISOString()
  };

  fs.mkdirSync(stateDir, { recursive: true });
  rows.push(record);
  writeJsonl(artifactsFile(stateDir), rows);
  return { ok: true, duplicate: false, record: record, next: 'bind a case and a verifier before claiming anything' };
}

module.exports = { artifactsFile, readArtifacts, intakeArtifact, fileSha256 };