'use strict';
// 2.0.0 acceptance: the lifecycle sweep decides retain/degrade/retire from records only,
// cites the record behind every verdict, and emits no self-reported fields.
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');const S=path.join(ROOT,'scripts','lifecycle-sweep.js');
const mechanism=require('../src/lib/mechanism');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'aa-sweep-'));const repo=path.join(work,'repo');const state=path.join(repo,'.selfforge');
fs.mkdirSync(state,{recursive:true});const artifact=path.join(repo,'artifact.txt');fs.writeFileSync(artifact,'v1\n');
function must(c,m){if(!c)throw new Error(m);}function w(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,v,'utf8');}
function shaFile(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function adapter(){return ["'use strict';","process.stdout.write(JSON.stringify({ok:true,input_sha256:'a'.repeat(64),output_sha256:'b'.repeat(64),exit_code:0,observed:0}));","process.exit(0);"].join('\n');}
w(path.join(repo,'scripts','verify','fixture.js'),adapter());
w(path.join(repo,'vlock.json'),JSON.stringify({schema_version:'autoarmory/verifiers-lock/v1',verifiers:[{id:'sweep-verifier',kind:'fixture',version:'1.0.0',invocation_contract_version:'autoarmory/invocation-contract/v1',readonly:true,adapter:'scripts/verify/fixture.js',adapter_sha256:shaFile(path.join(repo,'scripts','verify','fixture.js')),statement:'fixture',assertion:{path:'observed',op:'eq',value:0},timeout_ms:10000}]},null,2));
w(path.join(repo,'verifiers.lock.json'),fs.readFileSync(path.join(repo,'vlock.json')));
must(mechanism.admitCase(state,{schema_version:'autoarmory/case/v1',id:'case-sweep',incident_id:'i',title:'t',expected_transition:'COUNT->0',failure_mode:'masked_failure',severity:'low',evidence:['x'],reproducible:true,owner:'user'}).ok,'case');
must(mechanism.registerMechanism(state,{schema_version:'autoarmory/mechanism/v1',id:'mech-sweep',name:'m',covered_failure_modes:['masked_failure'],trigger:'t',action:'a',verification:'v',verifier_id:'sweep-verifier',closure_criteria:'c',owner:'user',version:'1.0.0'},{repo:repo}).ok,'mechanism');
const capture=require('../src/lib/verify').captureRefs([{id:'r',verifier:'sweep-verifier',params:{}}],{repo:repo,case_id:'case-sweep',mechanism_id:'mech-sweep',run_id:'run-1',trials:1});
must(capture.status==='captured','capture');
const now=new Date().toISOString();
must(mechanism.recordMechanismRun(state,{schema_version:'autoarmory/mechanism-run/v1',id:'run-1',mechanism_id:'mech-sweep',case_id:'case-sweep',actor:'codex',evidence_refs:[capture.captured[0]],counterexample:{kind:'f',expected:1,observed:0},environment_fingerprint:'e',started_at:now,finished_at:now},{repo:repo,trials:1}).ok,'run');
must(mechanism.closeCase(state,'case-sweep','run-1',{repo:repo,trials:1}).ok,'close');
must(mechanism.promote(state,'mech-sweep',{repo:repo}).ok,'promote');
// a promoted candidate whose hashed artifact no longer reproduces
fs.writeFileSync(path.join(state,'transitions.jsonl'),[
 {schema_version:'selfforge/transition/v1',id:'tr-1',candidate_id:'cand-stale',actor:'codex',from:'canary',to:'promoted',evidence:{kind:'artifact_hash',artifacts:[{path:'artifact.txt',sha256:shaFile(artifact)}]},at:now}
].map(function(x){return JSON.stringify(x);}).join('\n')+'\n');
fs.writeFileSync(artifact,'v2\n');
// cand-ok is promoted on the CURRENT bytes: its recorded hash must match what is on disk now
fs.appendFileSync(path.join(state,'transitions.jsonl'),JSON.stringify( {schema_version:'selfforge/transition/v1',id:'tr-2',candidate_id:'cand-ok',actor:'codex',from:'canary',to:'promoted',evidence:{kind:'artifact_hash',artifacts:[{path:'artifact.txt',sha256:shaFile(artifact)}]},at:now})+'\n');

const r=spawnSync(process.execPath,[S,'--state',state,'--repo',repo,'--json'],{cwd:ROOT,encoding:'utf8',windowsHide:true});
must(r.status===0,'sweep must run: '+r.stderr);const rep=JSON.parse(r.stdout);
must(rep.rows.every(function(x){return x.because&&x.because.record;}),'every verdict must cite the record that decides it');
const healthy=rep.rows.find(function(x){return x.subject==='mechanism:mech-sweep';});
must(healthy&&healthy.verdict==='retain','a healthy mechanism must be retained: '+JSON.stringify(healthy));
const stale=rep.rows.find(function(x){return x.subject==='candidate:cand-stale';});
must(stale&&stale.verdict==='retire'&&stale.because.mismatches&&stale.because.mismatches.length===1,'a stale promoted candidate must be retired with its mismatch: '+JSON.stringify(stale));
const ok=rep.rows.find(function(x){return x.subject==='candidate:cand-ok';});
must(ok&&ok.verdict==='retain','a candidate whose artifact did not change must be retained');
must(!/verified_by|self_reported|"independent"/.test(r.stdout),'the sweep report must contain no self-reported fields');
console.log('lifecycle sweep tests passed: retain/degrade/retire decided from records with citations, stale candidate retired by its mismatch, no self-reported fields');