'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson, writeText } = require('../lib/util');
const adapters = require('../lib/adapters');

function descriptorDoctor() {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const descriptor of adapters.DESCRIPTORS) {
    const label = descriptor.id || 'unknown';
    if (!descriptor.id) errors.push('descriptor missing id');
    else if (ids.has(descriptor.id)) errors.push('duplicate adapter id: ' + descriptor.id);
    else ids.add(descriptor.id);
    for (const key of ['kind', 'version', 'output_schema']) {
      if (!descriptor[key]) errors.push(label + ' missing ' + key);
    }
    if (!descriptor.permissions || typeof descriptor.permissions.read !== 'boolean') warnings.push(label + ' missing read permission declaration');
    if (descriptor.permissions && descriptor.permissions.write === true && !descriptor.forbidden_domains) warnings.push(label + ' writable adapter should declare forbidden domains');
  }
  return { ok: errors.length === 0, count: adapters.DESCRIPTORS.length, errors, warnings };
}

function toSarif(risk) {
  const rules = {};
  for (const finding of risk.findings || []) rules[finding.rule] = { id: finding.rule, name: finding.rule };
  return {
    version: '2.1.0',
    '$schema': 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: risk.scanner || 'SkillCanary', informationUri: 'https://github.com/' } },
      results: (risk.findings || []).map(function (finding) {
        return {
          ruleId: finding.rule,
          level: finding.severity === 'critical' ? 'error' : (finding.severity === 'high' ? 'error' : 'warning'),
          message: { text: finding.message || finding.id },
          locations: finding.path ? [{ physicalLocation: { artifactLocation: { uri: finding.path } } }] : []
        };
      }),
      rules: Object.keys(rules).map(function (key) { return rules[key]; })
    }]
  };
}

function toJUnit(evidence) {
  const before = evidence.before || { pass: 0, total: 1 };
  const after = evidence.after || { pass: 0, total: 1 };
  const failures = Math.max(0, after.total - after.pass);
  const cases = [];
  for (let i = 0; i < after.total; i++) {
    const passed = i < after.pass;
    cases.push('    <testcase name="case-' + (i + 1) + '" classname="skillcanary">' + (passed ? '' : '<failure message="case failed" />') + '</testcase>');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="SkillCanary" tests="' + after.total + '" failures="' + failures + '" skipped="0">\n' + cases.join('\n') + '\n</testsuite>\n';
}


function toEvalPort(normalized, data) {
  if (normalized.suite) return normalized.suite;
  const evidence = normalized.evidence || data;
  return {
    schema_version: 'skillcanary/evalport/v1',
    name: 'skillcanary-export',
    test_cases: [{ id: evidence.case_id || 'case', target: evidence.skill || 'unknown' }],
    graders: [{ id: 'skillcanary-gate', type: 'deterministic' }],
    results: [{ case_id: evidence.case_id || 'case', before: evidence.before, after: evidence.after }]
  };
}

function toOtel(normalized) {
  const trace = normalized.trace || normalized;
  return {
    resourceSpans: [{
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'skillcanary' } }] },
      scopeSpans: [{
        scope: { name: 'skillcanary.adapter' },
        spans: (trace.spans || []).map(function (span) {
          return {
            traceId: trace.run_id || 'trace', spanId: span.id, name: span.name || span.id,
            status: { code: span.status === 'error' ? 2 : 1 },
            attributes: [{ key: 'skillcanary.tool', value: { stringValue: span.tool || '' } }],
            startTimeUnixNano: '0'
          };
        })
      }]
    }]
  };
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];

  if (sub === 'list') {
    const list = adapters.listDescriptors(args.kind);
    if (args.json) printJson(list);
    else for (const item of list) process.stdout.write('  ' + item.id + '  kind=' + item.kind + '  out=' + item.output_schema + '\n');
    return 0;
  }

  if (sub === 'detect') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: skillcanary adapter detect <file.json> [--json]\n'); return 2; }
    const detected = adapters.detectKinds(readJson(path.resolve(file)));
    if (args.json) printJson(detected);
    else if (!detected.length) process.stdout.write('  No adapter detected\n');
    else for (const item of detected) process.stdout.write('  ' + item.kind + ' -> ' + item.adapter + '\n');
    return detected.length ? 0 : 1;
  }

  if (sub === 'import') {
    const kind = args._[1];
    const file = args._[2];
    if (!kind || !file) { process.stderr.write('Usage: skillcanary adapter import <kind> <file> [--adapter auto] [--case c01] [--output canonical.json]\n'); return 2; }
    const normalized = adapters.normalize(kind, readJson(path.resolve(file)), { adapter: args.adapter || 'auto', caseId: args.case || 'c01' });
    if (!normalized) { process.stderr.write('Unsupported adapter kind: ' + kind + '\n'); return 2; }
    if (args.output) writeText(path.resolve(args.output), JSON.stringify(normalized, null, 2) + '\n');
    else printJson(normalized);
    return 0;
  }

  if (sub === 'export') {
    const file = args._[1];
    const format = args.format || (args._[0] === 'sarif' ? 'sarif' : 'jsonl');
    if (!file) { process.stderr.write('Usage: skillcanary adapter export <file> --format sarif|junit|evalport|otel|jsonl [--output out]\n'); return 2; }
    const data = readJson(path.resolve(file));
    const detected = adapters.detectKinds(data);
    const kind = args.kind || (detected[0] && detected[0].kind) || 'security';
    const normalized = adapters.normalize(kind, data, { adapter: args.adapter || 'auto', caseId: args.case || 'c01' });
    let output;
    if (format === 'sarif') output = JSON.stringify(toSarif(normalized.risk || adapters.normalizeSecurity(data)), null, 2) + '\n';
    else if (format === 'junit') output = toJUnit(normalized.evidence || data);
    else if (format === 'evalport') output = JSON.stringify(toEvalPort(normalized, data), null, 2) + '\n';
    else if (format === 'otel') output = JSON.stringify(toOtel(normalized), null, 2) + '\n';
    else output = JSON.stringify(normalized) + '\n';
    if (args.output) writeText(path.resolve(args.output), output);
    else process.stdout.write(output);
    return 0;
  }

  if (sub === 'doctor') {
    const result = descriptorDoctor();
    if (args.json) printJson(result);
    else {
      process.stdout.write('SkillCanary adapter doctor\n');
      for (const warning of result.warnings) process.stdout.write('  ! ' + warning + '\n');
      for (const error of result.errors) process.stdout.write('  x ' + error + '\n');
      process.stdout.write('  Result: ' + (result.ok ? 'PASS' : 'FAIL') + ' (' + result.count + ' adapter(s))\n');
    }
    return result.ok ? 0 : 1;
  }

  process.stderr.write('Usage: skillcanary adapter <list|detect|import|export|doctor> ...\n');
  return 2;
};

module.exports.descriptorDoctor = descriptorDoctor;
module.exports.toSarif = toSarif;
module.exports.toJUnit = toJUnit;
module.exports.toEvalPort = toEvalPort;
module.exports.toOtel = toOtel;
