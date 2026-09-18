#!/usr/bin/env node
'use strict';
const path=require('path');
const {parseArgs,printJson}=require('../src/lib/util');
const runner=require('../src/lib/history-runner');
const args=parseArgs(process.argv.slice(2));
const state=args.state?path.resolve(args.state):undefined;
const repo=args.repo?path.resolve(args.repo):undefined;
const report=runner.drain({stateDir:state,repo:repo});
if(args.json)printJson(report);else process.stdout.write('history runner: processed='+report.processed+' closed='+report.history_derived_run_count+' unverifiable='+report.unverifiable_count+' failed='+report.failed_count+'\n');