import { DatabaseSync } from 'node:sqlite';
import { SEED, slugify } from './seed.js';

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      category TEXT NOT NULL, short_description TEXT NOT NULL, description TEXT NOT NULL,
      website TEXT NOT NULL, pricing TEXT NOT NULL CHECK (pricing IN ('free','freemium','paid')),
      tags TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS votes (
      tool_id INTEGER NOT NULL REFERENCES tools(id), voter TEXT NOT NULL,
      value TEXT NOT NULL CHECK (value IN ('useful','not_useful')),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tool_id, voter)
    );
  `);
  const ins = db.prepare(`INSERT OR IGNORE INTO tools (slug,name,category,short_description,description,website,pricing,tags)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const t of SEED) ins.run(slugify(t.name), t.name, t.category, t.short, t.full, t.website, t.pricing, JSON.stringify(t.tags));
  return db;
}

const SELECT = `SELECT t.slug, t.name, t.category, t.short_description AS shortDescription,
  t.description, t.website, t.pricing, t.tags,
  (SELECT COUNT(*) FROM votes v WHERE v.tool_id=t.id AND v.value='useful') AS useful,
  (SELECT COUNT(*) FROM votes v WHERE v.tool_id=t.id AND v.value='not_useful') AS notUseful
  FROM tools t`;

const shape = (r) => r && { ...r, tags: JSON.parse(r.tags) };

export function listTools(db, { q, category, tag } = {}) {
  const where = [], args = [];
  if (q) {
    const like = `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    where.push(`(LOWER(t.name) LIKE ? ESCAPE '\\' OR LOWER(t.short_description) LIKE ? ESCAPE '\\' OR LOWER(t.description) LIKE ? ESCAPE '\\' OR LOWER(t.tags) LIKE ? ESCAPE '\\')`);
    args.push(like, like, like, like);
  }
  if (category) { where.push('LOWER(t.category)=?'); args.push(category.toLowerCase()); }
  if (tag) { where.push(`EXISTS (SELECT 1 FROM json_each(t.tags) WHERE LOWER(value)=?)`); args.push(tag.toLowerCase()); }
  const sql = `${SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY t.name`;
  return db.prepare(sql).all(...args).map(shape);
}

export function getTool(db, slug) {
  return shape(db.prepare(`${SELECT} WHERE t.slug=?`).get(slug));
}

export function vote(db, slug, voter, value) {
  const row = db.prepare('SELECT id FROM tools WHERE slug=?').get(slug);
  if (!row) return null;
  db.prepare(`INSERT INTO votes (tool_id,voter,value) VALUES (?,?,?)
    ON CONFLICT(tool_id,voter) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`).run(row.id, voter, value);
  return getTool(db, slug);
}

export function myVote(db, slug, voter) {
  const r = db.prepare('SELECT v.value FROM votes v JOIN tools t ON t.id=v.tool_id WHERE t.slug=? AND v.voter=?').get(slug, voter);
  return r ? r.value : null;
}
