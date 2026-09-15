'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseArgs } = require('../lib/util');
const report = require('./report');

const MARKER = '<!-- skillcanary-report -->';

function readReport(args) {
  if (args.file) return fs.readFileSync(path.resolve(args.file), 'utf8');
  const skillDir = args._[0] || '.';
  return report.build(skillDir).markdown;
}

function readEvent() {
  const file = process.env.GITHUB_EVENT_PATH;
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function request(method, urlPath, token, body) {
  return new Promise(function (resolve, reject) {
    const base = new URL(process.env.GITHUB_API_URL || 'https://api.github.com');
    const payload = body ? JSON.stringify(body) : null;
    const transport = base.protocol === 'http:' ? http : https;
    const req = transport.request({
      method,
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port || undefined,
      path: base.pathname.replace(/\/$/, '') + urlPath,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'skillcanary',
        'Content-Type': 'application/json',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0
      }
    }, function (res) {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        const parsed = data ? JSON.parse(data) : null;
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error('GitHub API ' + res.statusCode + ': ' + data));
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function commentBody(markdown) {
  return MARKER + '\n\n' + markdown;
}

module.exports = async function run(argv) {
  const args = parseArgs(argv);
  const markdown = readReport(args);
  const event = readEvent();
  const repo = event && event.repository && event.repository.full_name;
  const pr = event && ((event.pull_request && event.pull_request.number) || (event.issue && event.issue.number));
  const token = args.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const body = commentBody(markdown);

  if (args['dry-run']) {
    process.stdout.write(JSON.stringify({ repo: repo || null, pr: pr || null, body: body }, null, 2) + '\n');
    return 0;
  }
  if (!repo || !pr) {
    process.stderr.write('No pull request context. Set GITHUB_EVENT_PATH or use --dry-run.\n');
    return 1;
  }
  if (!token) {
    process.stderr.write('No GitHub token. Set GITHUB_TOKEN or GH_TOKEN.\n');
    return 1;
  }

  const listPath = '/repos/' + repo + '/issues/' + pr + '/comments?per_page=100';
  const existing = await request('GET', listPath, token, null);
  const found = Array.isArray(existing) ? existing.find(function (c) { return c.body && c.body.indexOf(MARKER) !== -1; }) : null;
  if (found) {
    await request('PATCH', '/repos/' + repo + '/issues/comments/' + found.id, token, { body: body });
    process.stdout.write('Updated SkillCanary comment on ' + repo + '#' + pr + '\n');
  } else {
    await request('POST', '/repos/' + repo + '/issues/' + pr + '/comments', token, { body: body });
    process.stdout.write('Created SkillCanary comment on ' + repo + '#' + pr + '\n');
  }
  return 0;
};

module.exports.commentBody = commentBody;
module.exports.readReport = readReport;