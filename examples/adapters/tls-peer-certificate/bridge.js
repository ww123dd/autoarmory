#!/usr/bin/env node
'use strict';
// Heterogeneous fact source: PKI material presented by a TLS peer.
// Thin bridge on the shared state-query adapter: read stdin, emit { ok, observed }.
const fs = require('fs');
const tls = require('tls');
const crypto = require('crypto');
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) {}
const cfg = payload.server || {};
const host = String(cfg.host || '');
const port = Number(cfg.port || 0);
const observed = { host: host || null, port: port || null, subject_cn: null, issuer_cn: null, valid_from: null, valid_to: null, fingerprint_sha256: null, expired: null, connect_error: null };
let done = false;
function emit() {
  if (done) return;
  done = true;
  process.stdout.write(JSON.stringify({ ok: true, observed: observed }));
}
if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
  emit();
} else {
  const socket = tls.connect({
    host: host,
    port: port,
    rejectUnauthorized: cfg.allow_insecure === true ? false : true,
    servername: typeof cfg.servername === 'string' && cfg.servername ? cfg.servername : undefined
  }, function () {
    try {
      const cert = socket.getPeerCertificate();
      if (cert && cert.raw) {
        observed.fingerprint_sha256 = crypto.createHash('sha256').update(cert.raw).digest('hex');
        observed.subject_cn = (cert.subject && cert.subject.CN) || null;
        observed.issuer_cn = (cert.issuer && cert.issuer.CN) || null;
        observed.valid_from = cert.valid_from || null;
        observed.valid_to = cert.valid_to || null;
        observed.expired = cert.valid_to ? Date.parse(cert.valid_to) <= Date.now() : null;
      }
    } catch (error) {
      observed.connect_error = String(error.message).slice(0, 200);
    }
    socket.end();
    emit();
  });
  socket.setTimeout(5000, function () { socket.destroy(new Error('timeout')); });
  socket.on('error', function (error) {
    observed.connect_error = String(error.message).slice(0, 200);
    emit();
  });
}