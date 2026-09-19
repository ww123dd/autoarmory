'use strict';
const fs=require('fs');
const gapInput=require('./verification-gap-input');
const checker=require('./column-verify-checker');
function fromStopEvent(event, options) {
  const value=event||{};
  const deliveryText=String(value.last_assistant_message||'');
  let hasVerification=checker.CHECK_RE.test(deliveryText);
  let transcriptAvailable=false;
  if(!hasVerification && (value.transcript_path||value.transcript||value.session_file)){
    try{
      const windowInput=gapInput.fromStopEvent(value,options||{});
      const lines=fs.readFileSync(windowInput.transcript,'utf8').split(/\r?\n/);
      const start=windowInput.boundary_line+1;
      const end=Math.min(lines.length,start+windowInput.window);
      for(let i=start;i<end;i+=1){ if(checker.CHECK_RE.test(lines[i])){hasVerification=true;break;} }
      transcriptAvailable=true;
    }catch(_){transcriptAvailable=false;}
  }
  return {delivery_text:deliveryText,has_verification:hasVerification,has_hedge:checker.HEDGE_RE.test(deliveryText),transcript_available:transcriptAvailable};
}
module.exports={fromStopEvent};
