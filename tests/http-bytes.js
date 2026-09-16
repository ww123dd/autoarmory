'use strict';

// Acceptance test for the portable audited byte fetcher (1.1.0 / roadmap slot 0.7).
//
// The anchor path must be runnable by a stranger with nothing but a clone, which means the
// repository cannot depend on machine-local guard tooling. This checks the in-repo path:
//
//   1. bytes land on disk unchanged, with a sha256 and an audit line
//   2. the body never appears in stdout
//   3. plaintext http to a non-loopback host is refused
//   4. no --output means no inline body, just a refusal
//
// The fixture server lives in this process, so the tool is spawned asynchronously: a
// blocking spawnSync would freeze the event loop that has to answer the request.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'scripts', 'lib', 'http-bytes.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-http-bytes-'));
const SECRET = 'token=please-never-print-me';
const BODY = Buffer.from(JSON.stringify({ ok: true, note: SECRET, n: 42 }) + '\n', 'utf8');

function must(condition, message) { if (!condition) throw new Error(message); }
function run(args) {
  return new Promise(function (resolve) {
    const child = spawn(process.execPath, [TOOL].concat(args), { cwd: ROOT, windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', function (chunk) { out += chunk; });
    child.stderr.on('data', function (chunk) { err += chunk; });
    child.on('close', function (code) { resolve({ code: code, out: out, err: err }); });
  });
}

const server = http.createServer(function (request, response) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(BODY);
});

server.listen(0, '127.0.0.1', async function () {
  try {
    const port = server.address().port;
    const url = 'http://127.0.0.1:' + port + '/anchor.json';
    const output = path.join(work, 'anchor.json');
    const audit = path.join(work, 'audit.jsonl');

    // 1 + 2
    let result = await run([url, '--output', output, '--audit', audit]);
    must(result.code === 0, 'loopback fetch must succeed: ' + result.out + result.err);
    const report = JSON.parse(result.out);
    const sha = crypto.createHash('sha256').update(BODY).digest('hex');
    must(report.ok === true && report.body_suppressed === true, 'the report must declare the body suppressed');
    must(report.bytes === BODY.length && report.sha256 === sha, 'the report must carry the real byte count and sha256');
    must(Buffer.compare(fs.readFileSync(output), BODY) === 0, 'the stored bytes must be identical to the served bytes');
    must(result.out.indexOf(SECRET) === -1 && result.err.indexOf(SECRET) === -1, 'the body must never appear in stdout or stderr');
    const auditLines = fs.readFileSync(audit, 'utf8').trim().split('\n');
    must(auditLines.length === 1, 'exactly one audit line per fetch');
    const auditRow = JSON.parse(auditLines[0]);
    must(auditRow.sha256 === sha && auditRow.output === output, 'the audit line must carry the hash and the destination');
    must(JSON.stringify(auditRow).indexOf(SECRET) === -1, 'the audit line must not embed the body');

    // 3
    result = await run(['http://example.invalid/anchor.json', '--output', path.join(work, 'x.json')]);
    must(result.code !== 0 && /plaintext/.test(result.out + result.err), 'plaintext http to a remote host must be refused');

    // 4
    result = await run([url]);
    must(result.code !== 0 && /--output/.test(result.out + result.err), 'a fetch without --output must be refused');

    console.log('http-bytes tests passed: bytes identical, sha256 + audit line recorded, body suppressed, plaintext remote refused, inline body refused');
    finish(0);
  } catch (error) {
    console.error('FAIL: ' + (error && error.message));
    finish(1);
  }
});

function finish(code) {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  server.close();
  process.exit(code);
}