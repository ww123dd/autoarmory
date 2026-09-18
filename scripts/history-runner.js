#!/usr/bin/env node
'use strict';
const path=require('path');
const {parseArgs,printJson}=require('../src/lib/util');
const runner=require('../src/lib/history-runner');
const stateLock=require('../src/lib/state-lock');
const args=parseArgs(process.argv.slice(2));
const state=args.state?path.resolve(args.state):undefined;
const repo=args.repo?path.resolve(args.repo):undefined;
const resolvedState=runner.stateDir({stateDir:state});
const lock=stateLock.acquire(resolvedState,{staleMs:60000});
if(!lock.ok){const locked={schema_version:'autoarmory/history-runner/v1',locked:true,reason:lock.reason,processed:0,history_derived_run_count:0,unverifiable_count:0,failed_count:0,results:[]};if(args.json)printJson(locked);else process.stdout.write('history runner: locked ('+lock.reason+')\n');process.exit(0);}
let report;
try{report=runner.drain({stateDir:state,repo:repo});}finally{lock.release();}
if(args.json)printJson(report);else process.stdout.write('history runner: processed='+report.processed+' closed='+report.history_derived_run_count+' unverifiable='+report.unverifiable_count+' failed='+report.failed_count+'\n');