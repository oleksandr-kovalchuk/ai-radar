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
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function initTheme() {
  const btn = document.getElementById('theme');
  const paint = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.textContent = dark ? '☀' : '☾';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('radar-theme', next); } catch {}
    paint();
  });
  paint();
}

function initList() {
  const grid = document.getElementById('grid'), count = document.getElementById('count');
  const q = document.getElementById('q'), cats = document.getElementById('cats');
  const chosen = document.getElementById('chosen');
  const params = new URLSearchParams(location.search);
  q.value = params.get('q') || '';
  let category = CATEGORIES.includes(params.get('category')) ? params.get('category') : '';
  const selected = new Set((params.get('tag') || '').split(',').filter(Boolean));
  let allTags = [], timer, seq = 0;

  // category pills
  const pills = ['', ...CATEGORIES].map((c) => el('button', { type: 'button', class: 'pill', 'data-cat': c, onclick: () => { category = c; paintPills(); load(); } }, c ? cap(c) : 'All'));
  cats.append(...pills);
  cats.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = pills.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault();
    pills[(i + (e.key === 'ArrowRight' ? 1 : pills.length - 1)) % pills.length].focus();
  });
  function paintPills() { for (const p of pills) p.setAttribute('aria-pressed', String(p.dataset.cat === category)); }

  // tag multi-select dropdown
  const dd = document.getElementById('tagdd');
  const ddBtn = el('button', { type: 'button', class: 'btn dd-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': 'tag-panel' });
  const ddSearch = el('input', { type: 'text', class: 'dd-search', placeholder: 'Search tags…', 'aria-label': 'Search tags', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'tag-list', 'aria-autocomplete': 'list', autocomplete: 'off' });
  const ddList = el('ul', { id: 'tag-list', class: 'dd-list', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'Tags' });
  const ddPanel = el('div', { id: 'tag-panel', class: 'dd-panel' }, ddSearch, ddList);
  dd.append(ddBtn, ddPanel);
  let active = 0, visible = [];
  const isOpen = () => dd.classList.contains('open');
  function paintBtn() {
    ddBtn.replaceChildren(el('span', {}, selected.size ? `Tags (${selected.size})` : 'All tags'), el('span', { class: 'caret', 'aria-hidden': 'true' }, '▼'));
  }
  function renderOpts() {
    const f = ddSearch.value.trim().toLowerCase();
    visible = allTags.filter((t) => t.includes(f));
    active = Math.min(active, Math.max(visible.length - 1, 0));
    ddList.replaceChildren(...(visible.length ? visible.map((t, i) => el('li', { id: 'opt-' + t, role: 'option', class: 'dd-opt' + (i === active ? ' active' : ''), 'aria-selected': String(selected.has(t)), onmousedown: (e) => e.preventDefault(), onclick: () => toggle(t) }, el('span', { class: 'box', 'aria-hidden': 'true' }), t))
      : [el('li', { class: 'dd-empty', role: 'presentation' }, 'No matching tags')]));
    if (visible[active]) ddSearch.setAttribute('aria-activedescendant', 'opt-' + visible[active]); else ddSearch.removeAttribute('aria-activedescendant');
  }
  function open() { if (isOpen()) return; sClose(false); dd.classList.add('open'); ddBtn.setAttribute('aria-expanded', 'true'); ddSearch.value = ''; active = 0; renderOpts(); ddSearch.focus(); }
  function close(refocus) { if (!isOpen()) return; dd.classList.remove('open'); ddBtn.setAttribute('aria-expanded', 'false'); if (refocus) ddBtn.focus(); }
  function toggle(t) { selected.has(t) ? selected.delete(t) : selected.add(t); paintTags(); load(); }
  function paintTags() {
    paintBtn(); if (isOpen()) renderOpts();
    chosen.replaceChildren(...[...selected].sort().map((t) => el('button', { type: 'button', class: 'chip', 'aria-label': `Remove tag ${t}`, onclick: () => { selected.delete(t); paintTags(); load(); } }, '#' + t, el('span', { 'aria-hidden': 'true' }, '×'))));
  }
  ddBtn.addEventListener('click', () => (isOpen() ? close(true) : open()));
  ddBtn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
  ddSearch.addEventListener('input', () => { active = 0; renderOpts(); });
  ddSearch.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (visible.length) active = (active + (e.key === 'ArrowDown' ? 1 : visible.length - 1)) % visible.length;
      renderOpts(); ddList.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); if (visible[active]) toggle(visible[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(false);
  });
  document.addEventListener('click', (e) => { if (!dd.contains(e.target)) close(false); });
  dd.addEventListener('focusout', (e) => { if (e.relatedTarget && !dd.contains(e.relatedTarget)) close(false); });

  // sort dropdown
  const SORTS = [['name', 'Name (A–Z)'], ['useful', 'Most useful'], ['newest', 'Newest']];
  let sort = SORTS.some(([k]) => k === params.get('sort')) ? params.get('sort') : 'name';
  const sdd = document.getElementById('sortdd');
  sdd.classList.add('dd-sort');
  const sBtn = el('button', { type: 'button', class: 'btn dd-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': 'sort-list', 'aria-label': 'Sort tools' });
  const sList = el('ul', { id: 'sort-list', class: 'dd-list', role: 'listbox', 'aria-label': 'Sort by', tabindex: '-1' });
  sdd.append(sBtn, el('div', { class: 'dd-panel' }, sList));
  let sActive = 0;
  const sOpen = () => sdd.classList.contains('open');
  function sPaint() {
    sBtn.replaceChildren(el('span', {}, 'Sort: ' + SORTS.find(([k]) => k === sort)[1]), el('span', { class: 'caret', 'aria-hidden': 'true' }, '▼'));
    sList.replaceChildren(...SORTS.map(([k, label], i) => el('li', { id: 'sort-' + k, role: 'option', class: 'dd-opt' + (i === sActive ? ' active' : ''), 'aria-selected': String(k === sort), onmousedown: (e) => e.preventDefault(), onclick: () => sPick(k) }, el('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'), label)));
    sList.setAttribute('aria-activedescendant', 'sort-' + SORTS[sActive][0]);
  }
  function sOpenUp() { if (sOpen()) return; close(false); sActive = SORTS.findIndex(([k]) => k === sort); sdd.classList.add('open'); sBtn.setAttribute('aria-expanded', 'true'); sPaint(); sList.focus(); }
  function sClose(refocus) { if (!sOpen()) return; sdd.classList.remove('open'); sBtn.setAttribute('aria-expanded', 'false'); if (refocus) sBtn.focus(); }
  function sPick(k) { sort = k; sClose(true); sPaint(); load(); }
  sBtn.addEventListener('click', () => (sOpen() ? sClose(true) : sOpenUp()));
  sBtn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sOpenUp(); } });
  sList.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sActive = (sActive + (e.key === 'ArrowDown' ? 1 : SORTS.length - 1)) % SORTS.length; sPaint(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); sActive = e.key === 'Home' ? 0 : SORTS.length - 1; sPaint(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sPick(SORTS[sActive][0]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sClose(true); }
    else if (e.key === 'Tab') sClose(false);
  });
  document.addEventListener('click', (e) => { if (!sdd.contains(e.target)) sClose(false); });
  sdd.addEventListener('focusout', (e) => { if (e.relatedTarget && !sdd.contains(e.relatedTarget)) sClose(false); });

  // loading
  function skeletons() {
    grid.setAttribute('aria-busy', 'true');
    grid.replaceChildren(...Array.from({ length: 6 }, () => el('div', { class: 'card skel', 'aria-hidden': 'true' },
      el('div', { class: 'sk sk-title' }), el('div', { class: 'sk sk-badge' }), el('div', { class: 'sk sk-line' }), el('div', { class: 'sk sk-line sk-short' }))));
  }
  async function load() {
    const my = ++seq;
    const qs = new URLSearchParams();
    if (q.value.trim()) qs.set('q', q.value.trim());
    if (category) qs.set('category', category);
    if (sort !== 'name') qs.set('sort', sort);
    const apiQs = qs.toString();
    if (selected.size) qs.set('tag', [...selected].sort().join(','));
    const s = qs.toString();
    history.replaceState(null, '', BASE + '/' + (s ? '?' + s : ''));
    let data;
    try { data = await api('/tools' + (apiQs ? '?' + apiQs : '')); }
    catch (e) { if (my === seq) { grid.setAttribute('aria-busy', 'false'); grid.replaceChildren(); count.textContent = 'Could not load tools: ' + e.message; } return; }
    if (my !== seq) return;
    const tools = data.tools.filter((t) => [...selected].every((x) => t.tags.includes(x)));
    count.textContent = tools.length + (tools.length === 1 ? ' tool' : ' tools');
    grid.setAttribute('aria-busy', 'false');
    grid.replaceChildren(...(tools.length ? tools.map(card) : [el('p', { class: 'empty' }, 'No tools match your filters.')]));
  }
  function card(t, i) {
    return el('article', { class: 'card', style: `--i:${Math.min(i, 12)}` },
      el('h2', {}, el('a', { href: `${BASE}/tools/${t.slug}` }, t.name)),
      el('div', { class: 'row' }, el('span', { class: 'badge' }, t.category), pricingBadge(t.pricing)),
      el('p', {}, t.shortDescription),
      el('div', { class: 'row' }, ...t.tags.map((x) => el('button', { type: 'button', class: 'tag' + (selected.has(x) ? ' on' : ''), 'aria-pressed': String(selected.has(x)), onclick: () => toggle(x) }, '#' + x))),
      el('div', { class: 'foot' }, el('a', { href: t.website, target: '_blank', rel: 'noopener noreferrer' }, 'Website ↗'),
        el('span', { class: 'votes-mini', 'aria-label': `${t.useful} useful, ${t.notUseful} not useful` }, el('span', {}, `👍 ${t.useful}`), el('span', {}, `👎 ${t.notUseful}`))));
  }
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });
  document.getElementById('reset').addEventListener('click', () => { q.value = ''; category = ''; sort = 'name'; selected.clear(); sPaint(); paintPills(); paintTags(); load(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      e.preventDefault(); q.focus(); q.select();
    }
  });

  sPaint(); paintPills(); paintTags(); skeletons();
  api('/tools').then((all) => { allTags = [...new Set(all.tools.flatMap((x) => x.tags))].sort(); if (isOpen()) renderOpts(); }).catch(() => {});
  load();
}

