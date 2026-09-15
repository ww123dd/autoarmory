'use strict';

const { readJson, parseArgs, printJson } = require('../lib/util');

const REQUIRED = ['name', 'tool_prefix', 'credential_source', 'order', 'arbitration', 'when_not_to_use', 'fallback_on_failure', 'payload_scale'];
const BOOLEANS = ['read_only', 'can_write', 'can_spend', 'offload'];
const ARRAYS = ['forbidden_domains', 'guard_hooks', 'vectors'];
const BIG_PAYLOAD = /MB|GB|TB|million rows|\u767e\u4e07|\u4e07\u884c/i;

function nonEmptyString(v) { return typeof v === 'string' && v.trim() !== ''; }
function stringArray(v) { return Array.isArray(v) && v.every(nonEmptyString); }

function check(data) {
  const errors = [];
  const warnings = [];
  if (data.schema_version !== 'skillcanary/mcp-onboard/v1' && data.schema_version !== 'mcp-onboard/v2') {
    errors.push('schema_version must be "skillcanary/mcp-onboard/v1" or "mcp-onboard/v2"');
  }
  if (!Array.isArray(data.mcps) || data.mcps.length === 0) {
    errors.push('mcps must be a non-empty array');
    return { errors, warnings };
  }
  data.mcps.forEach(function (m, i) {
    const label = 'mcps[' + i + ']';
    for (const key of REQUIRED) if (!nonEmptyString(m[key])) errors.push(label + ' missing ' + key);
    for (const key of BOOLEANS) if (typeof m[key] !== 'boolean') errors.push(label + ' missing boolean ' + key);
    for (const key of ARRAYS) {
      if (!Array.isArray(m[key])) errors.push(label + ' missing array ' + key);
      else if (!stringArray(m[key])) errors.push(label + ' ' + key + ' must contain non-empty strings');
    }
    if (m.read_only === true && m.can_write === true) errors.push(label + ' read_only and can_write cannot both be true');
    if (m.can_write === true && Array.isArray(m.forbidden_domains) && m.forbidden_domains.length === 0) {
      errors.push(label + ' writable MCP must declare forbidden_domains');
    }
    if (!Array.isArray(m.docs_landed) || !stringArray(m.docs_landed) || m.docs_landed.length === 0) {
      errors.push(label + ' docs_landed must be a non-empty string array');
    }
    const hooks = Array.isArray(m.guard_hooks) ? m.guard_hooks : [];
    const vectors = Array.isArray(m.vectors) ? m.vectors : [];
    if (hooks.length && vectors.length === 0) errors.push(label + ' guard_hooks require vectors');
    if (vectors.length && !nonEmptyString(m.evidence)) errors.push(label + ' vectors require evidence');
    if (m.veto_map !== undefined && !Array.isArray(m.veto_map)) errors.push(label + ' veto_map must be an array');
    if (vectors.length) {
      const map = Array.isArray(m.veto_map) ? m.veto_map : [];
      if (map.length === 0) errors.push(label + ' vectors require veto_map');
      const seen = new Set();
      map.forEach(function (x, j) {
        const where = label + '.veto_map[' + j + ']';
        if (!x || typeof x !== 'object' || Array.isArray(x)) { errors.push(where + ' must be an object'); return; }
        for (const key of ['rule', 'vector', 'evidence']) if (!nonEmptyString(x[key])) errors.push(where + ' missing ' + key);
        if (nonEmptyString(x.vector)) {
          seen.add(x.vector.trim());
          if (!vectors.includes(x.vector.trim())) errors.push(where + '.vector is not in vectors');
        }
      });
      vectors.forEach(function (v) { if (nonEmptyString(v) && !seen.has(v.trim())) errors.push(label + ' vector "' + v + '" is missing from veto_map'); });
    } else if (Array.isArray(m.veto_map) && m.veto_map.length) {
      errors.push(label + ' veto_map exists without vectors');
    }
    if (nonEmptyString(m.payload_scale) && BIG_PAYLOAD.test(m.payload_scale) && m.offload !== true) {
      errors.push(label + ' large payload requires offload=true');
    }
  });
  return { errors, warnings };
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const file = args._[0];
  if (!file) {
    process.stderr.write('Usage: skillcanary mcp-onboard <record.json>\n');
    return 2;
  }
  const result = check(readJson(file));
  if (args.json) printJson(result);
  else {
    process.stdout.write('SkillCanary mcp-onboard @ ' + file + '\n');
    for (const w of result.warnings) process.stdout.write('  ! ' + w + '\n');
    for (const e of result.errors) process.stdout.write('  x ' + e + '\n');
    process.stdout.write('  Result: ' + (result.errors.length ? 'FAIL' : 'PASS') + '\n');
  }
  return result.errors.length ? 1 : 0;
};

module.exports.check = check;