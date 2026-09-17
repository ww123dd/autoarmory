#!/usr/bin/env node
'use strict';

// Execution provenance: run a command, record what can be re-checked, never the output text.
//
// input  = the command line, its arguments and the selected environment keys (hashed)
// output = stdout HASH + exit code + duration (the text itself is never stored)
// failures are recorded as failures, never dropped.
//
// usage: node scripts/exec-record.js [--link-decision <request_id>] [--state .selfforge] [--json] -- <cmd> [args...]

const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {parseArgs,writeJsonl,readJsonl,printJson,sha256}=require('../src/lib/util');
const argv=process.argv.slice(2);
const sep=argv.indexOf('--');
if(sep===-1||sep===argv.length-1){process.stderr.write('usage: node scripts/exec-record.js [--link-decision <id>] [--state .selfforge] -- <cmd> [args...]\n');process.exit(2);}
const head=parseArgs(argv.slice(0,sep));
const cmd=argv[sep+1],cmdArgs=argv.slice(sep+2);
const state=path.resolve(head.state||'.selfforge');
const ENV_KEYS=['PATH','NODE_ENV','npm_config_registry','PYTHONPATH'].filter(k=>process.env[k]!==undefined);
const envSnapshot={};for(const k of ENV_KEYS)envSnapshot[k]=process.env[k];
const started=Date.now();const startedAt=new Date().toISOString();
const {spawnSync}=require('child_process');
const run=spawnSync(cmd,cmdArgs,{encoding:'buffer',maxBuffer:16*1024*1024,windowsHide:true,env:process.env});
const duration=Date.now()-started;
const stdout=run.stdout||Buffer.alloc(0),stderr=run.stderr||Buffer.alloc(0);
const exitCode=run.status===null?124:run.status;
const record={
  schema_version:'autoarmory/exec-record/v1',
  id:'exec-'+sha256(cmd+':'+cmdArgs.join(' ')+':'+startedAt).slice(0,12),
  decision_id:head['link-decision']||null,
  command:cmd,args:cmdArgs,
  input_sha256:sha256(JSON.stringify({command:cmd,args:cmdArgs,env:envSnapshot})),
  output:{stdout_sha256:crypto.createHash('sha256').update(stdout).digest('hex'),stdout_bytes:stdout.length,stderr_sha256:crypto.createHash('sha256').update(stderr).digest('hex'),stderr_bytes:stderr.length},
  exit_code:exitCode,
  outcome:exitCode===0?'success':'failure',
  duration_ms:duration,
  started_at:startedAt,
  finished_at:new Date().toISOString()
};
const file=path.join(state,'exec-records.jsonl');fs.mkdirSync(state,{recursive:true});writeJsonl(file,readJsonl(file).concat([record]));
if(head.json)printJson(record);else process.stdout.write('recorded '+record.id+': outcome='+record.outcome+' exit='+record.exit_code+' stdout_sha256='+record.output.stdout_sha256.slice(0,12)+' ('+duration+'ms)\n');
process.exit(exitCode);