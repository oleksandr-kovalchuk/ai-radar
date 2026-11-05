import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { SEED, slugify } from '../src/seed.js';
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

test('modern UI markup: custom controls, theme toggle, no native select', async () => {
  const idx = await (await fetch(`${base}/`)).text();
  assert.doesNotMatch(idx, /<select/);
  for (const id of ['theme', 'cats', 'tagdd', 'q', 'grid']) assert.match(idx, new RegExp(`id="${id}"`));
  assert.match(idx, /radar-theme/);
  const det = await (await fetch(`${base}/tools/cursor`)).text();
  assert.match(det, /id="theme"/);
  assert.match(det, /Back to all tools/);
  const css = await (await fetch(`${base}/styles.css`)).text();
  assert.match(css, /prefers-reduced-motion/);
  const js = await (await fetch(`${base}/app.js`)).text();
  assert.doesNotMatch(js, /createElement\('select'\)|el\('select'/);
});

test('sorts by name, useful, newest and combines with filters', async () => {
  const get = async (qs) => (await (await fetch(`${base}/api/tools?${qs}`)).json()).tools;
  const names = (await get('sort=name')).map((t) => t.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  assert.deepEqual((await get('')).map((t) => t.slug), (await get('sort=bogus')).map((t) => t.slug));

  for (let i = 0; i < 3; i++) await post(`${base}/api/tools/midjourney/vote`, 'useful');
  await post(`${base}/api/tools/runway/vote`, 'useful');
  const useful = await get('sort=useful');
  assert.equal(useful[0].slug, 'midjourney');
  for (let i = 1; i < useful.length; i++) {
    const a = useful[i - 1], b = useful[i];
    assert.ok(a.useful > b.useful || (a.useful === b.useful && a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) <= 0));
  }
  const newest = await get('sort=newest');
  assert.deepEqual(newest.map((t) => t.slug), SEED.map((t) => slugify(t.name)).reverse());

  const combo = await get('category=images&sort=useful');
  assert.ok(combo.length > 1 && combo.every((t) => t.category === 'images'));
  assert.equal(combo[0].slug, 'midjourney');
  const tagged = await get('tag=open-source&sort=newest');
  assert.ok(tagged.length > 0 && tagged.every((t) => t.tags.includes('open-source')));
});

test('similar tools: excludes self, max 4, ranked by shared tags then category then name', async () => {
  const get = async (slug) => (await fetch(`${base}/api/tools/${slug}/similar`)).json();
  assert.equal((await fetch(`${base}/api/tools/nope/similar`)).status, 404);
  const all = (await (await fetch(`${base}/api/tools`)).json()).tools;
  for (const me of all) {
    const j = await get(me.slug);
    assert.ok(j.count === j.tools.length && j.count <= 4);
    assert.ok(j.tools.every((t) => t.slug !== me.slug));
    const key = (t) => [t.tags.filter((x) => me.tags.includes(x)).length, t.category === me.category ? 1 : 0];
    for (let i = 1; i < j.tools.length; i++) {
      const [a, b] = [key(j.tools[i - 1]), key(j.tools[i])];
      assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && j.tools[i - 1].name.localeCompare(j.tools[i].name, 'en', { sensitivity: 'base' }) <= 0))));
    }
    const best = all.filter((t) => t.slug !== me.slug).map((t) => key(t)[0]).sort((a, b) => b - a)[0];
    if (j.tools.length) assert.equal(key(j.tools[0])[0], best);
  }
});
