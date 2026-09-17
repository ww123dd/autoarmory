# SkillCanary

**Agent 可靠变更的控制面。**

Agent 出问题，不是因为团队少了一个 prompt linter。真正的问题是：一次真实失败没有被变成 case；一次改动说不清修好了什么；工具会漂移；权限太大；下一轮只能靠记忆，而不是证据。

SkillCanary 位于 agent runner、MCP server 和 CI 之间。它把真实失败变成证据，把改动放进门里，把结果存下来，再推荐下一步该试什么。

```text
真实失败 -> case -> evidence -> gate -> outcome -> policy
```

它不是 agent runner，不是安全扫描器，也不是 registry。那些工具回答“能不能跑”“安不安全”“怎么分发”。SkillCanary 回答：

> **这次 agent 改动能不能落地？下一步应该改什么？**

## 它针对的真实痛点

| 用户痛点 | SkillCanary 做什么 |
|---|---|
| “它又飘了。” | 要求 case 或 deterministic target，并要求可测状态迁移。 |
| “工具调用又失败了。” | 把 MCP 边界、fallback、offload、veto_map 变成一等检查。 |
| “我证明不了改动有没有用。” | 存储 before/after 证据，并校验 provenance 和 hash。 |
| “同一个错误反复出现。” | 把事故变成 advice 候选和可执行回归。 |
| “规则越加越多，永远停不下来。” | 统计纠正、返工和工具错误预算，到达阈值就停。 |
| “不知道下一步该修哪里。” | 记录 state/action/outcome，并推荐下一步动作。 |

## 快速开始

```bash
skillcanary doctor ./skills/my-skill
```

`doctor` 是统一入口。它报告当前 skill、hook、evidence 和 error budget 的状态，并给出下一步动作。

完整闭环：

```bash
skillcanary init . --with-action
skillcanary import auto runner-result.json --case c01 --skill my-skill --output .skillcanary/change.json
skillcanary gate .skillcanary/change.json .skillcanary/cases.json --require-provenance
skillcanary anchor ./skills/my-skill --check
skillcanary hook doctor
skillcanary release preflight
```

存储证据：

```bash
skillcanary evidence normalize raw-result.json --output evidence.json
skillcanary evidence record evidence.json --log .skillcanary/evidence.jsonl
skillcanary store index --input .skillcanary/evidence.jsonl --dir .skillcanary/store
skillcanary store query --dir .skillcanary/store --verdict FAIL->PASS --json
```

追踪改动是否真的有效：

```bash
skillcanary budget ingest sessions.json --output .skillcanary/outcomes.jsonl
skillcanary budget check --input .skillcanary/outcomes.jsonl --config .skillcanary/budget.json
```

> 首次 npm 发布前，把 `skillcanary` 换成 `node bin/skillcanary.js`。

## 闭环

### 1. Observe

真实会话和 runner artifact 变成失败信号。扫描本地优先，只产出 advice 候选，不直接变成永久规则。

### 2. Decide

一次改动必须说明：

- target case 或 deterministic check；
- 预期状态迁移；
- 预期修好什么；
- 可能弄坏什么；
- 重复预算。

### 3. Gate

`gate` 拒绝观察项、held-out、平手、重复不足和未关联改动。使用 `--require-provenance` 后，还会检查独立评审和证据文件 hash。

### 4. Store

`eval_run` 和 `eval_case_score` 会被物化成可查询记录，并支持通用 SQL 导出。

### 5. Learn

outcome 信号进入 error budget 和 policy engine。当前 policy 是 UCB contextual bandit，刻意保持最小可用，用来学习“针对某种失败模式，哪种改法有效”。

## 为什么不一样

| 已有层 | 它负责什么 | SkillCanary 与它的关系 |
|---|---|---|
| skillgrade / agent-skills-eval / promptfoo | 运行和评分 eval | 用 `import auto` 消费 artifact |
| skills-best-practices | 讲 skill 怎么写 | 把建议变成可执行检查 |
| skillwarden / skillguard / skillgate | 安全扫描与安装策略 | 安全保持独立，结果可作为输入 |
| SkillSeal | 指纹与签名 | 未来接入 provenance |
| skillrot / SkillDrift | 检测漂移 | 把漂移当作 gate 的一个信号 |
| Registry | 分发 skill | 在发布前做门 |

差异不是“又多一个检查”，而是完整闭环：

> **观察真实失败。决定改动。验证证据。存储结果。学习下一步。**

## 主要命令

