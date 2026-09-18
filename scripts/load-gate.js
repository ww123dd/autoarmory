#!/usr/bin/env node
'use strict';
const path=require('path');const {parseArgs,printJson}=require('../src/lib/util');const gate=require('../src/lib/load-gate');const args=parseArgs(process.argv.slice(2));const state=path.resolve(args.state||'.selfforge');
if(args.refresh){printJson(gate.refresh(state));process.exit(0);}
if(args.violations){const v=gate.violations(state);printJson(v);process.exit(v.enforce_gate_hole_count>0?2:0);}
if(args['action-class']){const result=gate.consultAction(state,{actionClass:args['action-class'],changeId:args['change-id'],consumerRef:args['consumer-ref'],artifactRef:args['artifact-ref'],at:args.at});if(args.json)printJson(result);else process.stdout.write(result.behavior+' '+result.action_class+' verdict_state='+result.verdict_state+' would='+result.would_behavior+'\n');process.exit(result.behavior==='block'?2:0);}
const result=gate.consult(state,args['change-id'],{risk:args.risk||'low'});if(args.json)printJson(result);else process.stdout.write(result.decision+' '+result.change_id+' verdict='+result.verdict+'\n');process.exit(result.decision==='block'?2:0);
