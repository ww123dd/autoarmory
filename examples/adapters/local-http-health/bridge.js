#!/usr/bin/env node
'use strict';
const fs = require('fs');
const http = require('http');
const https = require('https');
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) {}
const cfg = payload.server || {};
let url = null;
try { url = new URL(String(cfg.url || '')); } catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, reason: 'url is required and must be absolute: ' + error.message }));
  process.exit(3);
}
const client = url.protocol === 'https:' ? https : http;
const request = client.get(url, { rejectUnauthorized: cfg.allow_insecure !== true ? true : false }, function (response) {
  let body = '';
  response.on('data', function (chunk) { if (body.length < 1048576) body += chunk; });
  response.on('end', function () {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch (_) {}
    const observed = { url: url.href, status_code: response.statusCode, app: parsed.app || null, status: parsed.status || null, config_ok: parsed.config_ok === true, ok: response.statusCode === 200 && parsed.status === 'ok' && parsed.app === 'tableau-feishu-plugin' };
    process.stdout.write(JSON.stringify({ ok: true, observed: observed }));
  });
});
request.on('error', function (error) {
  process.stdout.write(JSON.stringify({ ok: true, observed: { url: url.href, status_code: null, app: null, status: null, config_ok: false, ok: false, error: String(error.message).slice(0, 200) } }));
});
request.setTimeout(5000, function () { request.destroy(new Error('timeout')); });