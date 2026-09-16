#!/usr/bin/env node
'use strict';

// Pinned bridge to the configured read-only Doris MCP server.
//
// This file is itself pinned by SHA-256 in verifiers.lock.json. It does not
// accept a caller-provided executable or shell command. It verifies the MCP
// config digest, the server entry digest, and the readonly user before it
// starts the MCP stdio server and executes the statement supplied by the
// pinned verifier descriptor.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const HASH = /^[a-f0-9]{64}$/i;
const HOST = /^[a-z0-9.-]+$/i;

function fail(reason) {
  process.stdout.write(JSON.stringify({ ok: false, reason: String(reason) }));
  process.exit(3);
}
function expandHome(value) {
  if (typeof value !== 'string' || !value) return value;
  if (value === '~') return os.homedir();
  if (value.indexOf('~/') === 0 || value.indexOf('~\\') === 0) return path.join(os.homedir(), value.slice(2));
  return value;
}
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function sha256Text(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function readStdin() {
  return new Promise(function (resolve, reject) {
    let data = '';
    process.stdin.on('data', function (chunk) { data += chunk; });
    process.stdin.on('end', function () { resolve(data); });
    process.stdin.on('error', reject);
  });
}
function kill(child) { try { child.kill(); } catch (_) {} }

async function main() {
  let payload;
  try { payload = JSON.parse(await readStdin()); } catch (error) { fail('invalid bridge payload: ' + error.message); }
  const statement = typeof payload.statement === 'string' ? payload.statement : '';
  const server = payload.server && typeof payload.server === 'object' ? payload.server : {};
  if (!statement) fail('statement is required');
  if (payload.statement_sha256 && payload.statement_sha256 !== sha256Text(statement)) fail('statement hash mismatch');
  if (!server.config) fail('server.config is required');
  if (!server.name || !server.tool) fail('server.name and server.tool are required');
  if (server.user !== 'readonly_aa') fail('locked readonly user must be readonly_aa');

  const repo = process.env.AUTOARMORY_REPO || process.cwd();
  const configPath = path.resolve(repo, expandHome(server.config));
  if (!fs.existsSync(configPath)) fail('MCP config not found: ' + configPath);
  if (!HASH.test(String(server.config_sha256 || '')) || sha256File(configPath) !== server.config_sha256) {
    fail('MCP config digest mismatch; update verifiers.lock.json only after review');
  }

  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (error) { fail('MCP config parse failed: ' + error.message); }
  const entry = config && config.mcpServers && config.mcpServers[server.name];
  if (!entry) fail('MCP server not found in config: ' + server.name);
  const command = String(entry.command || '');
  const args = Array.isArray(entry.args) ? entry.args : [];
  if (!/^node(\.exe)?$/i.test(path.basename(command))) fail('MCP command must be node: ' + command);
  if (args.length !== 1) fail('MCP server must have exactly one entry argument');

  const entryPath = path.resolve(path.dirname(configPath), expandHome(args[0]));
  const expectedEntry = path.resolve(repo, expandHome(server.entry || ''));
  if (entryPath !== expectedEntry) fail('MCP server entry does not match the locked entry');
  if (!HASH.test(String(server.entry_sha256 || '')) || sha256File(entryPath) !== server.entry_sha256) {
    fail('MCP server entry digest mismatch');
  }

  const env = Object.assign({}, process.env, entry.env || {});
  if (env.MYSQL_USER !== server.user) fail('MCP readonly user mismatch: expected ' + server.user);
  if (env.MYSQL_HOST && !HOST.test(env.MYSQL_HOST)) fail('MCP host is not a plain hostname');

  const child = spawn(process.execPath, args, {
    cwd: repo,
    env: env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  let stdout = '';
  let stderr = '';
  const pending = new Map();
  child.stdout.on('data', function (chunk) {
    stdout += chunk.toString('utf8');
    let index;
    while ((index = stdout.indexOf('\n')) >= 0) {
      const line = stdout.slice(0, index).trim();
      stdout = stdout.slice(index + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch (_) { continue; }
      if (message.id === undefined || !pending.has(message.id)) continue;
      const resolve = pending.get(message.id);
      pending.delete(message.id);
      resolve(message);
    }
  });
  child.stderr.on('data', function (chunk) { stderr = (stderr + chunk.toString('utf8')).slice(-2000); });
  child.on('exit', function (code) {
    for (const resolve of pending.values()) resolve({ error: { message: 'MCP server exited ' + code + (stderr ? ': ' + stderr.slice(-300) : '') } });
    pending.clear();
  });

  function send(message) { child.stdin.write(JSON.stringify(message) + '\n'); }
  function request(id, method, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        pending.delete(id);
        reject(new Error('timeout waiting for ' + method));
      }, timeoutMs || 20000);
      pending.set(id, function (message) {
        clearTimeout(timer);
        resolve(message);
      });
      send({ jsonrpc: '2.0', id: id, method: method, params: params });
    });
  }

  try {
    const init = await request(1, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'autoarmory-doris-bridge', version: '1.0.0' }
    }, 20000);
    if (init.error) throw new Error('initialize failed: ' + JSON.stringify(init.error));
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const call = await request(2, 'tools/call', { name: server.tool, arguments: { sql: statement } }, 30000);
    if (call.error) throw new Error('tools/call failed: ' + JSON.stringify(call.error));
    if (call.result && call.result.isError) throw new Error('MCP tool returned an error');
    const content = (call.result && Array.isArray(call.result.content)) ? call.result.content : [];
    const textPart = content.find(function (item) { return item && item.type === 'text'; });
    if (!textPart) throw new Error('MCP tool returned no text content');
    let observed;
    try { observed = JSON.parse(textPart.text); } catch (_) { observed = textPart.text; }
    if (Array.isArray(observed) && observed.length === 1 && observed[0] && typeof observed[0] === 'object') observed = observed[0];
    kill(child);
    process.stdout.write(JSON.stringify({ ok: true, observed: observed }));
    process.exit(0);
  } catch (error) {
    kill(child);
    fail(error.message + (stderr ? ' | ' + stderr.slice(-300) : ''));
  }
}

main().catch(function (error) { fail(error.message); });
