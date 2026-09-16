# Selection / Execution / Outcome Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不新增 Router 的前提下，补齐 Selection、Execution、Outcome 三层证据契约，并把现有 Outcome 明确定位为 learning signal。

**Architecture:** 复用 `routing-request/routing-decision` 和 `capability-outcome`，只新增缺失的 execution trace 纵向切片。可信结果仍由 `mechanism-run + verification` 负责，`capability-outcome` 不升级为事实来源。

**Tech Stack:** Node.js CommonJS、JSON Schema Draft-07、现有 CLI 命令分派、无第三方依赖。

**Spec:** 本计划直接实现 2026-09-16 对话中确认的分层方案。

## Global Constraints

- 不新增 Router、不做自动路由策略切换。
- `selection_confidence` 未经过校准时必须为 `null`，不得由 Thompson 分数伪造。
- `execution-trace` 必须链接已存在的 `routing-decision`，skill_id 必须与 selected[0].id 一致。
- `capability-outcome` 只是学习信号；可信 closure 继续使用 `mechanism-run + verification`。
- 所有新代码先写失败测试，再实现。
- 不改 SVN；只在 SelfForge git 仓库工作。

---

### Task 1: Enrich routing decision evidence

**Files:**
- Modify: `schemas/routing-request.schema.json`
- Modify: `schemas/routing-decision.schema.json`
- Modify: `src/lib/capability.js`
- Test: `tests/capability.js`

**Interfaces:**
- Consumes: `route(capabilities, request, options)`
- Produces: decision fields `task_id`, `candidate_set`, `top_k`, `selection_margin`, `selection_confidence`, `confidence_method`

- [ ] **Step 1: Write failing assertions**

Add assertions after the existing deterministic route checks:

```javascript
result = route(requestFile, 7);
const enriched = JSON.parse(result.out);
must(enriched.task_id === 'route-task-test', 'routing decision records task_id');
must(enriched.candidate_set.length >= 3, 'routing decision records the eligible candidate set');
must(enriched.top_k.length === 3 && enriched.top_k[0].id === enriched.selected[0].id, 'routing decision records ranked top_k');
must(typeof enriched.selection_margin === 'number', 'routing decision records uncalibrated selection margin');
must(enriched.selection_confidence === null && enriched.confidence_method === 'uncalibrated', 'selection confidence must not be fabricated');
```

Update the routing request fixture with `task_id: 'route-task-test'`.

- [ ] **Step 2: Run the test to verify RED**

Run: `node tests/capability.js`
Expected: FAIL on `routing decision records task_id`.

- [ ] **Step 3: Implement schema and route fields**

Add optional `task_id` to routing-request. Add the six new required fields to routing-decision. In `route()` compute request id first, then:

```javascript
const candidateSet = ranked.map(function (item) { return item.id; });
const topK = ranked.slice(0, Math.min(3, ranked.length));
const selectionMargin = ranked.length > 1 ? ranked[0].score - ranked[1].score : null;
```

Return `task_id: request.task_id || requestId`, `candidate_set`, `top_k`, `selection_margin`, `selection_confidence: null`, `confidence_method: 'uncalibrated'`.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `node tests/capability.js`
Expected: `Capability registry tests passed`.

---

### Task 2: Add execution trace contract and CLI

**Files:**
- Create: `schemas/execution-trace.schema.json`
- Create: `src/lib/execution-trace.js`
- Create: `src/commands/execution.js`
- Modify: `src/cli.js`
- Modify: `package.json`
- Modify: `src/lib/self-eval.js`
- Test: `tests/execution.js`

**Interfaces:**
- Produces: `validateExecutionTrace(value) -> string[]`
- Produces: `normalizeExecutionTrace(value) -> {ok, trace, errors}`
- Produces: `recordExecutionTrace(stateDir, value) -> {ok, trace, errors}`
- Produces: `readExecutionTraces(stateDir) -> object[]`
- CLI: `autoarmory execution record <trace.json> --state .selfforge --json`
- CLI: `autoarmory execution list --state .selfforge --json`

- [ ] **Step 1: Write failing integration tests**

Create `tests/execution.js` that:
1. creates a temp state;
2. writes one valid routing decision to `.selfforge/routing-decisions.jsonl`;
3. records a trace for the selected skill and asserts `status === 'conformant'`;
4. asserts unknown decision and mismatched skill are rejected;
5. records a trace with `independent_process: false` and asserts `status === 'nonconformant'`;
6. asserts `execution list --json` returns both traces.

