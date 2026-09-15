'use strict';
const { observeText } = require('../src/lib/observe');

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const clean = observeText('TEST END\nprocess EXIT code 0\nall good, no secret here\n', { format: 'log', source: 'stdin' });
must(clean.length === 0, 'clean success log must not produce incidents: ' + JSON.stringify(clean));

const broken = observeText('ERROR: boom\nprocess EXIT code 1\nprompt injection detected\n', { format: 'log', source: 'stdin' });
const modes = new Set(broken.map(function (item) { return item.failure_mode; }));
must(modes.has('runtime_error'), 'real error must be runtime_error');
must(modes.has('security_finding'), 'prompt injection must be security_finding');

console.log('observe precision tests passed: clean=0, error=detected, injection=detected');