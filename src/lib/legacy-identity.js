'use strict';
const fs = require('fs');
const path = require('path');
const { writeJson } = require('./util');
function audit(stateDir, options) {
  const opts = options || {};
  const root = path.join(stateDir, 'reuse-records');
  const files = fs.existsSync(root) ? fs.readdirSync(root).filter(function (name) { return /\.json$/i.test(name); }).sort() : [];
  const rows = [];
  for (const name of files) {
    const file = path.join(root, name);
    let record;
    try { record = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
    const complete = !!(record.claim_sha256 && record.expected_sha256 && record.claim_instance && record.expected_provenance);
    const identity = complete ? 'present' : 'missing';
    const row = { file: file, change_id: record.change_id || null, status_before: record.status || null, claim_identity_status: identity, changed: record.claim_identity_status !== identity };
    if (opts.apply === true && row.changed) {
      record.claim_identity_status = identity;
      record.claim_identity_audited_at = new Date().toISOString();
      writeJson(file, record, { backup: true });
    }
    rows.push(row);
  }
  return { schema_version: 'autoarmory/legacy-identity-audit/v1', generated_at: new Date().toISOString(), examined: rows.length, missing: rows.filter(function (row) { return row.claim_identity_status === 'missing'; }).length, present: rows.filter(function (row) { return row.claim_identity_status === 'present'; }).length, rows: rows };
}
module.exports = { audit };