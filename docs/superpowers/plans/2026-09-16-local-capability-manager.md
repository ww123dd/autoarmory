# Local Capability Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AutoArmory 从“跨厂商控制面”重新定位为“单操作者本地能力管理器”，让用户成为真实消费者，Agent 成为执行者，用户只审批。

**Architecture:** 保留 capability registry、verifier、mechanism、execution trace、approval 和 lifecycle；降级跨厂商 API/SDK/Team CLI 叙事；让 CLI route 真正写入 routing decision；让 execution trace 在缺少 routing decision 时可降级为 `unlinked`；新增最小的 friction policy ledger，记录用户操作摩擦并自动选择 `auto_execute / approval_required / record_only`。

**Tech Stack:** Node.js CommonJS、JSON Schema Draft-07、现有 CLI、现有 JSONL 持久化。

**Spec:** 2026-09-16 对话中确认的 local capability manager 方向。

## Global Constraints

- 不新增“跨厂商”“控制面”“平台”叙事。
- 用户是合法消费者和审批者；Agent 负责执行，用户不执行机械操作。
- `vendor` 字段保留为 provenance，不删除。
- 不删除旧文件；只从公共命令面和 README 主叙事降级。
- 新增抽象必须同步降级 `serve` 公共入口。
- verifier 仍是可信结果来源；friction 只是操作策略，不是验证根。
- 所有代码改动先写失败测试。

---

### Task 1: Reposition the product and downgrade cross-vendor surfaces

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `docs/why.md`
- Modify: `docs/architecture.md`
- Modify: `src/cli.js`
- Test: `tests/run.js`

- [ ] **Step 1: Update tests first**

Assert that CLI help no longer advertises `serve`, and README no longer contains `cross-vendor` or `capability control plane`.

- [ ] **Step 2: Run RED**

Run: `node tests/run.js`
Expected: FAIL on the new positioning assertions.

- [ ] **Step 3: Implement the reposition**

Use this first sentence:

```markdown
# AutoArmory

A local capability manager for one operator. It turns "my agent said it fixed this" into "the database says it is fixed."
```

Update the package description accordingly. Remove `serve` from the CLI command map and usage. Keep `src/commands/serve.js` and `src/lib/api.js` as optional internals, but remove them from the main product path.

- [ ] **Step 4: Run focused tests**

Run: `node tests/run.js`
Expected: PASS.

---

### Task 2: Make routing decisions consumable from the CLI

**Files:**
- Modify: `src/commands/capability.js`
- Modify: `src/cli.js`
- Test: `tests/capability.js`

- [ ] **Step 1: Write the failing CLI route test**

In `tests/capability.js`, invoke:

```javascript
run(['capability', 'route', requestFile, '--state', state, '--json'])
```

Assert exit 0, `.selfforge/routing-decisions.jsonl` exists, and its first row has the routed capability id.

- [ ] **Step 2: Run RED**

Run: `node tests/capability.js`
Expected: FAIL because `route` is not a CLI subcommand.

- [ ] **Step 3: Implement `capability route`**

Load the request JSON, call `capability.route`, append to `routing-decisions.jsonl` unless `--no-write`, and print the decision.

- [ ] **Step 4: Run GREEN**

Run: `node tests/capability.js`
Expected: `Capability registry tests passed`.

---

### Task 3: Allow execution traces to be linked or unlinked

**Files:**
- Modify: `schemas/execution-trace.schema.json`
- Modify: `src/lib/execution-trace.js`
- Modify: `tests/execution.js`

- [ ] **Step 1: Write the failing unlinked trace test**

Create a trace without `decision_id` and record it. Assert:

```text
selection_status = unlinked
```

and that recording succeeds.

- [ ] **Step 2: Run RED**

Run: `node tests/execution.js`
Expected: FAIL because `decision_id` is required.

- [ ] **Step 3: Implement optional linking**

- When `decision_id` is present, preserve current validation.
- When absent, set `selection_status: 'unlinked'`.
- When present and valid, set `selection_status: 'linked'`.

- [ ] **Step 4: Run GREEN**

Run: `node tests/execution.js`
Expected: `Execution trace tests passed`.

---

### Task 4: Add friction policy ledger

**Files:**
- Create: `src/lib/friction.js`
- Modify: `src/commands/execution.js`
- Modify: `tests/execution.js`
- Modify: `docs/execution-contracts.md`

- [ ] **Step 1: Write the failing friction tests**

Use the real case:

```text
user: “不要让我做操作，我只需要审批。”
intent: manual_operation_fatigue
reversible: true
blast_radius: local
```

Assert decision `auto_execute`, `user_actions_required=1` for approval only, and no manual step list.

Also assert a vague `record_only` case and an irreversible `approval_required` case.

- [ ] **Step 2: Run RED**

Run: `node tests/execution.js`
Expected: FAIL because friction policy is missing.

- [ ] **Step 3: Implement friction policy**

Create decisions:

```text
auto_execute
approval_required
record_only
```

Use this rule:

```text
explicit friction + reversible + local -> auto_execute
explicit friction + irreversible/high blast radius -> approval_required
missing target or one-off emotional signal -> record_only
```

Persist to `.selfforge/friction-events.jsonl` through:

```text
autoarmory execution friction record <event.json>
autoarmory execution friction list
```

- [ ] **Step 4: Run GREEN**

Run: `node tests/execution.js`
Expected: `Execution trace tests passed`.

---

### Task 5: Full verification and commit

- [ ] **Step 1: Run full suite**

```powershell
npm test
node scripts/verifier-preflight.js
node scripts/mechanism-preflight.js
```

- [ ] **Step 2: Run change-gate**

```powershell
git add .
node scripts/change-gate.js --staged --json
```

Expected: PASS with `downgrade=true` because `serve` is removed from the public command surface.

- [ ] **Step 3: Commit**

```powershell
git commit -m "refactor: reposition as local capability manager"
```