'use strict';
const path = require('path');
const { parseArgs } = require('../lib/util');
const { startServer } = require('../lib/api');
module.exports = async function run(argv) {
  const args = parseArgs(argv);
  const server = await startServer({ host: args.host || '127.0.0.1', port: Number(args.port || 8787), state: path.resolve(args.state || '.selfforge') });
  process.stdout.write('AutoArmory control plane listening on http://' + server.address().address + ':' + server.address().port + '\n');
  return new Promise(function () {});
};
