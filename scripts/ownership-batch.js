#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {parseArgs,printJson,readJsonl,writeJsonl}=require('../src/lib/util');
const ownership=require('../src/lib/ownership-inheritance');
function fail(message){process.stderr.write(message+'\n');process.exit(2);}
const args=parseArgs(process.argv.slice(2));
if(!args.candidates)fail('--candidates <candidates.jsonl> is required');
const file=path.resolve(args.candidates);if(!fs.existsSync(file))fail('candidate file not found: '+file);
let rows;try{rows=readJsonl(file)}catch(error){fail('candidate file unreadable: '+error.message)}
const proposal=ownership.proposeBatch(rows);
if(!args.confirm){if(args.out){fs.mkdirSync(path.dirname(path.resolve(args.out)),{recursive:true});fs.writeFileSync(path.resolve(args.out),JSON.stringify(proposal,null,2)+'\n','utf8');}if(args.json)printJson(proposal);else process.stdout.write(proposal.question+'\n');process.exit(0);}
let owners={};if(args.owners){try{owners=JSON.parse(args.owners)}catch(error){fail('--owners must be a JSON object')}}
const assignments=ownership.confirmBatch(proposal,{approved:true,approved_by:args['approved-by']||null,owner_by_candidate:owners});
const byId={};for(const item of assignments)if(item.owner_scope)byId[item.candidate_id]=item;
const confirmed=rows.map(function(row){const item=byId[row.id];return item?Object.assign({},row,{owner_scope:item.owner_scope,owner_confirmation:item.owner_confirmation}):row;});
const out=args.out?path.resolve(args.out):null;if(!out)fail('--out is required with --confirm');writeJsonl(out,confirmed);
const report={schema_version:'autoarmory/ownership-confirmation/v1',ok:true,batch_id:proposal.batch_id,total:confirmed.length,confirmed:confirmed.filter(function(row){return row.owner_confirmation&&row.owner_confirmation.status==='approved';}).length,unconfirmed:confirmed.filter(function(row){return !row.owner_confirmation||row.owner_confirmation.status!=='approved';}).map(function(row){return row.id;}),out:out};
if(args.json)printJson(report);else process.stdout.write('ownership confirmed='+report.confirmed+' unconfirmed='+report.unconfirmed.length+'\n');process.exit(0);
