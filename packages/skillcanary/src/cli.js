'use strict';

const lint = require('./commands/lint');
const gate = require('./commands/gate');
const anchor = require('./commands/anchor');
const mcpOnboard = require('./commands/mcp-onboard');
const init = require('./commands/init');
const verify = require('./commands/verify');
const report = require('./commands/report');
const comment = require('./commands/comment');
const importCommand = require('./commands/import');
const scan = require('./commands/scan');
const advice = require('./commands/advice');
const promote = require('./commands/promote');
const armor = require('./commands/armor');
const track = require('./commands/track');
const hook = require('./commands/hook');
const policy = require('./commands/policy');
const evidence = require('./commands/evidence');
const store = require('./commands/store');
const budget = require('./commands/budget');
const release = require('./commands/release');
const doctor = require('./commands/doctor');
const adapter = require('./commands/adapter');
const trajectory = require('./commands/trajectory');
const reliability = require('./commands/reliability');
const grader = require('./commands/grader');
const execution = require('./commands/execution');
const golden = require('./commands/golden');
const active = require('./commands/active');
const drift = require('./commands/drift');

function usage() {
  process.stdout.write(`SkillCanary - CI for Agent Skills

Usage:
  skillcanary doctor [skill-dir] [--strict] [--json]
  skillcanary lint <skill-dir> [--strict] [--json]
  skillcanary gate <change.json> [cases.json] [--json]
  skillcanary anchor <skill-dir> [--check] [--output skillcanary.lock.json]
  skillcanary mcp-onboard <record.json> [--json]
  skillcanary verify <skill-dir> [--json]
  skillcanary report <skill-dir> [--output report.md]
  skillcanary comment <skill-dir> [--file report.md] [--dry-run]
  skillcanary import <runner|auto> <result.json> [--case c01] [--output change.json]
  skillcanary scan --skill <name> --sessions <dir|file> [--output advice.jsonl]
  skillcanary advice [advice.jsonl] [--status advice] [--json]
  skillcanary promote <advice.jsonl> --id <advice-id> [--validated]
  skillcanary armor [armor.jsonl] [--status blocking] [--json]
  skillcanary track --session <id> --skill <name> --hash <hash>
  skillcanary hook <doctor|session-start|pre-tool|stop|session-end>
  skillcanary policy <record|stats|recommend|pareto|drift|simulate> ...
  skillcanary adapter <list|detect|import|export|doctor> ...
  skillcanary trajectory analyze <trace.json> [--output metrics.json]
  skillcanary reliability <estimate|compare|compose> ...
  skillcanary grader <calibrate|plan> ...
  skillcanary execution audit <workflow.json>
  skillcanary golden curate <candidates.jsonl> [--top 20]
  skillcanary active rank <advice.jsonl> [--top 10]
  skillcanary drift check [outcomes.jsonl] [--json]
  skillcanary evidence <normalize|record|stats> ...
  skillcanary store <index|query|export-sql> ...
  skillcanary budget <ingest|stats|check> ...
  skillcanary release preflight [--json]
  skillcanary init [dir] [--with-action]
  skillcanary version

Commands:
  doctor       Show the whole reliability picture and the next action.
  lint         Validate SKILL.md structure and portability.
  gate         Enforce case-first, evidence-backed skill changes.
  anchor       Hash every skill file and detect drift.
  mcp-onboard  Validate MCP boundaries, offload and veto mapping.
  verify       Run the checks configured under .skillcanary/.
  report       Render a Markdown report for CI or review.
  comment      Create or update a PR comment with the SkillCanary report.
  import       Convert runner evidence into a SkillCanary change record.
  scan         Extract advice candidates from session files.
  advice       List advice candidates.
  promote      Validate promotion eligibility and produce a case.
  armor        List armor pieces by status.
  track        Append a post-change outcome record.
  hook         Host-agnostic hook adapter (stdin JSON, stdout JSON).
  policy       Record, simulate and learn from skill-improvement decisions.
  adapter      Normalize runner, scanner, trace, registry and MCP artifacts.
  active       Rank failure candidates by expected information value.
  drift        Detect non-stationary failure signals.
  evidence     Normalize and store runner evidence envelopes.
  store        Index evidence envelopes and query eval tables.
  budget       Derive session metrics and enforce error budgets.
  release      Check credentials, metadata and privacy before publishing.
  init         Create .skillcanary/ examples in a repository.

Exit codes:
  0 pass, 1 failed check, 2 usage or parse error.
`);
}

function main(argv) {
  const cmd = argv[0];
  const rest = argv.slice(1);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    process.exit(0);
  }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    process.stdout.write(require('../package.json').version + '\n');
    process.exit(0);
  }

  const commands = {
    doctor,
    lint,
    gate,
    anchor,
    'mcp-onboard': mcpOnboard,
    verify,
    report,
    comment,
    import: importCommand,
    scan,
    advice,
    promote,
    armor,
    track,
    hook,
    policy,
    adapter,
    trajectory,
    reliability,
    grader,
    execution,
    golden,
    active,
    drift,
    evidence,
    store,
    budget,
    release,
    init
  };
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write('Unknown command: ' + cmd + '\n\n');
    usage();
    process.exit(2);
  }

  Promise.resolve()
    .then(function () { return fn(rest); })
    .then(function (code) { process.exit(typeof code === 'number' ? code : 0); })
    .catch(function (err) {
      process.stderr.write((err && err.stack) ? err.stack : String(err));
      process.stderr.write('\n');
      process.exit(2);
    });
}

module.exports = { main, usage };