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
function usage() { process.stdout.write('SelfForge - self-evolution runtime for agent skills\n\nUsage:\n  selfforge init [dir]\n  selfforge observe <file|dir> [--output incidents.jsonl]\n  selfforge propose [incidents.jsonl] [--output candidates.jsonl]\n  selfforge gate <candidate.json> [--skillcanary <repo>] [--cases <cases.json>] [--require-provenance]\n  selfforge record [decision.json] [--candidate id] [--action name] [--reward n] [--verified true|false] [--gate gate.json] [--evidence evidence.json] [--dir project]\n  selfforge transition <candidate.json> --to <gated|shadow|canary|promoted|rejected|retired> [--gate gate.json] [--evidence evidence.json] [--reason text] [--state .selfforge] [--dir project]\n  selfforge learn [decisions.jsonl]\n  selfforge environment [dir] [--write]\n  selfforge experiment compare <before.json> <after.json>\n  selfforge experiment shadow <candidate.json>\n  selfforge experiment canary <candidate.json> [--percent 10]\n  selfforge policy [decisions.jsonl]\n  selfforge acquire [candidates.jsonl] [--top 10]\n  selfforge evolve [file|dir] [--format auto|junit|github|jsonl|log] [--skillcanary <repo>] [--cases <cases.json>] [--require-provenance]\n  selfforge doctor [dir]\n  selfforge report [dir] [--output report.md]\n  selfforge version\n'); }
function main(argv) {
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { usage(); process.exit(0); }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') { process.stdout.write(require('../package.json').version + '\n'); process.exit(0); }
  const commands = { init, observe, propose, gate, learn, doctor, report, environment, experiment, policy, acquire, evolve, record, transition };
  const fn = commands[cmd];
  if (!fn) { process.stderr.write('Unknown command: ' + cmd + '\n\n'); usage(); process.exit(2); }
  Promise.resolve().then(function () { return fn(rest); }).then(function (code) { process.exit(typeof code === 'number' ? code : 0); }).catch(function (err) { process.stderr.write((err && err.stack) ? err.stack : String(err)); process.stderr.write('\n'); process.exit(2); });
}
module.exports = { main, usage };
