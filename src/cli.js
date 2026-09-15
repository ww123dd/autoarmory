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
function usage() { process.stdout.write('AutoArmory - auto-battle control plane for agent capabilities\n\nUsage:\n  autoarmory init [dir]\n  autoarmory observe <file|dir|-> [--format auto|junit|github|jsonl|log] [--output incidents.jsonl] [--json]\n  autoarmory propose [incidents.jsonl] [--output candidates.jsonl]\n  autoarmory gate <candidate.json> [--skillcanary <repo>] [--cases <cases.json>] [--require-provenance]\n  autoarmory record [decision.json] [--candidate id] [--action name] [--reward n] [--verified true|false] [--gate gate.json] [--evidence evidence.json] [--dir project]\n  autoarmory capability <register|list|health> [--state .selfforge] [--json]\n  autoarmory transition <candidate.json> --to <gated|shadow|canary|promoted|rejected|retired> [--gate gate.json] [--evidence evidence.json] [--reason text] [--state .selfforge] [--dir project]\n  autoarmory learn [decisions.jsonl]\n  autoarmory environment [dir] [--write]\n  autoarmory experiment compare <before.json> <after.json>\n  autoarmory experiment shadow <candidate.json>\n  autoarmory experiment canary <candidate.json> [--percent 10]\n  autoarmory policy [decisions.jsonl]\n  autoarmory acquire [candidates.jsonl] [--top 10]\n  autoarmory evolve [file|dir] [--format auto|junit|github|jsonl|log] [--skillcanary <repo>] [--cases <cases.json>] [--require-provenance]\n  autoarmory doctor [dir]\n  autoarmory report [dir] [--output report.md]\n  autoarmory version\n'); }
function main(argv) {
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { usage(); process.exit(0); }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') { process.stdout.write(require('../package.json').version + '\n'); process.exit(0); }
  const commands = { init, observe, propose, gate, learn, doctor, report, environment, experiment, policy, acquire, evolve, record, transition, capability };
  const fn = commands[cmd];
  if (!fn) { process.stderr.write('Unknown command: ' + cmd + '\n\n'); usage(); process.exit(2); }
  Promise.resolve().then(function () { return fn(rest); }).then(function (code) { process.exit(typeof code === 'number' ? code : 0); }).catch(function (err) { process.stderr.write((err && err.stack) ? err.stack : String(err)); process.stderr.write('\n'); process.exit(2); });
}
module.exports = { main, usage };
