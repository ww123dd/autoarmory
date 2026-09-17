'use strict';
const init = require('./commands/init');
const observe = require('./commands/observe');
const propose = require('./commands/propose');
const gate = require('./commands/gate');
const learn = require('./commands/learn');
const doctor = require('./commands/doctor');
const report = require('./commands/report');
const environment = require('./commands/environment');
const experiment = require('./commands/experiment');
const policy = require('./commands/policy');
const acquire = require('./commands/acquire');
const evolve = require('./commands/evolve');
const record = require('./commands/record');
const transition = require('./commands/transition');
const capability = require('./commands/capability');
const canary = require('./commands/canary');
const selfEval = require('./commands/self-eval');
const demo = require('./commands/demo');
const bench = require('./commands/bench');
const integrate = require('./commands/integrate');
const admit = require('./commands/admit');
const scenario = require('./commands/scenario');
const close = require('./commands/close');

function usage() {
  process.stdout.write([
    'AutoArmory - evidence and mechanism verdicts for agent capabilities',
    '',
    'Usage:',
    '  autoarmory init [dir]',
    '  autoarmory observe <file|dir|-> [--format auto|article|markdown|otel|junit|github|jsonl|log] [--output incidents.jsonl] [--json]',
    '  autoarmory propose [incidents.jsonl] [--output candidates.jsonl]',
    '  autoarmory gate <candidate.json> [--skillcanary <repo>] [--cases <cases.json>] [--require-provenance]',
    '  autoarmory record [decision.json] [--candidate id] [--action name] [--reward n] [--verified true|false] [--gate gate.json] [--evidence evidence.json] [--dir project]',
    '  autoarmory close --case <case-id> --run <run-id> [--state .selfforge] [--json]',
    '  autoarmory inbox [--state .selfforge] [--json]',
    '  autoarmory result <case|run|artifact-id> [--state .selfforge] [--json]',
    '  autoarmory approve --candidate <id> --quote "<operator words>" [--state .selfforge] [--json]',
    '  autoarmory status [--state .selfforge] [--json]',
    '  autoarmory intake artifact <descriptor.json> [--state .selfforge] [--repo .] [--json]',
    '  autoarmory bind artifact <artifact-id> --case <case-id> --verifier <verifier-id> [--case-file case.json] [--state .selfforge] [--repo .] [--json]',
    '  autoarmory run artifact <artifact-id> [--trials 3] [--state .selfforge] [--repo .] [--json]',
    '  autoarmory canary <command> [args]',
    '  autoarmory capability <register|list|health|outcome|drift|conformance> [--state .selfforge] [--json]',
    '  autoarmory transition <candidate.json> --to <pending_approval|gated|shadow|canary|promoted|rejected|retired> [--gate gate.json] [--approval approval.json] [--actor actor] [--evidence evidence.json] [--reason text] [--state .selfforge] [--dir project]',
    '  autoarmory learn [decisions.jsonl]',
    '  autoarmory environment [dir] [--write]',
    '  autoarmory experiment compare <before.json> <after.json>',
    '  autoarmory experiment shadow <candidate.json>',
    '  autoarmory experiment canary <candidate.json> [--percent 10]',
    '  autoarmory policy [decisions.jsonl]',
    '  autoarmory acquire [candidates.jsonl] [--top 10]',
    '  autoarmory evolve [file|dir] [--format auto|junit|github|jsonl|log] [--skillcanary <repo>] [--cases <cases.json>] [--require-provenance]',
    '  autoarmory doctor [dir]',
    '  autoarmory report [dir] [--output report.md]',
    '  autoarmory scenario <list|show|plan|bench> [--state .selfforge] [--json]',
    '  autoarmory admit [candidates.jsonl] [--output admission.jsonl] [--json]',
    '  autoarmory integrate <list|import> [--state .selfforge] [--json]',
    '  autoarmory demo [--seed 7] [--output demo.md] [--json]',
    '  autoarmory bench [--seed 11] [--output bench.md] [--json]',
    '  autoarmory self-eval [--runs 3] [--json] [--output report.json]',
    '  autoarmory version',
    ''
  ].join('\n'));
}

function main(argv) {
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { usage(); process.exit(0); }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') { process.stdout.write(require('../package.json').version + '\n'); process.exit(0); }
  const commands = { init, observe, propose, gate, learn, doctor, report, environment, experiment, policy, acquire, evolve, record, transition, capability, canary, "self-eval": selfEval, demo, bench, integrate, admit, scenario, close, inbox: doctor.inbox, result: doctor.result, approve: doctor.approve, status: doctor.status, intake: doctor.intake, bind: doctor.bind, run: doctor.run };
  const fn = commands[cmd];
  if (!fn) { process.stderr.write('Unknown command: ' + cmd + '\n\n'); usage(); process.exit(2); }
  Promise.resolve().then(function () { return fn(rest); }).then(function (code) { process.exit(typeof code === 'number' ? code : 0); }).catch(function (err) { process.stderr.write((err && err.stack) ? err.stack : String(err)); process.stderr.write('\n'); process.exit(2); });
}
module.exports = { main, usage };