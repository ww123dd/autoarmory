'use strict';

const skillcanary = require('../lib/skillcanary');

module.exports = function run(argv) {
  const result = skillcanary.run(argv, { cwd: process.cwd() });
  if (result.out) process.stdout.write(result.out);
  if (result.err) process.stderr.write(result.err);
  return result.code;
};