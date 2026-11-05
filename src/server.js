import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { openDb, listTools, getTool, vote, myVote } from './db.js';

const BASE = '/radar';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};

function parseCookies(h = '') {
  return Object.fromEntries(h.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
}

async function readBody(req, limit = 4096) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString();
}

export function createServer(db) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (path !== BASE && !path.startsWith(BASE + '/')) return json(res, 404, { error: 'not found' });
      const sub = path.slice(BASE.length) || '/';

      const cookies = parseCookies(req.headers.cookie);
      let voter = /^[0-9a-f-]{36}$/.test(cookies.radar_id || '') ? cookies.radar_id : null;
      const setCookie = {};
      if (!voter) {
        voter = randomUUID();
        setCookie['Set-Cookie'] = `radar_id=${voter}; Path=${BASE}; Max-Age=31536000; HttpOnly; SameSite=Lax`;
      }

      if (sub === '/api/tools' && req.method === 'GET') {
        const tools = listTools(db, { q: url.searchParams.get('q'), category: url.searchParams.get('category'), tag: url.searchParams.get('tag') });
        return json(res, 200, { count: tools.length, tools }, setCookie);
      }
      const m = sub.match(/^\/api\/tools\/([a-z0-9-]+)(\/vote)?$/);
      if (m) {
        const slug = m[1];
        if (!m[2] && req.method === 'GET') {
          const t = getTool(db, slug);
          return t ? json(res, 200, { ...t, myVote: myVote(db, slug, voter) }, setCookie) : json(res, 404, { error: 'tool not found' });
        }
        if (m[2] && req.method === 'POST') {
          let body;
          try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid JSON body' }, setCookie); }
          if (!body || !['useful', 'not_useful'].includes(body.value)) return json(res, 400, { error: 'value must be "useful" or "not_useful"' }, setCookie);
          const t = vote(db, slug, voter, body.value);
          return t ? json(res, 200, { ...t, myVote: body.value }, setCookie) : json(res, 404, { error: 'tool not found' }, setCookie);
        }
        return json(res, 405, { error: 'method not allowed' });
      }
      if (sub.startsWith('/api/')) return json(res, 404, { error: 'not found' });

      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
      const rel = sub === '/' ? '/index.html' : /^\/tools\/[a-z0-9-]+\/?$/.test(sub) ? '/tool.html' : sub;
      const file = normalize(join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
      try {
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', ...setCookie });
        return res.end(req.method === 'HEAD' ? undefined : data);
      } catch {
        return json(res, 404, { error: 'not found' });
      }
    } catch (e) {
      console.error(e);
      json(res, 500, { error: 'internal error' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4000;
  const db = openDb(process.env.DB_PATH || join(root, 'data', 'radar.db'));
  createServer(db).listen(port, '127.0.0.1', () => console.log(`AI Radar on http://127.0.0.1:${port}/radar/`));
}
