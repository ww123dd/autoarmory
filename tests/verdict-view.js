'use strict';
const fs=require('fs');const os=require('os');const path=require('path');const v=require('../src/lib/verdict-view');function must(c,m){if(!c)throw new Error(m);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'autoarmory-verdict-view-'));fs.mkdirSync(path.join(temp,'reuse-records'),{recursive:true});
fs.writeFileSync(path.join(temp,'reuse-records','change-closed.json'),JSON.stringify({change_id:'change-closed',status:'closed',verifier:'v1',run:{result:'pass'},closure:{id:'c1'}}));
const index=v.readReuseIndex(temp);const closed=v.joinDraft({change_id:'change-closed',id:'change-closed'},index);const missing=v.joinDraft({change_id:'change-missing',id:'change-missing'},index);
must(closed.verification_state==='closed'&&closed.link_status==='linked','closed verdict must join back');
must(missing.verification_state==='verdict_missing'&&missing.link_status==='verdict_missing','missing verdict must be explicit');
console.log('verdict view tests passed: closure join and verdict_missing');