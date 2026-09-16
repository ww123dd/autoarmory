# AutoArmory

**From its own history of failures, the AI decides the lifecycle of every mechanism and module: keep, degrade, replace, or retire. It decides what to do; only an externally recomputable fact is allowed to say whether it worked — and a promotion is rolled back when the fact behind it goes stale.**

Your agent says "fixed". This repository makes that claim checkable — on any machine, offline, with nothing but the checkout.

```bash
git clone <this repo> && cd autoarmory
node scripts/profile-run.js      # judges offline, in a sandbox
npm run check:anchors            # re-fetches every anchor through its declared channel
```

```text
PASS  portable-upstream-ms-tarball      npm-published bytes, sha512 matches the registry publication
PASS  portable-upstream-pypi-six-sdist  PyPI-published bytes, sha256 matches the PyPI publication
PASS  portable-upstream-ms-git-blob     git blob equals the copy inside the npm tarball
PASS  portable-verifier-core-sha256     the judging adapter hashes to its pinned digest
FAIL  portable-negative-control-sha256  a checker that never fails is dead
```

One PASS proves nothing on its own. The FAIL is in the profile so you can watch the checker reject; the anchored PASS entries are facts this repository does not get to choose.

## The problem

Rules accumulate. Nobody can tell which ones were actually loaded this time; each model upgrade inherits constraints written for an older one; and after every edit you still cannot say whether the change landed. "Remember this" is not a mechanism — it evaporates with the next session.

This changes the unit of work from *a rule someone must remember* into *a mechanism with a lifecycle*, and it puts the verdict outside the author:

| instead of | this repository does |
|---|---|
| the agent reports it passed | a registered read-only verifier re-runs and re-derives the fact |
| the expectation is whatever the author wrote | provenance records keep the publisher's own digest, and the vendored bytes are re-hashed against it — offline, or live through the same channel |
| a promotion outlives its evidence | a promotion must name the run it rested on; a changed artifact, contract, case, runner or expiry date invalidates that run, and the promotion is rolled back with the record that forced it |
| "you can trust my machine" | the profile ships with the repository and runs in a sandbox |

## What it is not

Not a memory system, not a router, not an agent framework. It does not make a model smarter and it does not grade itself. It only decides whether a claim about the outside world still holds — and refuses to say "done" when it cannot re-derive that.

## Where to look

- `examples/profiles/portable.profile.json` — the facts that travel with the repository
- `examples/anchors/` — vendored third-party bytes with their provenance records
- `scripts/mechanism-lifecycle.js --list` — what is promoted, what was rolled back, and why
- `docs/verifier-expansion.md` · `docs/mechanism-core.md` — what a new fact source costs, and why old verdicts expire
- `tests/operator-loop.js` · `tests/rollback.js` — the whole chain, with exactly one operator decision in it

## Capability Manager

**Capability Manager** is AutoArmory's local decision layer. It records the runner, evaluator, scanner, MCP gateway, registry, memory layer, provenance adapter or policy module used by one operator.

Each capability has provenance. Each decision is recorded. Each verified outcome can change capability health or lifecycle.

```text
capability -> constraints -> route -> compose -> outcome -> update -> degrade/replace/retire
```

Capability Manager is implemented inside AutoArmory as an internal subsystem: registry, health, routing, portfolio, outcome learning, drift detection, conformance, retirement, guarded calibration and off-policy evaluation. The runtime shape is documented in [Architecture](docs/architecture.md); the external-fact side is documented in [Verifier Expansion](docs/verifier-expansion.md).

## Why separate

- SkillCanary should remain stable, small and compatible.
- AutoArmory can experiment with capability routing, memory, active learning and policy.
- AutoArmory must be able to improve SkillCanary, but SkillCanary must not depend on AutoArmory.

## Commands

