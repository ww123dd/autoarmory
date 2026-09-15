'use strict';

const MODES = [
  { mode: 'masked_failure', severity: 'critical', action: 'add_guard', patterns: [/掩盖故障/, /隐藏失败/, /美化/] },
  { mode: 'evidence_fabrication', severity: 'critical', action: 'add_guard', patterns: [/行号冒充/, /证据.*冒充/, /伪造证据/] },
  { mode: 'self_verification', severity: 'critical', action: 'add_evidence', patterns: [/修复者自证/, /自证/, /独立验证/] },
  { mode: 'safety_violation', severity: 'critical', action: 'add_guard', patterns: [/高危.*拦住/, /写操作.*走人/, /默认拒绝/, /敏感字段/, /越权/] },
  { mode: 'tool_selection_error', severity: 'high', action: 'add_conformance_check', patterns: [/工具选错/, /选错工具/, /工具选择.*(错|致命)/] },
  { mode: 'tool_parameter_error', severity: 'high', action: 'add_case', patterns: [/参数填错/, /参数错误/, /工具参数/] },
  { mode: 'missing_validation', severity: 'high', action: 'add_evidence', patterns: [/validate.*(没跑|未跑|没有跑)/, /验证.*缺失/, /没有验证/] },
  { mode: 'rollback_missing', severity: 'high', action: 'add_rollback', patterns: [/快照.*回滚/, /版本回滚/, /历史回滚/, /没有回滚/, /rollback/i] },
  { mode: 'tool_degradation', severity: 'high', action: 'add_drift_check', patterns: [/工具(使用|调用)?退化/, /工具.*退化/, /tool degradation/i] },
  { mode: 'state_drift', severity: 'high', action: 'add_drift_check', patterns: [/状态漂移/, /持续漂移/, /state drift/] },
  { mode: 'error_accumulation', severity: 'high', action: 'add_canary', patterns: [/错误累积/, /error accumulation/] },
  { mode: 'collapse_behavior', severity: 'critical', action: 'add_guard', patterns: [/崩溃行为/, /collapse behavior/] },
  { mode: 'failure_vs_no_run', severity: 'high', action: 'add_failure_mode', patterns: [/NO_RUN/, /没有运行/, /未运行/] },
  { mode: 'ambiguous_error', severity: 'medium', action: 'add_evidence', patterns: [/模糊的.*not_found/, /not_found.*模糊/, /错误信息不清/] },
  { mode: 'cost_overrun', severity: 'high', action: 'add_cost_guard', patterns: [/综合成本.*高于人工/, /成本.*贵/, /成本超预算/, /成本六账/] },
  { mode: 'fabricated_answer', severity: 'critical', action: 'add_guard', patterns: [/编造/, /硬编.*答案/, /看似合理.*答案/] },
  { mode: 'expectation_mismatch', severity: 'medium', action: 'add_case', patterns: [/预期管理/, /口径理解偏差/, /预期不符/] },
  { mode: 'communication_error', severity: 'medium', action: 'add_case', patterns: [/错误沟通/, /沟通不清/, /表达不清/] },
  { mode: 'tool_efficiency_error', severity: 'medium', action: 'add_budget_guard', patterns: [/反复重试/, /循环调用/, /工具.*效率/] },
  { mode: 'incomplete_output', severity: 'medium', action: 'add_case', patterns: [/产物完整率/, /输出不完整/, /缺失产物/] },
  { mode: 'gate_bypass', severity: 'critical', action: 'add_gate', patterns: [/绕过.*门禁/, /跳过.*gate/, /gate.*绕过/] },
  { mode: 'synthetic_overclaim', severity: 'critical', action: 'add_evidence', patterns: [/合成数据/, /题库污染/, /案例污染/] },
  { mode: 'scope_creep', severity: 'medium', action: 'reject_scope', patterns: [/功能越多.*成熟/, /造平台/, /方向冲突/] },
  { mode: 'mcp_conformance', severity: 'high', action: 'add_mcp_conformance', patterns: [/MCPMark/, /MCP.*sandbox/, /auto-resume/] },
  { mode: 'agent_judge_bias', severity: 'medium', action: 'add_calibration', patterns: [/Agent-as-a-Judge/, /judge.*偏见/, /人工抽样/] },
  { mode: 'passk_misuse', severity: 'high', action: 'add_reliability_metric', patterns: [/Pass@k.*Pass\^k/i, /Pass\^k.*Pass@k/i, /生产环境.*Pass\^k/i, /决策.*Pass\^k/i, /τ.?bench/i] },
  { mode: 'otel_schema_drift', severity: 'medium', action: 'add_otel_adapter', patterns: [/OTel/, /gen_ai\./, /semantic conventions?/i] },
  { mode: 'benchmark_contamination', severity: 'high', action: 'add_evidence', patterns: [/题库.*污染/, /案例污染/, /基准.*不(可|能)迁移/, /题.*别人域/, /benchmark.*contamination/i] }
];

function matchFailureModes(text) {
  const value = String(text || '');
  return MODES.filter(function (item) { return item.patterns.some(function (pattern) { return pattern.test(value); }); });
}

function actionForMode(mode) {
  const found = MODES.find(function (item) { return item.mode === mode; });
  return found ? found.action : 'collect_evidence';
}

function severityForMode(mode) {
  const found = MODES.find(function (item) { return item.mode === mode; });
  return found ? found.severity : 'medium';
}

module.exports = { MODES, matchFailureModes, actionForMode, severityForMode };
