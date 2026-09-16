#!/usr/bin/env node
'use strict';
// Verify every vendored anchor is a well-formed in-toto Statement with our predicateType,
// and that its subject digest equals the artifact bytes we ship.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');const DIR=path.join(ROOT,'examples','anchors');
const STATEMENT='https://in-toto.io/Statement/v1';const PREDICATE='https://autoarmory.dev/attestation/upstream-artifact/v1';
const files=fs.readdirSync(DIR).filter(n=>n.endsWith('.provenance.json')).sort();const problems=[];
for(const name of files){
  const rec=JSON.parse(fs.readFileSync(path.join(DIR,name),'utf8'));
  const bytes=fs.readFileSync(path.join(ROOT,rec.artifact));
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  if(rec._type!==STATEMENT)problems.push(name+': _type');
  if(rec.predicateType!==PREDICATE)problems.push(name+': predicateType');
  if(!Array.isArray(rec.subject)||!rec.subject[0]||!rec.subject[0].digest||rec.subject[0].digest.sha256!==sha)problems.push(name+': subject digest');
  if(rec.subject[0].name!==rec.artifact)problems.push(name+': subject name');
  if(!rec.predicate||rec.predicate.published_digest!==rec.published_digest)problems.push(name+': predicate');
}
const report={schema_version:'autoarmory/attestations/v1',statements:files.length,problems:problems};
if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(report,null,2)+'\n');else process.stdout.write('attestations: '+files.length+' statements, '+(problems.length?('PROBLEMS '+problems.join('; ')):'in-toto shell + custom predicateType verified, subject digests match artefacts')+'\n');
process.exit(problems.length?1:0);