```bash
autoarmory init
autoarmory observe logs/ --output .selfforge/incidents.jsonl
pytest 2>&1 | autoarmory observe - --format log --output .selfforge/incidents.jsonl
gh issue list --repo owner/repo --json number,title,body,url | autoarmory observe - --format github --output .selfforge/incidents.jsonl
autoarmory propose .selfforge/incidents.jsonl --output .selfforge/candidates.jsonl
autoarmory gate .selfforge/candidate.json --cases examples/skillcanary-cases.json
autoarmory record --candidate cand-1 --action add_case --reward 1.5 --verified true --gate .selfforge/gate.json --evidence .selfforge/outcome-evidence.json
autoarmory close --case case-id --run run-id --state .selfforge
autoarmory transition .selfforge/candidate.json --to pending_approval --state .selfforge
node scripts/approve.js --candidate <id> --quote "<operator words>"   # the one operator decision; the record is written for you
autoarmory transition .selfforge/candidate.json --to gated --gate .selfforge/gate.json --approval .selfforge/approvals/<id>.json --state .selfforge
node scripts/mechanism-declare.js --descriptor mechanism-descriptor.json
node scripts/mechanism-lifecycle.js --mechanism <id> --promote      # evidence-backed promotion
node scripts/mechanism-lifecycle.js --mechanism <id> --rollback-if-stale   # retire when the evidence is gone
autoarmory transition .selfforge/candidate.json --to shadow --gate .selfforge/gate.json --state .selfforge
autoarmory learn .selfforge/decisions.jsonl
autoarmory environment --write
autoarmory experiment compare before.json after.json
autoarmory policy .selfforge/decisions.jsonl
autoarmory acquire .selfforge/candidates.jsonl --top 10
autoarmory evolve logs/ --format auto --cases path/to/cases.json
autoarmory admit .selfforge/candidates.jsonl --output .selfforge/admission.jsonl
autoarmory scenario list
autoarmory scenario show coding
autoarmory scenario plan coding --state .selfforge
autoarmory doctor
autoarmory capability register examples/capabilities.jsonl
autoarmory capability list --state .selfforge
autoarmory capability health --state .selfforge
autoarmory capability outcome outcome.json --state .selfforge
autoarmory capability drift runner.skillgrade --state .selfforge
autoarmory capability conformance runner.skillgrade --state .selfforge
autoarmory report --output autoarmory-report.md
```

## Article, issue and trace learning

Real failure evidence can enter AutoArmory from articles, issue history, runner logs, JUnit, GitHub JSON and OTel GenAI spans. Article mode extracts evidence lines into the failure taxonomy instead of treating the whole article as an incident.

```bash
autoarmory observe article.md --format article --output .selfforge/incidents.jsonl
autoarmory observe telemetry.json --format otel --output .selfforge/otel-incidents.jsonl
autoarmory propose .selfforge/incidents.jsonl --output .selfforge/candidates.jsonl
```

The taxonomy and action mapping are documented in [Failure Modes](docs/failure-modes.md). External evaluation standards are mapped in [Agent Evaluation Standards](docs/standards/agent-evaluation-standards.md).

## Operator interface

The primary interface is the local CLI. HTTP, SDK and Team CLI files remain available as optional internals for future consumers, but they are not the product surface and are not required for capability management. External adapters follow `docs/adapters.md`.

## Verification

The trust root is a pinned local profile: every verifier is a registered, read-only bridge over one external fact source, and every digest is re-derived instead of trusted.

A profile that travels with the repository needs no local state:

```bash
node scripts/profile-run.js --profile examples/profiles/portable.profile.json
npm run test:portable-profile
```

That run judges the same chain both ways — at least one entry must PASS and at least one must FAIL — so a reader watches the checker accept and reject instead of trusting a summary. One entry checks that the commit this profile was written against still exists in the history of the clone running it, so a rewritten history shows up as a FAIL instead of a story. The machine-local trust root (`verifiers.lock.json`) is gitignored on purpose: it pins this machine's paths and live facts, and `scripts/verifier-pin.js` regenerates it.

Three portable entries are anchored outside this repository through four channels: the vendored npm artifact, the PyPI artifact, the PyPI JSON service that publishes its digest, and the git source blob named by the npm publication (`examples/anchors/`). `npm run check:anchors` re-fetches all four and compares them with the vendored bytes. Each carries a provenance record, the test recomputes the publisher digest from the vendored bytes, and the git blob is cross-checked against the copy inside the npm tarball. See [Verifier Expansion](docs/verifier-expansion.md) and [Mechanism Core](docs/mechanism-core.md).

