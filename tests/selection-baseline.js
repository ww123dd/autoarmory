'use strict';
// 1.8.0 acceptance: baselines replay the SAME stored request, refuse to invent metrics, and
// stay read-only; the router is a subject under test, not a deployed decision path.
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');const S=path.join(ROOT,'scripts','selection-baseline.js');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'aa-baseline-'));const state=path.join(work,'state');fs.mkdirSync(state,{recursive:true});
function must(c,m){if(!c)throw new Error(m);}function w(f,v){fs.writeFileSync(f,v,'utf8');}function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function cap(id,alpha,beta,tasks){return {schema_version:'autoarmory/capability/v1',id:id,vendor:'fixture',kind:'evaluator',version:'1.0.0',capabilities:tasks,permissions:{read:true,write:false,network:false},cost:{unit:'usd',estimate:0},latency_ms:{p50:1,p95:2},reliability:{alpha:alpha,beta:beta},risk:'low',trust_level:'trusted',conformance_level:'ci-gated',health:'healthy',freshness:new Date().toISOString(),evidence_refs:[]};}
w(path.join(state,'capabilities.jsonl'),[cap('a.good',9,1,['verify']),cap('b.alt',5,1,['verify'])].map(function(c){return JSON.stringify(c);}).join('\n')+'\n');
const d1={request_id:'route-1',task_id:'t1',request:{task_type:'verify',risk:'low',data_sensitivity:'internal',cost_budget:1,latency_slo_ms:1000,write_required:false,security_level:'standard',human_approval:false},selected:[{id:'a.good'}]};
const d2={request_id:'route-2',task_id:'t2',request:{task_type:'other',risk:'low',data_sensitivity:'internal',cost_budget:1,latency_slo_ms:1000,write_required:false,security_level:'standard',human_approval:false},selected:[{id:'a.good'}]};
w(path.join(state,'routing-decisions.jsonl'),[d1,d2].map(function(d){return JSON.stringify(d);}).join('\n')+'\n');
w(path.join(state,'routing-actual.jsonl'),[{id:'x1',decision_id:'route-1',used_capability_id:'a.good',outcome:'success',source:'agent'},{id:'x2',decision_id:'route-2',used_capability_id:'b.alt',outcome:'failure',source:'agent'}].map(function(a){return JSON.stringify(a);}).join('\n')+'\n');
function run(args){const r=spawnSync(process.execPath,[S].concat(args),{cwd:ROOT,encoding:'utf8',windowsHide:true});return{code:r.status,out:r.stdout||'',err:r.stderr||''};}
const before=['capabilities','routing-decisions','routing-actual'].map(function(n){return sha(path.join(state,n+'.jsonl'));}).join(',');
const r=run(['--state',state,'--json']);must(r.code===0,'baselines must run: '+r.err);const rep=JSON.parse(r.out);
must(rep.strategies.length===3,'three strategies must be compared');must(rep.selection_baseline==='ok','status');
const router=rep.strategies.find(function(s){return s.strategy==='router';});
must(router.decisions===2&&router.agreement_with_actual_usage===1&&router.agreement_rate===0.5,'the router agreement must follow the two records: '+JSON.stringify(router));
must(rep.divergences.length===1&&rep.divergences[0].decision_id==='route-2','the divergence must name the decision');
must(/replay comparison only/.test(rep.note),'the report must state it is a replay, not a deployment');
must(['capabilities','routing-decisions','routing-actual'].map(function(n){return sha(path.join(state,n+'.jsonl'));}).join(',')===before,'the baseline run must not modify the state');
fs.unlinkSync(path.join(state,'routing-actual.jsonl'));
const empty=run(['--state',state,'--json']);must(empty.code===1&&JSON.parse(empty.out).selection_baseline==='insufficient_real_stream','an empty stream must produce no metrics');
console.log('selection baseline tests passed: 3 strategies on 2 replayed decisions, router agreement 0.5, divergence named, read-only, empty stream = insufficient_real_stream');