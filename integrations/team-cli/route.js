'use strict';

const fs = require('fs');
const { AutoArmoryClient } = require('../../src/sdk/client');

async function main() {
  const request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const client = new AutoArmoryClient({ baseUrl: process.env.AUTOARMORY_URL || 'http://127.0.0.1:8787' });
  const decision = await client.route(request, Number(process.env.AUTOARMORY_SEED || 7));
  process.stdout.write(JSON.stringify(decision, null, 2) + '\n');
}
main().catch(function (err) { process.stderr.write(String(err.stack || err) + '\n'); process.exit(1); });
