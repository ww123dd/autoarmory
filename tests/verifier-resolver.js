'use strict';
const { resolveVerifier } = require('../src/lib/verifier-resolver');
function must(condition, message) { if (!condition) throw new Error(message); }
must(resolveVerifier({ command: 'run smoke-check-42' }, { verifier_ids: ['smoke-check-42'] }).kind === 'registered', 'registered verifier');
must(resolveVerifier({ command: 'node tests/run.js' }).kind === 'project_test', 'project test command');
must(resolveVerifier({ command: 'sha256sum artifact.bin', files: [{ path: 'artifact.bin' }] }).kind === 'file_hash', 'file hash');
must(resolveVerifier({ command: 'git status --short' }).kind === 'git_status', 'git state');
must(resolveVerifier({ command: 'curl https://example.com/health' }).kind === 'verifier_candidate', 'HTTP must be a candidate, not mechanical');
must(resolveVerifier({ command: 'SELECT count(*) FROM t' }).kind === 'verifier_candidate', 'SQL must be a candidate');
must(resolveVerifier({ command: 'Get-Process node' }).kind === 'verifier_candidate', 'process must be a candidate');
must(resolveVerifier({ command: 'playwright test' }).kind === 'verifier_candidate', 'DOM must be a candidate');
must(resolveVerifier({ command: 'npm run bundle' }).kind === 'verifier_candidate', 'build artifact must be a candidate');
must(resolveVerifier({ command: 'echo hello' }).kind === 'verifier_missing', 'unknown must fail closed');
console.log('verifier resolver tests passed: three mechanical classes, candidate HTTP/SQL/process/DOM/build, missing fail closed');