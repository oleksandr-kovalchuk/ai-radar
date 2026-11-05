import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createServer } from '../src/server.js';

let server, base;
before(async () => {
  server = createServer(openDb(':memory:'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/radar`;
});
after(() => server.close());

const post = (url, value, cookie) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify({ value }) });

test('lists seeded tools', async () => {
  const j = await (await fetch(`${base}/api/tools`)).json();
  assert.ok(j.count >= 30);
  assert.ok(j.tools[0].slug && j.tools[0].pricing);
});

test('filters by q, category, tag', async () => {
  const q = await (await fetch(`${base}/api/tools?q=claude`)).json();
  assert.ok(q.tools.some((t) => t.slug === 'claude'));
  const c = await (await fetch(`${base}/api/tools?category=video`)).json();
  assert.ok(c.count > 0 && c.tools.every((t) => t.category === 'video'));
  const t = await (await fetch(`${base}/api/tools?tag=open-source&category=images`)).json();
  assert.deepEqual(t.tools.map((x) => x.slug), ['stable-diffusion']);
});

test('tool detail and 404', async () => {
  assert.equal((await fetch(`${base}/api/tools/cursor`)).status, 200);
  assert.equal((await fetch(`${base}/api/tools/nope`)).status, 404);
});

test('one vote per browser cookie', async () => {
  const r1 = await post(`${base}/api/tools/cursor/vote`, 'useful');
  const cookie = r1.headers.get('set-cookie').split(';')[0];
  assert.equal((await r1.json()).useful, 1);
  const r2 = await post(`${base}/api/tools/cursor/vote`, 'useful', cookie);
  assert.equal((await r2.json()).useful, 1);
  const r3 = await (await post(`${base}/api/tools/cursor/vote`, 'not_useful', cookie)).json();
  assert.equal(r3.useful, 0); assert.equal(r3.notUseful, 1); assert.equal(r3.myVote, 'not_useful');
  const r4 = await (await post(`${base}/api/tools/cursor/vote`, 'useful')).json();
  assert.equal(r4.useful, 1); assert.equal(r4.notUseful, 1);
});

test('rejects bad votes; outside /radar is 404', async () => {
  assert.equal((await post(`${base}/api/tools/cursor/vote`, 'meh')).status, 400);
  assert.equal((await post(`${base}/api/tools/nope/vote`, 'useful')).status, 404);
  assert.equal((await fetch(base.replace('/radar', '/api/tools'))).status, 404);
});

test('serves index under /radar/', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /AI Radar/);
});

test('serves detail page, assets, all under /radar', async () => {
  const d = await fetch(`${base}/tools/cursor`);
  assert.equal(d.status, 200);
  const html = await d.text();
  assert.match(html, /id="tool"/);
  assert.match(html, /\/radar\/app\.js/);
  assert.equal((await fetch(`${base}/tools/cursor/`)).status, 200);
  for (const a of ['app.js', 'styles.css']) assert.equal((await fetch(`${base}/${a}`)).status, 200);
  const idx = await (await fetch(`${base}/`)).text();
  assert.match(idx, /id="q"/);
  assert.doesNotMatch(idx, /(?:href|src)="\/(?!radar)/);
  assert.equal((await fetch(base)).status, 200);
});
