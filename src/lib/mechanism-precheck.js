'use strict';
const LAYERS=['template','code_test','structural_gate','simple_linter','state_machine','mechanism'];
const SEVERITIES=['must_fix_now','backlog','not_now'];
const JURISDICTION=['external_fact_drifts','reusable','lifetime_accounting','enforcement_required'];
function evaluate(proposal){
  const value=proposal||{};const errors=[];
  if(SEVERITIES.indexOf(value.severity)===-1)errors.push('severity_missing');
  if(!Array.isArray(value.lower_layer_options)||value.lower_layer_options.length===0)errors.push('lower_layer_options_missing');
  if(typeof value.why_lower_layer_insufficient!=='string'||!value.why_lower_layer_insufficient.trim())errors.push('why_lower_layer_insufficient_missing');
  if(typeof value.outside_funnel_risk!=='string'||!value.outside_funnel_risk.trim())errors.push('outside_funnel_risk_missing');
  const jurisdiction=value.mechanism_jurisdiction||{};
  const missingJurisdiction=JURISDICTION.filter(function(key){return jurisdiction[key]!==true;});
  if(missingJurisdiction.length)errors.push('mechanism_jurisdiction_failed');
  const routeTo=(Array.isArray(value.lower_layer_options)&&value.lower_layer_options[0])||'template';
  if(errors.indexOf('severity_missing')!==-1)return{schema_version:'autoarmory/mechanism-precheck/v1',ok:false,status:'rejected_missing',errors:errors,route_to:routeTo,jurisdiction:jurisdiction,layer_order:LAYERS};
  if(value.severity==='not_now')return{schema_version:'autoarmory/mechanism-precheck/v1',ok:false,status:'rejected_deferred',errors:[],route_to:'backlog',jurisdiction:jurisdiction,layer_order:LAYERS};
  if(missingJurisdiction.length)return{schema_version:'autoarmory/mechanism-precheck/v1',ok:false,status:'rejected_not_mechanism',errors:['mechanism_jurisdiction_failed'],missing_jurisdiction:missingJurisdiction,route_to:routeTo,jurisdiction:jurisdiction,layer_order:LAYERS};
  if(errors.indexOf('why_lower_layer_insufficient_missing')!==-1)return{schema_version:'autoarmory/mechanism-precheck/v1',ok:false,status:'rejected_lower_layer',errors:['why_lower_layer_insufficient_missing'],route_to:routeTo,jurisdiction:jurisdiction,layer_order:LAYERS};
  if(errors.length)return{schema_version:'autoarmory/mechanism-precheck/v1',ok:false,status:'rejected_missing',errors:errors,route_to:routeTo,jurisdiction:jurisdiction,layer_order:LAYERS};
  return{schema_version:'autoarmory/mechanism-precheck/v1',ok:true,status:'accepted',errors:[],route_to:'mechanism',jurisdiction:jurisdiction,layer_order:LAYERS};
}
module.exports={LAYERS,SEVERITIES,JURISDICTION,evaluate};
