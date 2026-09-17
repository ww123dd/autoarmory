'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'skillcanary.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillcanary-bench-'));
const cases = [];

function run(args, env) {
  const r = spawnSync(process.execPath, [cli].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, env || {})
  });
  return r.status;
}

function add(id, expected, actual) {
  cases.push({ id, expected, actual, ok: expected === actual });
}

function writeJson(name, value) {
  const file = path.join(temp, name + '-' + Math.random().toString(16).slice(2) + '.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

function skillText() {
  return [
    '---',
    'name: basic-skill',
    'description: A tiny example skill used by SkillCanary benchmark fixtures and tests. Use when validating the benchmark fixture; do not use it for production skills or domain workflows.',
    '---',
    '',
    '# Basic skill',
    '',
    'Read `references/guide.md` and return `skillci-basic-skill-ok`.',
    ''
  ].join('\n');
}

function makeSkill() {
  const dir = fs.mkdtempSync(path.join(temp, 'skill-'));
  const skillDir = path.join(dir, 'basic-skill');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillText(), 'utf8');
  fs.writeFileSync(path.join(skillDir, 'references', 'guide.md'), '# Guide\n\nFixture marker: `skillci-basic-skill-ok`.\n', 'utf8');
  fs.writeFileSync(path.join(skillDir, 'agents', 'openai.yaml'), 'interface:\n  display_name: "Basic Skill"\n  short_description: "A tiny example skill used by SkillCanary tests"\n', 'utf8');
  return skillDir;
}

function baseChange() {
  return {
    schema_version: 'skillcanary/change/v1',
    id: 'benchmark-change',
    skill: 'basic-skill',
    target_case: 'c01',
    expected_transition: 'FAIL->PASS',
    reason: 'The skill was not discovered because the description did not name the fixture use case.',
    decision: 'The agent should load the skill when asked to validate the benchmark fixture.',
    production_change: true,
    prediction: { fix: ['c01'], regress_risk: ['c02'] },
    budget: { repeat: 3, max_runs: 9 },
    evidence: {
      before: { pass: 0, total: 3 },
      after: { pass: 3, total: 3 }
    }
  };
}

function baseCases() {
  return {
    schema_version: 'skillcanary/cases/v1',
    cases: [
      { id: 'c01', status: 'stable', criteria: 'The fixture must be discovered and used.' },
      { id: 'c02', status: 'stable', criteria: 'The fixture must not regress.' }
    ]
  };
}

function baseMcp() {
  return {
    schema_version: 'skillcanary/mcp-onboard/v1',
    mcps: [
      {
        name: 'example-readonly-mcp',
        tool_prefix: 'mcp__example__',
        read_only: true,
        can_write: false,
        can_spend: false,
        forbidden_domains: [],
        credential_source: 'Injected by the host; never written to logs.',
        order: 'source of truth',
        arbitration: 'Facts from this MCP win over hints from other tools.',
        when_not_to_use: 'Do not use it when a raw export is required.',
        fallback_on_failure: 'Fall back to the manual export workflow.',
        payload_scale: 'KB',
        offload: false,
        guard_hooks: [],
        vectors: [],
        veto_map: [],
        docs_landed: ['references/mcp.md']
      }
    ]
  };
}
function lintCase(id, expected, mutate, strict) {
  const dir = fs.mkdtempSync(path.join(temp, 'lint-'));
  const skillDir = path.join(dir, 'basic-skill');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillText(), 'utf8');
  fs.writeFileSync(path.join(skillDir, 'references', 'guide.md'), '# Guide\n\nFixture marker: `skillci-basic-skill-ok`.\n', 'utf8');
  if (mutate) mutate(skillDir);
  add(id, expected, run(strict ? ['lint', skillDir, '--strict'] : ['lint', skillDir]));
}

function gateCase(id, expected, mutate, casesMutate) {
  const change = baseChange();
  if (mutate) mutate(change);
  const ledger = baseCases();
  if (casesMutate) casesMutate(ledger);
  const changeFile = writeJson(id + '.change', change);
  const casesFile = writeJson(id + '.cases', ledger);
  add(id, expected, run(['gate', changeFile, casesFile]));
}

function mcpCase(id, expected, mutate) {
  const record = baseMcp();
  if (mutate) mutate(record.mcps[0]);
  add(id, expected, run(['mcp-onboard', writeJson(id + '.mcp', record)]));
}

