'use strict';

class AutoArmoryClient {
  constructor(options) { const opts = options || {}; this.baseUrl = (opts.baseUrl || 'http://127.0.0.1:8787').replace(/\/$/, ''); }
  async request(pathname, options) { const res = await fetch(this.baseUrl + pathname, Object.assign({ headers: { 'content-type': 'application/json' } }, options || {})); const data = await res.json(); if (!res.ok && data && data.ok === false) throw new Error(data.error || data.errors && data.errors.join('; ') || ('HTTP ' + res.status)); return data; }
  health() { return this.request('/health'); }
  capabilities() { return this.request('/capabilities'); }
  route(request, seed) { return this.request('/route', { method: 'POST', body: JSON.stringify({ request: request, seed: seed || 1 }) }); }
  admit(candidates) { return this.request('/admit', { method: 'POST', body: JSON.stringify(candidates) }); }
  outcome(outcome) { return this.request('/outcome', { method: 'POST', body: JSON.stringify({ outcome: outcome }) }); }
}
module.exports = { AutoArmoryClient };
