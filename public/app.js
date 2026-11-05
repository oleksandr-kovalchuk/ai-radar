'use strict';
const BASE = '/radar';
const CATEGORIES = ['assistants', 'coding', 'images', 'video', 'audio', 'search', 'agents'];

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of kids) n.append(c);
  return n;
}
const api = async (path, opts) => {
  const r = await fetch(BASE + '/api' + path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Request failed');
  return r.json();
};
const pricingBadge = (p) => el('span', { class: 'badge ' + p }, p);

function initList() {
  const grid = document.getElementById('grid'), count = document.getElementById('count');
  const q = document.getElementById('q'), cat = document.getElementById('category'), tag = document.getElementById('tag');
  for (const c of CATEGORIES) cat.append(el('option', { value: c }, c[0].toUpperCase() + c.slice(1)));
  const params = new URLSearchParams(location.search);
  q.value = params.get('q') || ''; cat.value = params.get('category') || '';
  let timer, seq = 0;

  async function load() {
    const my = ++seq;
    const qs = new URLSearchParams();
    if (q.value.trim()) qs.set('q', q.value.trim());
    if (cat.value) qs.set('category', cat.value);
    if (tag.value) qs.set('tag', tag.value);
    const s = qs.toString();
    history.replaceState(null, '', BASE + '/' + (s ? '?' + s : ''));
    let data;
    try { data = await api('/tools' + (s ? '?' + s : '')); }
    catch (e) { count.textContent = 'Could not load tools: ' + e.message; return; }
    if (my !== seq) return;
    count.textContent = data.count + (data.count === 1 ? ' tool' : ' tools');
    grid.replaceChildren(...(data.count ? data.tools.map(card) : [el('p', { class: 'muted' }, 'No tools match your filters.')]));
  }
  function card(t) {
    return el('article', { class: 'card' },
      el('h2', {}, el('a', { href: `${BASE}/tools/${t.slug}` }, t.name)),
      el('div', { class: 'row' }, el('span', { class: 'badge' }, t.category), pricingBadge(t.pricing)),
      el('p', {}, t.shortDescription),
      el('div', { class: 'row' }, ...t.tags.map((x) => el('button', { type: 'button', class: 'tag', onclick: () => { tag.value = x; load(); } }, '#' + x))),
      el('div', { class: 'foot' }, el('a', { href: t.website, target: '_blank', rel: 'noopener noreferrer' }, 'Website ↗'),
        el('span', { class: 'muted' }, `👍 ${t.useful} · 👎 ${t.notUseful}`)));
  }
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
  cat.addEventListener('change', load); tag.addEventListener('change', load);
  document.getElementById('reset').addEventListener('click', () => { q.value = ''; cat.value = ''; tag.value = ''; load(); });

  api('/tools').then((all) => {
    for (const t of [...new Set(all.tools.flatMap((x) => x.tags))].sort()) tag.append(el('option', { value: t }, t));
    tag.value = params.get('tag') || '';
    load();
  }).catch(() => load());
}

async function initDetail() {
  const root = document.getElementById('tool');
  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop());
  let t;
  try { t = await api('/tools/' + encodeURIComponent(slug)); }
  catch { root.replaceChildren(el('h1', {}, 'Tool not found'), el('p', {}, el('a', { href: BASE + '/' }, 'Back to all tools'))); return; }
  document.title = t.name + ' · AI Radar';
  const msg = el('p', { class: 'muted', 'aria-live': 'polite' });
  const btns = {};
  function render() {
    for (const [v, label, n] of [['useful', '👍 Useful', t.useful], ['not_useful', '👎 Not useful', t.notUseful]]) {
      btns[v].textContent = `${label} (${n})`;
      btns[v].classList.toggle('on', t.myVote === v);
      btns[v].setAttribute('aria-pressed', String(t.myVote === v));
    }
    msg.textContent = t.myVote ? `You voted "${t.myVote === 'useful' ? 'Useful' : 'Not useful'}". You can change your vote.` : 'Was this tool useful? Cast your vote.';
  }
  async function cast(value) {
    Object.values(btns).forEach((b) => (b.disabled = true));
    try { t = await api(`/tools/${encodeURIComponent(slug)}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) }); render(); }
    catch (e) { msg.textContent = 'Vote failed: ' + e.message; }
    Object.values(btns).forEach((b) => (b.disabled = false));
  }
  for (const v of ['useful', 'not_useful']) btns[v] = el('button', { type: 'button', class: 'vote ' + v, onclick: () => cast(v) });
  root.replaceChildren(
    el('h1', {}, t.name),
    el('div', { class: 'row' }, el('a', { class: 'badge', href: `${BASE}/?category=${encodeURIComponent(t.category)}` }, t.category), pricingBadge(t.pricing),
      ...t.tags.map((x) => el('a', { class: 'tag', href: `${BASE}/?tag=${encodeURIComponent(x)}` }, '#' + x))),
    el('p', {}, t.description),
    el('p', {}, el('a', { href: t.website, target: '_blank', rel: 'noopener noreferrer' }, 'Visit website ↗')),
    el('div', { class: 'votes' }, btns.useful, btns.not_useful), msg);
  render();
}

document.getElementById('grid') ? initList() : initDetail();