function anchorCase(id, expected, mutate) {
  const skillDir = makeSkill();
  if (id !== 'anchor-missing-lock') run(['anchor', skillDir]);
  if (mutate) mutate(skillDir);
  add(id, expected, run(['anchor', skillDir, '--check']));
}

// Lint: 10 cases
lintCase('lint-valid', 0);
lintCase('lint-name-mismatch', 1, function (d) {
  const f = path.join(d, 'SKILL.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('name: basic-skill', 'name: other-skill'));
}, true);
lintCase('lint-invalid-name', 1, function (d) {
  const f = path.join(d, 'SKILL.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('name: basic-skill', 'name: Bad_Name'));
}, true);
lintCase('lint-missing-description', 1, function (d) {
  const f = path.join(d, 'SKILL.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/description:.*\n/, ''));
});
lintCase('lint-long-description', 1, function (d) {
  const f = path.join(d, 'SKILL.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/description:.*\n/, 'description: ' + 'x'.repeat(1100) + '\n'));
});
lintCase('lint-missing-reference', 1, function (d) {
  const f = path.join(d, 'SKILL.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('references/guide.md', 'references/missing.md'));
});
lintCase('lint-absolute-path', 1, function (d) {
  const f = path.join(d, 'SKILL.md');
  fs.appendFileSync(f, '\nC:\\Users\\Administrator\\secret\n');
}, true);
lintCase('lint-crlf', 0, function (d) {
  const f = path.join(d, 'SKILL.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\n/g, '\r\n'));
});
lintCase('lint-bom', 1, function (d) {
  const f = path.join(d, 'SKILL.md');
  fs.writeFileSync(f, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(fs.readFileSync(f))]));
});
const missingSkillDir = fs.mkdtempSync(path.join(temp, 'missing-skill-'));
add('lint-missing-skill', 1, run(['lint', missingSkillDir]));
// Gate: 20 cases
gateCase('gate-valid', 0);
gateCase('gate-wrong-schema', 1, function (c) { c.schema_version = 'change/v1'; });
gateCase('gate-missing-id', 1, function (c) { delete c.id; });
gateCase('gate-missing-skill', 1, function (c) { delete c.skill; });
gateCase('gate-missing-target-case', 1, function (c) { delete c.target_case; });
gateCase('gate-wrong-transition', 1, function (c) { c.expected_transition = 'PASS'; });
gateCase('gate-short-reason', 1, function (c) { c.reason = 'short'; });
gateCase('gate-short-decision', 1, function (c) { c.decision = 'short'; });
gateCase('gate-missing-production-change', 1, function (c) { delete c.production_change; });
gateCase('gate-empty-fix', 1, function (c) { c.prediction.fix = []; });
gateCase('gate-empty-regress-risk', 1, function (c) { c.prediction.regress_risk = []; });
gateCase('gate-repeat-1', 1, function (c) { c.budget.repeat = 1; });
gateCase('gate-max-runs-too-low', 1, function (c) { c.budget.max_runs = 2; });
gateCase('gate-before-pass', 1, function (c) { c.evidence.before = { pass: 3, total: 3 }; });
gateCase('gate-after-fail', 1, function (c) { c.evidence.after = { pass: 2, total: 3 }; });
gateCase('gate-unknown-case', 1, function (c) { c.target_case = 'c99'; });
gateCase('gate-observation-case', 1, null, function (l) { l.cases[0].status = 'observation'; });
gateCase('gate-evidence-missing', 0, function (c) { delete c.evidence; });
gateCase('gate-evidence-repeat-too-low', 1, function (c) { c.evidence.before.total = 2; c.evidence.after.total = 2; });
const noCasesFile = writeJson('gate-no-cases', baseChange());
add('gate-no-cases', 1, run(['gate', noCasesFile]));
add('gate-no-cases-allowed', 0, run(['gate', noCasesFile, '--allow-no-cases']));
// MCP: 22 cases
mcpCase('mcp-valid', 0);
mcpCase('mcp-missing-name', 1, function (m) { delete m.name; });
mcpCase('mcp-missing-tool-prefix', 1, function (m) { delete m.tool_prefix; });
mcpCase('mcp-missing-credential-source', 1, function (m) { delete m.credential_source; });
mcpCase('mcp-missing-order', 1, function (m) { delete m.order; });
mcpCase('mcp-missing-arbitration', 1, function (m) { delete m.arbitration; });
mcpCase('mcp-missing-when-not-to-use', 1, function (m) { m.when_not_to_use = ''; });
mcpCase('mcp-missing-fallback', 1, function (m) { m.fallback_on_failure = ''; });
mcpCase('mcp-missing-payload-scale', 1, function (m) { m.payload_scale = ''; });
mcpCase('mcp-missing-read-only', 1, function (m) { delete m.read_only; });
mcpCase('mcp-missing-can-write', 1, function (m) { delete m.can_write; });
mcpCase('mcp-missing-can-spend', 1, function (m) { delete m.can_spend; });
mcpCase('mcp-missing-offload', 1, function (m) { delete m.offload; });
mcpCase('mcp-missing-forbidden-domains', 1, function (m) { delete m.forbidden_domains; });
mcpCase('mcp-contradictory-write', 1, function (m) { m.read_only = true; m.can_write = true; });
mcpCase('mcp-writable-no-forbidden', 1, function (m) { m.read_only = false; m.can_write = true; m.forbidden_domains = []; });
mcpCase('mcp-hooks-no-vectors', 1, function (m) { m.guard_hooks = ['redact']; m.vectors = []; });
mcpCase('mcp-vectors-no-evidence', 1, function (m) { m.vectors = ['veto-x']; m.evidence = ''; });
mcpCase('mcp-vectors-no-veto-map', 1, function (m) { m.vectors = ['veto-x']; m.evidence = 'e'; delete m.veto_map; });
mcpCase('mcp-veto-map-bad-vector', 1, function (m) { m.vectors = ['veto-x']; m.evidence = 'e'; m.veto_map = [{ rule: 'r', vector: 'veto-y', evidence: 'e' }]; });
mcpCase('mcp-veto-map-missing-vector', 1, function (m) { m.vectors = ['veto-x', 'veto-y']; m.evidence = 'e'; m.veto_map = [{ rule: 'r', vector: 'veto-x', evidence: 'e' }]; });
mcpCase('mcp-veto-map-missing-evidence', 1, function (m) { m.vectors = ['veto-x']; m.evidence = 'e'; m.veto_map = [{ rule: 'r', vector: 'veto-x', evidence: '' }]; });
mcpCase('mcp-large-payload-no-offload', 1, function (m) { m.payload_scale = 'MB'; m.offload = false; });
mcpCase('mcp-docs-landed-empty', 1, function (m) { m.docs_landed = []; });
// Anchor: 4 cases
anchorCase('anchor-sync', 0);
anchorCase('anchor-drift', 1, function (d) { fs.appendFileSync(path.join(d, 'references', 'guide.md'), '\nchanged\n'); });
anchorCase('anchor-added-file', 1, function (d) { fs.writeFileSync(path.join(d, 'references', 'new.md'), '# New\n'); });
anchorCase('anchor-missing-lock', 1);

const passed = cases.filter(function (c) { return c.ok; }).length;
const failed = cases.length - passed;
const falsePositive = cases.filter(function (c) { return c.expected === 0 && c.actual !== 0; }).length;
const falseNegative = cases.filter(function (c) { return c.expected !== 0 && c.actual === 0; }).length;
const result = {
  schema_version: 'skillcanary/benchmark/v2',
  generated_at: new Date().toISOString(),
  total: cases.length,
  passed,
  failed,
  false_positive: falsePositive,
  false_negative: falseNegative,
  cases
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  process.stdout.write('# SkillCanary benchmark\n\n');
  process.stdout.write('| Case | Expected | Actual | Result |\n|---|---:|---:|---|\n');
  for (const c of cases) process.stdout.write('| ' + c.id + ' | ' + c.expected + ' | ' + c.actual + ' | ' + (c.ok ? 'PASS' : 'FAIL') + ' |\n');
  process.stdout.write('\nTotal: ' + cases.length + ' | Passed: ' + passed + ' | Failed: ' + failed + '\n');
  process.stdout.write('False positive: ' + falsePositive + ' | False negative: ' + falseNegative + '\n');
}

process.exit(failed === 0 ? 0 : 1);