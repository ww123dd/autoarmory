'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl } = require('./util');
const capability = require('./capability');
const admission = require('./admission');
const scenario = require('./scenario');
const pkg = require('../../package.json');

function send(res, status, value, type) { const body = type === 'html' ? String(value) : JSON.stringify(value); res.writeHead(status, { 'content-type': type === 'html' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); res.end(body); }
function body(req) { return new Promise(function (resolve, reject) { let raw = ''; req.on('data', function (d) { raw += d; }); req.on('end', function () { try { resolve(raw ? JSON.parse(raw) : {}); } catch (err) { reject(err); } }); req.on('error', reject); }); }
function playground() { return '<!doctype html><html><head><meta charset="utf-8"><title>AutoArmory Playground</title><style>body{font-family:system-ui;max-width:900px;margin:40px auto}textarea{width:100%;height:160px}pre{background:#f4f4f4;padding:16px;white-space:pre-wrap}</style></head><body><h1>AutoArmory Playground</h1><p>Paste a routing request and inspect the selected and rejected capabilities.</p><textarea id="req">{\n  "task_type": "run-agent-eval",\n  "risk": "low",\n  "data_sensitivity": "internal",\n  "cost_budget": 1,\n  "latency_slo_ms": 1000,\n  "write_required": false,\n  "security_level": "standard",\n  "human_approval": false\n}</textarea><button id="go">Route</button><pre id="out"></pre><script>document.getElementById("go").onclick=async()=>{const r=await fetch("/route",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({request:JSON.parse(document.getElementById("req").value),seed:7})});document.getElementById("out").textContent=JSON.stringify(await r.json(),null,2)}</script></body></html>'; }
function startServer(options) {
  const opts = options || {};
  const state = path.resolve(opts.state || '.selfforge');
  const registry = path.join(state, 'capabilities.jsonl');
  const decisions = path.join(state, 'routing-decisions.jsonl');
  const admissions = path.join(state, 'admissions.jsonl');
  const outcomes = path.join(state, 'capability-outcomes.jsonl');
  return new Promise(function (resolve, reject) {
    const server = http.createServer(async function (req, res) {
      try {
        if (req.method === 'OPTIONS') return send(res, 204, {});
        const url = new URL(req.url, 'http://localhost');
        if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'autoarmory', version: pkg.version });
        if (req.method === 'GET' && url.pathname === '/capabilities') return send(res, 200, capability.readCapabilities(registry));
        if (req.method === 'GET' && url.pathname === '/playground') return send(res, 200, playground(), 'html');
        if (req.method === 'POST' && url.pathname === '/route') { const data = await body(req); const result = capability.route(capability.readCapabilities(registry), data.request, { seed: Number(data.seed || 1) }); if (result.ok) { const rows = fs.existsSync(decisions) ? readJsonl(decisions) : []; rows.push(result); writeJsonl(decisions, rows); } return send(res, result.ok ? 200 : 409, result); }
        if (req.method === 'POST' && url.pathname === '/admit') { const data = await body(req); const result = admission.admit(Array.isArray(data) ? data : (data.candidates || [])); if (fs.existsSync(state)) { const rows = fs.existsSync(admissions) ? readJsonl(admissions) : []; rows.push.apply(rows, result.decisions); writeJsonl(admissions, rows); } return send(res, 200, result); }
        if (req.method === 'POST' && url.pathname === '/outcome') { const data = await body(req); const result = capability.recordOutcome(registry, outcomes, data.outcome || data); return send(res, result.ok ? 200 : 400, result); }
        if (req.method === 'GET' && url.pathname.indexOf('/scenario/') === 0) { const profile = scenario.getProfile(url.pathname.slice('/scenario/'.length)); return profile ? send(res, 200, profile) : send(res, 404, { ok: false, error: 'scenario not found' }); }
        return send(res, 404, { ok: false, error: 'not found' });
      } catch (err) { return send(res, 500, { ok: false, error: err.message }); }
    });
    server.on('error', reject);
    server.listen(Number(opts.port || 0), opts.host || '127.0.0.1', function () { resolve(server); });
  });
}
module.exports = { startServer, playground };
