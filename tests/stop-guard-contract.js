'use strict';
// Contract tripwire for the deployed Stop hook (~/.codex/hooks/stopGuard-codex.js).
// The hook lives outside this repository, so the repo pins its enforcement
// semantics by source: a bare self-report ("已核实") must never count as
// mechanical evidence - only a check command (DESC / SHOW COLUMNS /
// information_schema) or an honest hedge (待验证/未验证/待确认) does. This is the
// first binding between the global declaration layer and the enforcement layer.
const fs = require('fs');
const os = require('os');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const hookFile = path.join(os.homedir(), '.codex', 'hooks', 'stopGuard-codex.js');
if (!fs.existsSync(hookFile)) {
  console.log('stop guard contract skipped: deployed hook not found at ' + hookFile);
  process.exit(0);
}
const source = fs.readFileSync(hookFile, 'utf8');
const whitelistMatch = source.match(/const verified\s*=\s*\/\^(.*?)\/i\.test\(msg\)/) || source.match(/const verified\s*=\s*\/(.+?)\/i\.test\(msg\)/);
must(whitelistMatch, 'deployed hook must declare the verified whitelist regex');
const whitelist = whitelistMatch[1];
must(whitelist.indexOf('DESC') !== -1 && whitelist.indexOf('SHOW') !== -1, 'mechanical evidence (DESC / SHOW COLUMNS) must stay in the whitelist');
must(whitelist.indexOf('待验证') !== -1 && whitelist.indexOf('未验证') !== -1, 'honest hedges must stay in the whitelist');
for (const selfReport of ['已核实', '已确认', '核实过', '核实完成', '核实无误']) {
  must(whitelist.indexOf(selfReport) === -1, 'bare self-report "' + selfReport + '" must not be whitelisted as evidence (提出者不自判)');
}
must(/risky&&looksLikeDelivery&&!verified/.test(source.replace(/\s+/g, '')), 'block condition must stay risky && looksLikeDelivery && !verified');
must(source.includes('pep-shadow.js') && source.includes('AUTOARMORY_PEP_SHADOW_OFF'), 'deployed hook must spawn background PEP shadow without blocking');
console.log('stop guard contract tests passed: mechanical evidence or honest hedge only, bare self-reports are not evidence');