| 命令 | 用途 |
|---|---|
| `doctor [skill]` | 统一可靠性状态与下一步动作。 |
| `init` | 生成 change、cases、budget、hook 示例。 |
| `lint` | 检查结构、引用和可移植性。 |
| `gate` | 检查 target、evidence、provenance、held-out。 |
| `anchor` | 逐文件 hash 与漂移检测。 |
| `mcp-onboard` | 检查 MCP 边界、fallback、offload、veto_map。 |
| `import <runner|auto>` | runner artifact 转 change。 |
| `evidence` | 证据归一化、追加、汇总。 |
| `store` | 物化、查询、导出 eval 表。 |
| `budget` | 推导纠正、返工、工具错误信号。 |
| `scan / advice / promote / armor / track` | 提取候选并跟踪结果。 |
| `hook` | 宿主无关的会话和工具事件适配器。 |
| `policy` | 记录决策、Pareto/drift 分析、算法对比和下一步推荐。 |
| `trajectory` | 计算六维轨迹指标。 |
| `reliability` | pass^k、trial 对比、步骤可靠性合成。 |
| `grader` | judge 校准与 grader 策略选择。 |
| `execution` | 审计 deterministic/workflow/agent/human 模式。 |
| `golden` | 整理 capability / regression golden set。 |
| `adapter` | 归一化 runner、scanner、trace、registry、MCP artifact。 |
| `active rank` | 按信息价值排序失败候选。 |
| `drift check` | 检测 outcome 的 change-point 漂移。 |
| `release preflight` | 发布前检查 metadata、凭据和隐私。 |

## 当前证据

- 59 个确定性回归：0 误杀、0 漏杀。
- 21 个可执行自回归。
- 已实现六维轨迹指标、pass^k 可靠性、grader 校准和执行模式审计。
- 已实现 runner、security、trace、registry、provenance、MCP、EvalPort 的 canonical adapter，并支持 SARIF/JUnit/EvalPort/OTel 导出。
- 已实现 greedy、UCB、Thompson、hybrid、Pareto、CUSUM drift 的安全策略实验场。
- 已实现带 SHA-256 证据校验的 provenance gate。
- 已实现 evidence store、JSONL 物化和 SQL 导出。
- 已实现 error budget。
- 已实现 hook doctor。
- 已实现 privacy / release preflight。
- 已交付中英文文档。

当前是 Alpha。hosted dashboard、跨仓库元学习和签名 artifact 属于计划中，不在已完成范围。

## Algorithm Lab

策略引擎现在支持：

- greedy、UCB、Thompson、hybrid；
- Beta 后验不确定性；
- fixed、regression、correction、rework、tool-error、cost 的 Pareto 分析；
- CUSUM 漂移检测；
- active case ranking；
- 固定 seed 的确定性 simulation。

```bash
skillcanary policy simulate --horizon 100 --seed 7
skillcanary policy pareto --log .skillcanary/decisions.jsonl
skillcanary policy drift --log .skillcanary/decisions.jsonl
skillcanary active rank .skillcanary/advice.jsonl --top 10
skillcanary drift check .skillcanary/outcomes.jsonl
```

## Adapter 控制面

SkillCanary 不需要重写每个 runner 或 scanner。adapter 把外部 artifact 归一化到统一 envelope：

```bash
skillcanary adapter list
skillcanary adapter detect result.json
skillcanary adapter import security result.json --output risk.json
skillcanary adapter export result.json --format sarif --output result.sarif
skillcanary adapter doctor
```

core 管理 evidence contract、gate、store 和 policy；adapter 只负责厂商差异。

## 从源码安装

```bash
git clone <your-fork-or-repo>
cd skillcanary
node bin/skillcanary.js doctor examples/basic-skill
npm test
npm run benchmark
npm run benchmark:real
```

## 文档

- [定位](docs/positioning.md)
- [真实痛点](docs/pain-points.md)
- [证据模型](docs/evidence-model.md)
- [证据存储](docs/evidence-storage.md)
- [错误预算](docs/error-budget.md)
- [策略引擎](docs/policy-engine.md)
- [运行时分层](docs/architecture/runtime-layers.md)
- [集成](docs/integrations/README.md)
- [威胁模型](docs/threat-model.md)
- [非目标](docs/non-goals.md)

## 安全与隐私

- 会话扫描本地优先。
- 原始会话不进入公开仓库。
- 公开仓库不包含内网路径、凭据、业务词和用户 transcript。
- 高风险动作需要人工批准。
- Blocking 升格需要确定性验证与 must-fail canary。
- Hook 规则是本地策略，不是 sandbox。
- Error budget 耗尽表示要收集新事故，不是再加规则。

## 状态

`skillcanary@0.9.1` - Alpha，无外部运行时依赖，跨平台。

Agent 执行交给 `skillgrade`、`agent-skills-eval`、`promptfoo` 或你自己的 harness。

## License

MIT