Use these core fixture fields:

```javascript
{
  schema_version: 'autoarmory/execution-trace/v1',
  id: 'exec-1',
  decision_id: 'route-1',
  task_id: 'task-1',
  skill_id: 'skill.alpha',
  plan: { steps: ['read', 'verify'] },
  steps_expected: [
    { id: 'read', description: 'Read required input', required: true },
    { id: 'verify', description: 'Run external verifier', required: true }
  ],
  steps_observed: [
    { id: 'obs-1', expected_step_id: 'read', status: 'completed' },
    { id: 'obs-2', expected_step_id: 'verify', status: 'completed' }
  ],
  order_ok: true,
  stop_conditions_ok: true,
  environment_fingerprint: 'env-1',
  isolation: {
    independent_process: true,
    temp_workspace: true,
    namespace: 'exec-1',
    dependency_versions: { node: '24.14.0' },
    evidence_refs: ['ref-process']
  },
  artifact_refs: [],
  started_at: '2026-09-16T00:00:00.000Z',
  finished_at: '2026-09-16T00:00:01.000Z'
}
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node tests/execution.js`
Expected: module not found or unknown command.

- [ ] **Step 3: Implement schema and library**

Create schema with required fields from the fixture. Implement:
- canonical `plan_sha256` from `plan` using `verify.sha256Value`;
- `status = conformant` only when all observed required steps are completed, order/stop flags true, and both isolation booleans true;
- otherwise `status = nonconformant`;
- `recordExecutionTrace` must reject unknown `decision_id`, mismatched `task_id`, and mismatched `skill_id`;
- writes `.selfforge/execution-traces.jsonl` atomically through `writeJsonl`.

- [ ] **Step 4: Implement CLI and test registration**

Add `execution` to `src/cli.js`, usage line, command map, `package.json` test chain, and `src/lib/self-eval.js` command list.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run: `node tests/execution.js`
Expected: `Execution trace tests passed`.

- [ ] **Step 6: Run selection regression**

Run: `node tests/capability.js`
Expected: `Capability registry tests passed`.

---

### Task 3: Link learning outcomes to execution evidence

**Files:**
- Modify: `schemas/capability-outcome.schema.json`
- Modify: `src/lib/capability.js`
- Modify: `src/commands/capability.js`
- Test: `tests/capability.js`
- Modify: `docs/roadmap.md`

**Interfaces:**
- `capability.recordOutcome(registryFile, outcomesFile, value, options)` where `options.executionTracesFile` optionally validates `execution_id`.

- [ ] **Step 1: Write failing outcome-link assertions**

Add a valid execution trace file first in the capability test, then record an outcome with:

```javascript
execution_id: 'exec-1'
```

Assert accepted when it matches decision/capability. Assert an outcome with an unknown `execution_id` is rejected.

- [ ] **Step 2: Run RED**

Run: `node tests/capability.js`
Expected: unknown `execution_id` is currently accepted or missing validation.

- [ ] **Step 3: Implement optional validation**

Add optional `execution_id` and `mechanism_run_id` to the outcome schema. In `recordOutcome`, when `execution_id` is supplied, load execution traces and require matching `decision_id` and `skill_id`. Keep `verified` semantics documented as a learning assertion unless it references mechanism verification.

- [ ] **Step 4: Run GREEN**

Run: `node tests/capability.js`
Expected: `Capability registry tests passed`.

---

### Task 4: Document boundaries and run full verification

**Files:**
- Create: `docs/execution-contracts.md`
- Modify: `README.md`
- Test: full suite

- [ ] **Step 1: Document the three layers**

Document:
- Selection = routing-request + routing-decision;
- Execution = execution-trace;
- Outcome = capability-outcome as learning signal, mechanism-run + verification as trusted closure;
- Router is deferred until shadow data proves selection is the bottleneck.

- [ ] **Step 2: Run full test and preflight**

Run:
```powershell
npm test
node scripts/verifier-preflight.js
node scripts/mechanism-preflight.js
```

Expected:
- `npm test` exit 0;
- verifier preflight passed or no active local profile;
- mechanism preflight no state or passed.