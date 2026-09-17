'use strict';

const VALIDATION_RE = /(pytest|npm test|npm run build|verify_all|tsc|curl|invoke-webrequest|https?:\/\/|select\s|explain\s|show\s|desc\s|describe\s|sql|doris|compaction|profile|tests?[\\/])/i;
function isValidationCommand(command) { return VALIDATION_RE.test(String(command || '')); }
module.exports = { isValidationCommand };