async function initDetail() {
  const root = document.getElementById('tool');
  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop());
  let t;
  try { t = await api('/tools/' + encodeURIComponent(slug)); }
  catch { root.replaceChildren(el('h1', {}, 'Tool not found'), el('p', {}, el('a', { class: 'back', href: BASE + '/' }, '← Back to all tools'))); return; }
  document.title = t.name + ' · AI Radar';
  const msg = el('p', { class: 'muted', 'aria-live': 'polite' });
  const btns = {}, nums = {};
  for (const [v, icon, label] of [['useful', '👍', 'Useful'], ['not_useful', '👎', 'Not useful']]) {
    nums[v] = el('span', { class: 'num' });
    btns[v] = el('button', { type: 'button', class: 'vote ' + v, onclick: () => cast(v) }, el('span', { 'aria-hidden': 'true' }, icon), label, el('span', {}, '('), nums[v], el('span', {}, ')'));
  }
  const shown = {};
  function render(animate) {
    for (const [v, n] of [['useful', t.useful], ['not_useful', t.notUseful]]) {
      nums[v].textContent = String(n);
      if (animate && shown[v] !== n && !reduced()) { nums[v].classList.remove('bump'); void nums[v].offsetWidth; nums[v].classList.add('bump'); }
      shown[v] = n;
      btns[v].classList.toggle('on', t.myVote === v);
      btns[v].setAttribute('aria-pressed', String(t.myVote === v));
    }
    msg.textContent = t.myVote ? `You voted "${t.myVote === 'useful' ? 'Useful' : 'Not useful'}". You can change your vote.` : 'Was this tool useful? Cast your vote.';
  }
  async function cast(value) {
    Object.values(btns).forEach((b) => (b.disabled = true));
    try {
      t = await api(`/tools/${encodeURIComponent(slug)}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) });
      render(true);
      btns[value].classList.remove('pop'); void btns[value].offsetWidth; btns[value].classList.add('pop');
    } catch (e) { msg.textContent = 'Vote failed: ' + e.message; }
    Object.values(btns).forEach((b) => (b.disabled = false));
    btns[value].focus();
  }
  root.replaceChildren(
    el('h1', {}, t.name),
    el('div', { class: 'row' }, el('a', { class: 'badge', href: `${BASE}/?category=${encodeURIComponent(t.category)}` }, t.category), pricingBadge(t.pricing),
      ...t.tags.map((x) => el('a', { class: 'tag', href: `${BASE}/?tag=${encodeURIComponent(x)}` }, '#' + x))),
    el('p', { class: 'desc' }, t.description),
    el('p', {}, el('a', { class: 'btn primary', href: t.website, target: '_blank', rel: 'noopener noreferrer' }, 'Visit website ↗')),
    el('div', { class: 'votes' }, btns.useful, btns.not_useful), msg);
  render(false);
}

initTheme();
document.getElementById('grid') ? initList() : initDetail();
