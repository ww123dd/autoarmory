#!/usr/bin/env node
'use strict';
const os = require('os');
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const backfill = require('../src/lib/change-backfill');
const args = parseArgs(process.argv.slice(2));
const stopState = args.state ? null : path.resolve(process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow'));
const engineDir = path.resolve(args.state || path.join(stopState, 'change-inspector'));
const report = backfill.backfillChangeRecords(engineDir);
if (args.json) printJson(report);
else process.stdout.write('change-records backfill: inventory=' + report.inventory_count + ' existing=' + report.existing_count + ' merged=' + report.merged_count + ' duplicates=' + report.duplicates_skipped + ' missing_id=' + report.missing_id_rows + ' wrote=' + report.wrote + '\n');
