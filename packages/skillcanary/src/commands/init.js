'use strict';

const fs = require('fs');
const path = require('path');
const { writeJson, parseArgs } = require('../lib/util');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const dir = path.resolve(args._[0] || '.');
  const skillcanaryDir = path.join(dir, '.skillcanary');
  fs.mkdirSync(skillcanaryDir, { recursive: true });

  const files = {
    'change.example.json': {
      schema_version: 'skillcanary/change/v1',
      id: '2026-09-14-fix-example',
      skill: 'example-skill',
      target: { kind: 'case', id: 'c01' },
      expected_transition: 'FAIL->PASS',
      reason: 'Describe the observed failure and why this change is the smallest fix.',
      decision: 'Describe the decision this change is supposed to change.',
      production_change: true,
      prediction: { fix: ['c01'], regress_risk: ['c02'] },
      budget: { repeat: 3, max_runs: 9 }
    },
    'cases.example.json': {
      schema_version: 'skillcanary/cases/v1',
      cases: [
        { id: 'c01', status: 'stable', criteria: 'The target behavior must change from FAIL to PASS.' },
        { id: 'c02', status: 'stable', criteria: 'This case must not regress.' }
      ]
    },
    'budget.example.json': {
      window: 20,
      max: { user_correction_count: 2, rework_turns: 3, tool_error_count: 5 }
    },
    'hook-rules.example.json': {
      preTool: [
        {
          id: 'example-deny-rule',
          pattern: 'replace-with-a-local-pattern',
          reason: 'Replace this example with a local guard rule.'
        }
      ]
    },
    'mcp.example.json': {      schema_version: 'skillcanary/mcp-onboard/v1',
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
    }
  };

  const created = [];
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(skillcanaryDir, name);
    if (!fs.existsSync(file)) {
      writeJson(file, value);
      created.push(file);
    }
  }
  if (args['with-action']) {
    const workflow = path.join(dir, '.github', 'workflows', 'skillcanary.yml');
    if (!fs.existsSync(workflow)) {
      fs.mkdirSync(path.dirname(workflow), { recursive: true });
      fs.writeFileSync(workflow, [
        'name: SkillCanary',
        '',
        'on:',
        '  pull_request:',
        '',
        'jobs:',
        '  skillcanary:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - uses: your-org/skillcanary@v1',
        '        with:',
        '          skill: .',
        ''
      ].join('\n'), 'utf8');
      created.push(workflow);
    }
  }

  process.stdout.write('SkillCanary init @ ' + dir + '\n');
  for (const file of created) process.stdout.write('  + ' + file + '\n');
  process.stdout.write('  Next: copy change.example.json to change.json and run: skillcanary gate .skillcanary/change.json .skillcanary/cases.example.json\n');
  process.stdout.write('  Hook rules stay local: copy hook-rules.example.json to hook-rules.json, then run: skillcanary hook doctor\n');
  process.stdout.write('  Outcome metrics: skillcanary budget stats --input .skillcanary/outcomes.jsonl --config .skillcanary/budget.example.json\n');
  return 0;
};