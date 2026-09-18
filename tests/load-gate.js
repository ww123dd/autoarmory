'use strict';const fs=require('fs');const os=require('os');const path=require('path');const gate=require('../src/lib/load-gate');function must(c,m){if(!c)throw new Error(m);}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'autoarmory-load-gate-'));fs.mkdirSync(path.join(dir,'reuse-records'),{recursive:true});
let r=gate.consult(dir,'missing','low');must(r.decision==='degrade','missing verdict must degrade low-risk load');r=gate.consult(dir,'missing','high');must(r.decision==='block','missing verdict must block high-risk action');
fs.writeFileSync(path.join(dir,'reuse-records','closed.json'),JSON.stringify({change_id:'closed',status:'closed',verifier:'v',run:{result:'pass'}}));r=gate.consult(dir,'closed','high');must(r.decision==='allow','closed verdict must allow');
fs.writeFileSync(path.join(dir,'reuse-records','retired.json'),JSON.stringify({change_id:'retired',status:'retired'}));r=gate.consult(dir,'retired','low');must(r.decision==='block','retired verdict must block');
fs.writeFileSync(path.join(dir,'reuse-records','expired.json'),JSON.stringify({change_id:'expired',status:'closed',expires_at:'2000-01-01T00:00:00.000Z'}));
r=gate.consult(dir,'expired','low');must(r.decision==='degrade'&&r.verdict==='expired','expired evidence must degrade low-risk load');
r=gate.consult(dir,'expired','high');must(r.decision==='block','expired evidence must block high-risk action');
console.log('load gate tests passed: low-risk degrade, high-risk block, closed allow, retired block');