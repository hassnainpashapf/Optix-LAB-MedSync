/* Minimal fetch() for old Node/Electron runtimes (Windows 7/8 desktop builds run Node 16, which has no global fetch
   and no AbortSignal.timeout). Same shape as what the sync agent uses: ok, status, headers.get, json, text, arrayBuffer. */
'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');

function httpFetch(url, opts, _redirects) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const lib = u.protocol === 'https:' ? https : http;
    const headers = Object.assign({ 'Accept-Encoding': 'identity' }, opts.headers || {});
    let body = opts.body;
    if (body != null && !Buffer.isBuffer(body)) body = Buffer.from(String(body));
    if (body) headers['Content-Length'] = body.length;
    const req = lib.request({ protocol: u.protocol, hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search,
      method: opts.method || 'GET', headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (_redirects || 0) < 5) {
        res.resume();
        return resolve(httpFetch(new URL(res.headers.location, u).toString(), opts, (_redirects || 0) + 1));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: { get: (k) => { const v = res.headers[String(k).toLowerCase()]; return Array.isArray(v) ? v[0] : (v == null ? null : v); } },
          json: async () => JSON.parse(buf.toString('utf8')),
          text: async () => buf.toString('utf8'),
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        });
      });
      res.on('error', reject);
    });
    const ms = opts.timeout || 30000;
    req.setTimeout(ms, () => { const e = new Error('timeout after ' + ms + 'ms'); e.name = 'TimeoutError'; req.destroy(e); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
module.exports = httpFetch;
