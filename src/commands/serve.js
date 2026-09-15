'use strict';
const path = require('path');
const { parseArgs } = require('../lib/util');
const { startServer } = require('../lib/api');
module.exports = async function run(argv) {
  const args = parseArgs(argv);
  const allowWrite = args['allow-write'] === true;
  const server = await startServer({ host: args.host || '127.0.0.1', port: Number(args.port || 8787), state: path.resolve(args.state || '.selfforge'), allowWrite: allowWrite });
  process.stdout.write('AutoArmory API listening on http://' + server.address().address + ':' + server.address().port + '\n');
  process.stdout.write('Write mode: ' + (allowWrite ? 'enabled' : 'disabled (read-only)') + '\n');
  if (allowWrite) process.stdout.write('Bearer token: ' + server.autoarmoryToken + '\n');
  return new Promise(function () {});
};