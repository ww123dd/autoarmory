'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
function must(c,m){if(!c)throw new Error(m);}
const repo=path.resolve(__dirname,'..');
const gate=require(path.join(repo,'src','lib','load-gate'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'autoarmory-decision-contracts-'));
const state=path.join(temp,'state');
fs.mkdirSync(path.join(state,'reuse-records'),{recursive:true});
const NOW='2026-09-19T00:00:00.000Z';

// 1. versioned policy: default ships, state-root override wins, incomplete override fails closed
const policy=gate.loadPolicy(state);
must(policy.version===1&&policy.classes.indexOf('publish')!==-1&&policy.mode.load==='observe'&&policy.mode.publish==='enforce','default policy v1 must ship with per-class modes');
fs.writeFileSync(path.join(state,'decision-policy.json'),JSON.stringify({schema_version:'autoarmory/decision-policy/v1',version:2,classes:['publish','load'],mode:{publish:'enforce',load:'enforce'},rules:{publish:{'*':'block','valid-pass':'allow'},load:{'*':'degrade','valid-pass':'allow'}}}));
must(gate.loadPolicy(state).version===2,'state-root policy override must be honored');
fs.writeFileSync(path.join(state,'decision-policy.json'),'{"schema_version":"autoarmory/decision-policy/v1","version":3}');
let threw=false;try{gate.loadPolicy(state);}catch(_){threw=true;}
must(threw,'incomplete policy override must fail closed');
fs.unlinkSync(path.join(state,'decision-policy.json'));

// 2. unknown action class must fail closed and be logged
let r=gate.consultAction(state,{actionClass:'teleport',at:NOW,consumerRef:'c1'});
must(r.behavior==='block'&&r.reason_code==='unknown_action_class','unknown action class must fail closed');

// 3. publish (enforce): block without verdict, allow on valid pass, block on expired/retired
r=gate.consultAction(state,{actionClass:'publish',changeId:'missing',at:NOW,consumerRef:'release-job'});
must(r.behavior==='block'&&r.verdict_state==='no-verdict'&&r.mode==='enforce','publish without verdict must block');
fs.writeFileSync(path.join(state,'reuse-records','rel.json'),JSON.stringify({change_id:'rel',status:'closed',verifier:'tableau-release-zip',run:{result:'pass'}}));
r=gate.consultAction(state,{actionClass:'publish',changeId:'rel',at:NOW,consumerRef:'release-job'});
must(r.behavior==='allow'&&r.verdict_state==='valid-pass','closed passing verdict must allow publish');
fs.writeFileSync(path.join(state,'reuse-records','rel-old.json'),JSON.stringify({change_id:'rel-old',status:'closed',run:{result:'pass'},expires_at:'2000-01-01T00:00:00.000Z'}));
r=gate.consultAction(state,{actionClass:'publish',changeId:'rel-old',at:NOW});
must(r.behavior==='block'&&r.verdict_state==='expired','expired evidence must block publish');
fs.writeFileSync(path.join(state,'reuse-records','rel-ret.json'),JSON.stringify({change_id:'rel-ret',status:'retired'}));
r=gate.consultAction(state,{actionClass:'publish',changeId:'rel-ret',at:NOW});
must(r.behavior==='block'&&r.verdict_state==='retired','retired verdict must block publish');

// 4. load (observe): record-only pass-through with would_behavior accumulating the flip case
r=gate.consultAction(state,{actionClass:'load',changeId:'missing',at:NOW});
must(r.behavior==='observe'&&r.would_behavior==='degrade','observe load must pass through and record would-degrade');
r=gate.consultAction(state,{actionClass:'load',changeId:'rel-ret',at:NOW});
must(r.behavior==='observe'&&r.would_behavior==='block','observe load over a retired verdict must record would-block');

// 5. scoped invariants
const v=gate.violations(state);
must(v.enforce_gate_hole_count===0,'enforce gate hole invariant must hold by construction');
must(v.observe_would_block_count===1,'observe would-block must be counted exactly');
must(v.total>=7,'every consult must land in the consumption log');

// 6. fact refresh: one transition event per state change, idempotent rerun, snapshot materialised
const rr=gate.refresh(state,NOW);
must(rr.decisions===3&&rr.transitions===3&&rr.valid_pass===1&&rr.expired===1&&rr.retired===1,'first refresh must classify every reuse-record and record its transition');
const rr2=gate.refresh(state,NOW);
must(rr2.transitions===0,'second refresh with no change must be a no-op');
const events=fs.readFileSync(path.join(state,'verdict-events.jsonl'),'utf8').trim().split('\n').map(function(line){return JSON.parse(line);});
must(events.length===3&&events.every(function(x){return x.schema_version==='autoarmory/verdict-event/v1'&&x.from===null;}),'verdict events must be typed with from=null on first observation');
const snap=JSON.parse(fs.readFileSync(path.join(state,'decision-state.json'),'utf8'));
must(snap.schema_version==='autoarmory/decision-state/v1'&&snap.decisions.length===3,'refresh must materialise the decision-state snapshot');

// 7. legacy risk-based consult keeps working
r=gate.consult(state,'rel','high');
must(r.decision==='allow'&&r.verifier==='tableau-release-zip','legacy consult must keep working for existing callers');

console.log('decision contracts tests passed: action-class policy table, consumption log, scoped invariants, idempotent fact refresh, legacy consult intact');
