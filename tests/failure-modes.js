'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-articles-'));
const article = path.join(temp, 'article.md');
fs.writeFileSync(article, [
  '# 翻车记录',
  '工具选错比参数填错更致命，Agent 第一步就可能走错方向。',
  '产物完整率只有 8/11，validate 脚本没有跑，证据还用行号冒充 diff。',
  '高危 SQL 必须在执行前拦住，写操作永远走人，默认拒绝比默认允许安全。',
  '修复者自证不够，需要独立验证；掩盖故障和合理降级必须分开。',
  '没有快照回滚，工具退化后会持续漂移。'
].join(String.fromCharCode(10)), 'utf8');

function run(args) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}

const incidentsFile = path.join(temp, 'incidents.jsonl');
let result = run(['observe', article, '--format', 'article', '--output', incidentsFile]);
must(result.code === 0 && fs.existsSync(incidentsFile), 'article observation');
const incidents = fs.readFileSync(incidentsFile, 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean).map(function (line) { return JSON.parse(line); });
const modes = new Set(incidents.map(function (item) { return item.failure_mode; }));
for (const mode of ['tool_selection_error', 'tool_parameter_error', 'missing_validation', 'evidence_fabrication', 'safety_violation', 'self_verification', 'masked_failure', 'rollback_missing', 'tool_degradation', 'state_drift']) {
  must(modes.has(mode), 'article failure mode: ' + mode);
}

const noisyArticle = path.join(temp, 'noisy.md');
fs.writeFileSync(noisyArticle, [
  '《2026 大数据最新面试题库》仅用于面试准备。',
  'Pass@k：跑 k 次，至少 1 次成功，衡量能力上限。'
].join(String.fromCharCode(10)), 'utf8');
result = run(['observe', noisyArticle, '--format', 'article', '--json']);
must(result.code === 1 && !/benchmark_contamination/.test(result.out) && !/passk_misuse/.test(result.out), 'article classifier precision');
const candidatesFile = path.join(temp, 'candidates.jsonl');
result = run(['propose', incidentsFile, '--output', candidatesFile]);
must(result.code === 0 && fs.existsSync(candidatesFile), 'article proposal');
const candidates = fs.readFileSync(candidatesFile, 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean).map(function (line) { return JSON.parse(line); });
must(candidates.every(function (item) { return item.failure_mode; }), 'candidate preserves failure_mode');
const actions = new Set(candidates.map(function (item) { return item.action; }));
for (const action of ['add_conformance_check', 'add_case', 'add_evidence', 'add_guard', 'add_rollback', 'add_drift_check']) {
  must(actions.has(action), 'proposal action: ' + action);
}

const otelFile = path.join(temp, 'otel.json');
fs.writeFileSync(otelFile, JSON.stringify({
  resourceSpans: [{ scopeSpans: [{ spans: [{
    traceId: 'trace-1', spanId: 'span-1', name: 'invoke_agent',
    status: { code: 2, message: 'tool invocation failed' },
    attributes: [
      { key: 'gen_ai.operation.name', value: { stringValue: 'execute_tool' } },
      { key: 'gen_ai.agent.name', value: { stringValue: 'data-agent' } },
      { key: 'gen_ai.tool.name', value: { stringValue: 'lookup_metric' } },
      { key: 'error.type', value: { stringValue: 'tool_parameter_error' } },
      { key: 'error.message', value: { stringValue: 'missing required argument tenant_id' } }
    ]
  }] }] }]
}), 'utf8');
result = run(['observe', otelFile, '--format', 'otel', '--json']);
must(result.code === 0 && /lookup_metric/.test(result.out) && /tool_parameter_error/.test(result.out), 'OTel GenAI error span observation');
console.log('Article failure-mode tests passed');