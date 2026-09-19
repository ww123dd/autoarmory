'use strict';
const crypto=require('crypto');
function unique(values){return Array.from(new Set(values.filter(Boolean)));}
function ownerFromPath(value){const text=String(value||'');const m=text.match(/skills[\\/]([^\\/]+)[\\/]SKILL\.md/i);return m?m[1]:null;}
function inferOwner(candidate){
  const value=candidate||{};
  if(value.owner_scope){return{owner_scope:String(value.owner_scope),skill_id:value.skill_id||value.change&&value.change.skill||null,source:'explicit',confirmed:!!(value.owner_confirmation&&value.owner_confirmation.status==='approved'),evidence_refs:value.evidence||[]};}
  const hints=[];
  if(value.skill_id)hints.push(value.skill_id);
  if(value.owner)hints.push(value.owner);
  if(value.change&&value.change.skill)hints.push(value.change.skill);
  if(value.target&&value.target.skill)hints.push(value.target.skill);
  const text=[].concat(value.evidence||[]).concat(value.source||[]).join(' ');
  let match;const re=/skills[\\/]([^\\/]+)[\\/]SKILL\.md/ig;while((match=re.exec(text)))hints.push(match[1]);
  const owners=unique(hints);
  if(owners.length===0)return{owner_scope:null,skill_id:null,source:'unknown',confirmed:false,candidates:[],evidence_refs:value.evidence||[]};
  if(owners.length>1)return{owner_scope:null,skill_id:null,source:'cross_domain',confirmed:false,candidates:owners,evidence_refs:value.evidence||[]};
  return{owner_scope:owners[0],skill_id:owners[0],source:'inherited',confirmed:false,candidates:owners,evidence_refs:value.evidence||[]};
}
function proposeBatch(candidates){
  const rows=(candidates||[]).map(function(candidate){return{candidate_id:candidate.id||null,proposal:inferOwner(candidate)};});
  const counts={};for(const row of rows){const owner=row.proposal.owner_scope;if(owner)counts[owner]=(counts[owner]||0)+1;}
  const defaultOwner=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]||a.localeCompare(b);})[0]||null;
  const exceptions=rows.filter(function(row){return !row.proposal.owner_scope||row.proposal.owner_scope!==defaultOwner;});
  const question='这批 '+rows.length+' 条默认归 '+(defaultOwner||'未定')+'，除 '+exceptions.length+' 条跨域——对吗？';
  return{schema_version:'autoarmory/ownership-batch/v1',batch_id:'ownbatch-'+crypto.randomBytes(6).toString('hex'),default_owner:defaultOwner,total:rows.length,exceptions:exceptions.map(function(row){return row.candidate_id;}),question:question,rows:rows};
}
function confirmBatch(batch,options){
  const opts=options||{};if(opts.approved!==true)throw new Error('batch owner confirmation requires approved=true');
  const overrides=opts.owner_by_candidate||{};
  return (batch.rows||[]).map(function(row){
    const proposal=row.proposal||{};const isException=(batch.exceptions||[]).indexOf(row.candidate_id)!==-1;
    let owner=proposal.owner_scope;let overridden=false;
    if(isException){if(Object.prototype.hasOwnProperty.call(overrides,row.candidate_id)){owner=overrides[row.candidate_id];overridden=true;}else owner=null;}
    return{candidate_id:row.candidate_id,owner_scope:owner||null,owner_confirmation:owner?{schema_version:'autoarmory/owner-confirmation/v1',status:'approved',batch_id:batch.batch_id,approved_by:opts.approved_by||null,approved_at:opts.approved_at||new Date().toISOString(),source:overridden?'batch_override':proposal.source,overridden:overridden}:null};
  });
}
module.exports={inferOwner,proposeBatch,confirmBatch,ownerFromPath};
