# AI Radar

Directory of AI tools with voting. Single Node 24 process, SQLite storage (`node:sqlite`), no dependencies.
Everything is served under the `/radar` base path.

## Install
Requires Node >= 24. No `npm install` needed (no dependencies).

## Run
    PORT=4000 npm start        # default port 4000, binds 127.0.0.1
Open http://127.0.0.1:4000/radar/. DB lives in `data/radar.db` (override with `DB_PATH`); it is created and seeded (~30 tools) on first start.

## Test
    npm test

## UI
- `/radar/` — tool cards, search, category/tag filters (state kept in the URL)
- `/radar/tools/:slug` — detail page with Useful / Not useful voting (one vote per browser, changeable)
Static HTML + vanilla JS in `public/`; all links and assets are `/radar`-prefixed.

## API
- `GET /radar/api/tools?q=&category=&tag=` — list/filter
- `GET /radar/api/tools/:slug` — detail (includes `myVote`)
- `POST /radar/api/tools/:slug/vote` body `{"value":"useful"|"not_useful"}` — one vote per browser (`radar_id` cookie); re-voting changes your vote.

Categories: assistants, coding, images, video, audio, search, agents.
