#!/usr/bin/env node
'use strict';

// 2.0.0 - lifecycle sweep across the whole inventory, from records only.
// Each row says retain / degrade / replace / retire and cites the record that decides it.
// Nothing self-reported is emitted (no verified_by / self_reported fields exist in output).
//
// usage: node scripts/lifecycle-sweep.js [--state .selfforge] [--repo .] [--json] [--output file]

const fs=require('fs'),path=require('path');
const {parseArgs,readJsonl,writeJson,printJson}=require('../src/lib/util');
const mechanism=require('../src/lib/mechanism');
const candidateLifecycle=require('../src/lib/candidate-lifecycle');
const capabilityModule=require('../src/lib/capability');
const args=parseArgs(process.argv.slice(2));
const repo=path.resolve(args.repo||'.');
const state=path.resolve(args.state||path.join(repo,'.selfforge'));
const rows=[];
if(fs.existsSync(path.join(state,'mechanisms.jsonl'))){
  for(const m of mechanism.listMechanisms(state)){
    const st=mechanism.status(state,m.id,{repo:repo});
    const life=mechanism.lifecycle(state,m.id);
    const healthy=st.status==='verified'||st.status==='closed';
    const verdict=life.to==='retired'?'retire':(healthy?'retain':'degrade');
    rows.push({subject:'mechanism:'+m.id,verdict:verdict,because:{record:'mechanism-status',status:st.status,lifecycle:life.to,reason:st.reason},action:verdict==='retire'?'already retired by a rollback record':(verdict==='retain'?'keep; evidence still re-derives':'run node scripts/mechanism-lifecycle.js --mechanism '+m.id+' --rollback-if-stale')});
  }
}
if(fs.existsSync(path.join(state,'transitions.jsonl'))){
  const records=readJsonl(path.join(state,'transitions.jsonl'));
  const stateLib=require('../src/lib/state');
  const ids=Array.from(new Set(records.map(function(r){return r.candidate_id;})));
  for(const id of ids){
    const promoting=records.filter(function(r){return r.candidate_id===id;}).filter(function(r){return r.to==='promoted';}).pop();
    if(!promoting)continue;
    if(stateLib.currentState(records,id,'candidate')!=='promoted')continue;
    const fresh=candidateLifecycle.artifactFreshness(promoting.evidence,{repo:repo});
    const verdict=!fresh.covered?'degrade':(fresh.ok?'retain':'retire');
    rows.push({subject:'candidate:'+id,verdict:verdict,because:{record:'candidate-evidence',covered:fresh.covered,uncovered:fresh.uncovered,mismatches:fresh.mismatches,uncovered_reason:fresh.covered?null:'no hashed artifact to recompute'},action:verdict==='retain'?'keep':(verdict==='retire'?'run node scripts/candidate-lifecycle.js --rollback-if-stale':'replace the observation with a hashable product')});
  }
}

if(fs.existsSync(path.join(state,'capabilities.jsonl'))){
  const mechanisms={};
  if(fs.existsSync(path.join(state,'mechanisms.jsonl')))for(const m of mechanism.listMechanisms(state)){const st=mechanism.status(state,m.id,{repo:repo});mechanisms[m.id]={status:st.status,reason:st.reason,lifecycle:mechanism.lifecycle(state,m.id).to};}
  for(const row of capabilityModule.healthRows(capabilityModule.readCapabilities(path.join(state,'capabilities.jsonl')),{evidence:mechanisms})){
    const verdict=row.status==='healthy'?'retain':(row.status==='offline'?'retire':'degrade');
    rows.push({subject:'capability:'+row.id,verdict:verdict,because:{record:'capability-health',status:row.status,reason:row.reason,evidence:row.evidence},action:verdict==='retain'?'keep':(verdict==='retire'?'proof was rolled back: replace or retire the capability':'restore the evidence behind this capability')});
  }
}
const report={schema_version:'autoarmory/lifecycle-sweep/v1',generated_at:new Date().toISOString(),state:state,subjects:rows.length,summary:{retain:rows.filter(function(r){return r.verdict==='retain';}).length,degrade:rows.filter(function(r){return r.verdict==='degrade';}).length,replace:rows.filter(function(r){return r.verdict==='replace';}).length,retire:rows.filter(function(r){return r.verdict==='retire';}).length},rows:rows};
if(args.json)printJson(report);else{process.stdout.write('lifecycle sweep: '+rows.length+' subjects (retain='+report.summary.retain+' degrade='+report.summary.degrade+' retire='+report.summary.retire+')\n');for(const r of rows)process.stdout.write('  '+r.verdict.padEnd(7)+r.subject+'  <- '+r.because.record+'  :: '+r.action+'\n');}
if(args.output)writeJson(path.resolve(args.output),report);