## Self-evaluation

```bash
autoarmory self-eval --runs 3 --output self-eval.json
```

This runs the core suites as Pass^k checks, plus conformance, capability contracts, docs and repository integrity. It is explicitly a self-evaluation, not an independent audit: the report always discloses self-assessment bias.

## Real CLI input

`observe -` reads artifacts from stdin, so real runner and CLI output can be observed without AutoArmory executing the external command itself:

```bash
pytest 2>&1 | autoarmory observe - --format log --output .selfforge/incidents.jsonl
gh issue list --repo owner/repo --json number,title,body,url | autoarmory observe - --format github --output .selfforge/incidents.jsonl
cat junit.xml | autoarmory observe - --format junit --output .selfforge/incidents.jsonl
```

## Change gate

Enable the repository-local pre-commit enforcement point:

```bash
npm run hooks:install
```

The hook runs `node scripts/change-gate.js --staged`. It blocks new abstraction surfaces unless the change includes a passing claim record, a verification improvement, or removal/downgrade of an existing layer. See [Change Gate](docs/change-gate.md).

## Mechanism core

The v0.5 slice answers one question: for a reproducible failure case, does a registered mechanism have sufficient replay evidence to close it? It records cases, mechanisms, runs, closures, and status verdicts. It does not run external tools. See [Mechanism Core](docs/mechanism-core.md).

## Gate boundary

`autoarmory gate` and `autoarmory evolve` both call the real SkillCanary gate. The operation is fail-closed: a missing SkillCanary CLI, invalid gate output, local structural error, or any SkillCanary gate error marks the candidate `rejected`. AutoArmory does not promote or execute a candidate by itself.

A gate-ready candidate carries a `change` object. AutoArmory fills the shared change fields (`id`, `target`, `expected_transition`, `prediction`) from the candidate, then passes the resulting `skillcanary/change/v1` record to `skillcanary gate`. Case targets must provide a cases file; deterministic targets do not.

Candidate promotion follows a recorded state machine: `candidate -> pending_approval -> gated -> shadow -> canary -> promoted`, with `rejected` available before promotion and `retired` after it. Gate proof is mandatory for `gated` and `shadow`; user approval is also mandatory for `pending_approval -> gated`. Outcome evidence is mandatory for `canary` and `promoted`.

Approval also creates a consumption event. The system records `decision_id -> consumer -> action -> downstream_action`; the later outcome links back through `consumption_ref` instead of assuming a decision was consumed just because it was generated.

Approval is an authorization decision, not verification evidence.

Every transition records its actor. Approval transitions use the approver id; other transitions use --actor or default to codex. The Agent prepares the candidate, gate proof, rollback and verification commands; the user only approves. After approval, the Agent performs the transition and the remaining mechanical work.

`record` refuses to append a decision unless a successful SkillCanary gate proof is provided or found on the stored candidate. A verified decision also requires outcome evidence with artifacts or before/after observations.

Run the real adapter conformance suite against the vendored SkillCanary package:

```bash
npm run test:conformance
```

## Unified product

This repository is the AutoArmory monorepo. `packages/skillcanary` contains the stable SkillCanary evidence and gate layer; the root runtime contains the local capability manager. `autoarmory canary ...` dispatches to the vendored SkillCanary CLI while the top-level commands expose local operator workflows.

## Legacy compatibility

The public package and CLI are `autoarmory`. The `selfforge` and `self-forge` commands remain as compatibility aliases, and the on-disk `.selfforge/` state directory plus `selfforge/*` schema namespaces remain stable so existing records do not break.

## Boundaries

AutoArmory does not:

- run agents;
- scan for vulnerabilities;
- replace SkillCanary;
- execute changes without approval;
- collect private transcripts into public repositories.

The dependency direction is one-way:

```text
AutoArmory -> SkillCanary contracts and gate
SkillCanary -X-> AutoArmory
```
