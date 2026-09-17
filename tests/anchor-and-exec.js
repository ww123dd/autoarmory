'use strict';
// 1.6.0 + 1.7.0 acceptance: the anchor has a lifetime (fail closed, no bypass) and executions
// are recorded as hashes, failures included, never as output text.
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..');const work=fs.mkdtempSync(path.join(os.tmpdir(),'aa-160-170-'));
function must(c,m){if(!c)throw new Error(m);}
function run(args,env){const r=spawnSync(process.execPath,args,{cwd:ROOT,encoding:'utf8',windowsHide:true,env:Object.assign({},process.env,env||{})});return{code:r.status,out:r.stdout||'',err:r.stderr||''};}
// 1.6.0: expired anchor blocks; fresh anchor passes; there is no bypass flag
const hooks=path.join(work,'hooks');fs.mkdirSync(hooks,{recursive:true});
const localProfile = path.join(ROOT, 'verifiers.lock.json');
const hasLocalProfile = fs.existsSync(localProfile);
if (!hasLocalProfile) console.log('local profile absent (clone): expiry assertions skipped; exec-record assertions still run');
if (hasLocalProfile) {
const lock=path.join(work,'verifiers.lock.json');fs.copyFileSync(path.join(ROOT,'verifiers.lock.json'),lock);
const anchor=path.join(hooks,'verifier-lock.sha256');fs.copyFileSync(path.join(ROOT,'verifiers.lock.json'),path.join(hooks,'x'));
const crypto=require('crypto');fs.writeFileSync(anchor,crypto.createHash('sha256').update(fs.readFileSync(lock)).digest('hex')+'\n');
const meta=anchor+'.meta.json';
const pre=function(env){return run([path.join(ROOT,'scripts','verifier-preflight.js')],Object.assign({AUTOARMORY_LOCK_PATH:lock,AUTOARMORY_LOCK_ANCHOR:anchor},env||{}));};
fs.writeFileSync(meta,JSON.stringify({rotate_by:new Date(Date.now()+86400000).toISOString()}));
must(pre().code===0,'a fresh anchor must pass preflight');
fs.writeFileSync(meta,JSON.stringify({rotate_by:new Date(Date.now()-86400000).toISOString()}));
const expired=pre();
must(expired.code===2&&/expired/.test(expired.err),'an expired anchor must block: '+expired.err);
must(!/allow-expired|--allow-expired/.test(fs.readFileSync(path.join(ROOT,'scripts','verifier-preflight.js'),'utf8')),'there must be no expiry bypass flag');
}
// 1.7.0: executions become hashes; failures are recorded
const state=path.join(work,'state');
let r=run([path.join(ROOT,'scripts','exec-record.js'),'--state',state,'--json','--',process.execPath,'-e','process.stdout.write("secret-output-token")']);
must(r.code===0,'a successful command must exit 0: '+r.err);
r=run([path.join(ROOT,'scripts','exec-record.js'),'--state',state,'--json','--link-decision','route-x','--',process.execPath,'-e','process.exit(3)']);
must(r.code===3,'the recorded command own exit code must be preserved (failure, not swallowed)');
const records=fs.readFileSync(path.join(state,'exec-records.jsonl'),'utf8').trim().split('\n').map(function(l){return JSON.parse(l);});
must(records.length===2,'both executions must be recorded');
must(records[0].outcome==='success'&&records[1].outcome==='failure'&&records[1].exit_code===3,'outcomes must reflect the exit codes');
must(records[1].decision_id==='route-x','a record must be linkable to a routing decision');
must(!JSON.stringify(records.map(function (r) { return r.output; })).includes('secret-output-token'), 'the output text must never be stored - only its hash');
must(Object.keys(records[0].output).every(function (k) { return /sha256|bytes/.test(k); }), 'the output object may only carry hashes and byte counts, never text fields');
must(/^[a-f0-9]{64}$/.test(records[0].output.stdout_sha256)&&records[0].input_sha256.length===64,'input and output hashes must be present');
console.log('1.6/1.7 tests passed: executions recorded as hashes with failures preserved' + (hasLocalProfile ? '; fresh anchor ok, expired anchor BLOCK (no bypass)' : '; expiry half skipped (no local profile)'));