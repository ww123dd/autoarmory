'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, readJsonl, writeText } = require('../lib/util');
const { summarize, recommend } = require('../lib/learn');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const dir = path.resolve(args._[0] || '.');
  const state = path.join(dir, '.selfforge');
  const incidents = readJsonl(path.join(state, 'incidents.jsonl'));
  const candidates = readJsonl(path.join(state, 'candidates.jsonl'));
  const decisions = readJsonl(path.join(state, 'decisions.jsonl'));
  const markdown = '# AutoArmory Report\n\n- Incidents: ' + incidents.length + '\n- Candidates: ' + candidates.length + '\n- Decisions: ' + decisions.length + '\n- Recommendation: ' + (recommend(decisions) ? recommend(decisions).action : 'none') + '\n\n' + '## Actions\n\n' + summarize(decisions).map(function (item) { return '- ' + item.action + ': n=' + item.count + ', mean=' + item.mean_reward; }).join('\n') + '\n';
  if (args.output) writeText(path.resolve(args.output), markdown); else process.stdout.write(markdown);
  return 0;
};
