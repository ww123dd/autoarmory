#!/usr/bin/env node
'use strict';

// 1.8.0 - selection baselines over REAL decisions. The router is only one of three
// strategies here; nothing is deployed. Every strategy is replayed on the same stored
// request, and with no recorded actual usage the tool refuses to print metrics.
//
// usage: node scripts/selection-baseline.js [--state .selfforge] [--json]

const fs=require('fs'),path=require('path');
const {parseArgs,readJsonl,printJson}=require('../src/lib/util');
const capabilityModule=require('../src/lib/capability');
const args=parseArgs(process.argv.slice(2));
const state=path.resolve(args.state||'.selfforge');
const decisions=readJsonl(path.join(state,'routing-decisions.jsonl'));
const actuals=readJsonl(path.join(state,'routing-actual.jsonl'));
const capabilities=capabilityModule.readCapabilities(path.join(state,'capabilities.jsonl'));

function pickRouter(decision){return decision.selected&&decision.selected[0]?decision.selected[0].id:null;}
function pickFirstEligible(decision){
  const filtered=capabilityModule.filterCapabilities(capabilities,decision.request||{});
  const ids=filtered.eligible.map(function(c){return c.id;}).sort();
  return ids.length?ids[0]:null;
}
function pickKeyword(decision){
  const task=(decision.request&&decision.request.task_type)||'';
  const exact=capabilities.filter(function(c){return (c.capabilities||[]).indexOf(task)!==-1;}).map(function(c){return c.id;}).sort();
  return exact.length?exact[0]:pickFirstEligible(decision);
}
const strategies=[{id:'router',pick:pickRouter},{id:'first-eligible',pick:pickFirstEligible},{id:'keyword',pick:pickKeyword}];
const actualBy=function(id){return actuals.filter(function(a){return a.decision_id===id;});};
const linked=decisions.filter(function(d){return actualBy(d.request_id).length;});

if(!decisions.length||!actuals.length||!linked.length){
  const report={schema_version:'autoarmory/selection-baseline/v1',selection_baseline:'insufficient_real_stream',decisions:decisions.length,actuals:actuals.length,linked:linked.length,metrics:null,reason:'baselines need decisions AND recorded actual usage; nothing is inferred from an empty stream'};
  if(args.json)printJson(report);else process.stdout.write('selection baselines: insufficient_real_stream (decisions='+decisions.length+' actuals='+actuals.length+' linked='+linked.length+')\n  no metrics are reported until real usage exists\n');
  process.exit(1);
}
const rows=strategies.map(function(s){
  let agree=0,followed=0,successWhenFollowed=0,failureWhenFollowed=0;
  for(const d of linked){
    const pick=s.pick(d);
    const acts=actualBy(d.request_id);
    const used=acts[0].used_capability_id;
    if(pick===used)agree+=1;
    const followedActs=acts.filter(function(a){return a.used_capability_id===pick;});
    if(followedActs.length){followed+=1;for(const a of followedActs){if(a.outcome==='success')successWhenFollowed+=1;else failureWhenFollowed+=1;}}
  }
  return {strategy:s.id,decisions:linked.length,agreement_with_actual_usage:agree,agreement_rate:Number((agree/linked.length).toFixed(4)),followed_acts:followed,success_when_followed:successWhenFollowed,failure_when_followed:failureWhenFollowed};
});
const report={schema_version:'autoarmory/selection-baseline/v1',selection_baseline:'ok',generated_at:new Date().toISOString(),decisions:decisions.length,actuals:actuals.length,linked:linked.length,note:'replay comparison only; the router is a subject under test, not a deployed decision path',strategies:rows,divergences:linked.filter(function(d){return pickRouter(d)!==actualBy(d.request_id)[0].used_capability_id;}).map(function(d){return {decision_id:d.request_id,task_id:d.task_id,router:pickRouter(d),used:actualBy(d.request_id)[0].used_capability_id,outcome:actualBy(d.request_id)[0].outcome};})};
if(args.json)printJson(report);else{process.stdout.write('selection baselines ('+linked.length+' linked decisions, replay only)\n');for(const r of rows)process.stdout.write('  '+r.strategy.padEnd(15)+'agreement='+r.agreement_rate+' followed='+r.followed_acts+' success='+r.success_when_followed+' failure='+r.failure_when_followed+'\n');}