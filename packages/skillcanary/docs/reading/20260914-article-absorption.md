# Article absorption - 2026-09-14

Meta-skill decision rule: default not integrate. Only items that can be written as a verifiable criterion become a candidate change.

| # | Article | Class | Reason | Criterion / action |
|---|---|---|---|---|
| 01 | Agent Insight x DeepSeek Harness | 可做 | Uses trace + outcome + independent oracle + same-condition rerun + different-file regression | Add evidence-discipline doc; require canary for blocking |
| 02 | 工具型 Agent 分层评测 | 可做 | Outcome / Decision / Action / Reliability; Case Contract; Hard Gate | Keep case-first gate; document four layers |
| 03 | 如何给 Agent 路考 | 可做 | Pass^3, trajectory, server audit, environment snapshot, hidden/live benchmarks | Add `held_out` case rule |
| 04 | 改进 Agent Harness 七篇 | 印证 | Component observability, change manifest, read-only frozen surfaces, regression prediction | Already reflected in `change.json` |
| 05 | Repo-To-Skill | 印证 | Single incident goes to candidate pool; FAIL->PASS or >=2 occurrences before rule | Already in doctrine |
| 06 | 跨 Agent Skills 管理 | 印证 | Single source / mirror; currently `.cc-switch` + `.codex` mirror | Already implemented |
| 07 | 删掉 80% Skill | 可做 | Rule bloat, lost-in-middle, negative-instruction effects | Shorten meta-skill description; move detail to body |
| 08 | darwin-skill | 印证 | Baseline, one-dimension change, rollback on no gain | Already in change gate |
| 09 | Building Effective Agents | 印证 | Routing; voting needs independence; executor must not be its own safety officer | Independent oracle is required for world-layer evidence |
| 10 | OpenSkill / SkillHone | 印证 | Persistent decision history; ablation shows decision history matters | Keep change history and decision ledger |
| 11 | skill-up | 印证 | Local evaluation tool already used by the project | Keep as external runner |
| 12 | WikiSkill | 不融入 | Previously tested; no gain; rolled back | Keep as negative example |
| 13 | Context Engineering | 可做 | Tool descriptions are context; overlapping tools create selection confusion | Keep tool contracts and non-overlapping surfaces |
| 14 | Harness 架构设计 | 印证 | Five-layer / eight-system decomposition | Matches runtime-layers doc |
| 15 | Agent 治理: Hook | 可做 | Deterministic boundaries belong in hooks, not prompts | Implemented `hook` command |
| 16 | 别凭感觉改 Skill | 可做 | Automated test and regression evaluation for skills | Implemented benchmark and gate |
| 17 | AgentLoop Skill evaluation | 可做 | Ablation must show real benefit | Require evidence before promotion |
| 18 | Agent 评测白皮书 | 可做 | Systematic evaluation framework | Covered by evidence-discipline doc |
| 19 | 多 Agent 不是默认选项 | 可做 | Avoid multi-agent before single-agent armor is proven | Add to non-goals |
| 20 | 确定性 Harness | 可做 | Deterministic first, probabilistic second | Implemented hook/CI split |

## Candidate changes from this batch

1. Add `quarantined` to advice and armor status.
2. Add `held_out` to cases and reject held-out cases as change targets.
3. Require a canary for blocking promotion.
4. Add evidence-discipline documentation.
5. Keep multi-agent out of the default path.