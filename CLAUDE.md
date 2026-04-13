# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Start the bot (node src/index.js)
npm run deploy         # Register slash commands with Discord (run after changing command definitions)
npm test               # Run Jest test suite
npx jest tests/db.test.js  # Run a single test file
```

Docker:
```bash
docker compose up -d --build     # Build and start
docker compose logs -f           # View logs
docker compose run --rm depopbot node deploy-commands.js  # Register commands in Docker
```

The bot requires a `.env` file (see `.env.example`) with `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, and `POLL_INTERVAL`.

Database (`depopbot.db`) auto-initializes on first run. Path is configurable via `DB_PATH` env var (used in Docker). Schema migrations run automatically via `ALTER TABLE` with try/catch.

## Architecture

Discord bot that monitors Depop for new clothing listings and sends real-time notifications.

**Flow:** User creates a saved search via `/watch` → configures filters via interactive buttons/dropdowns → hits "Save & Start" → monitor polls Depop every 30s → sends Discord embeds for new items.

### Source files

- **`src/index.js`** — Bot entry point. Registers event handlers (commands, autocomplete, buttons, modals, select menus), starts the polling loop, and handles graceful shutdown (SIGINT/SIGTERM closes Puppeteer + Discord client).
- **`src/commands.js`** — Slash command definitions and handlers. Commands: `/watch`, `/list`, `/pause`, `/resume`, `/delete`, `/edit`, `/status`, `/setchannel`. The `/pause`, `/resume`, `/delete`, `/edit` commands use Discord autocomplete to suggest saved searches by name. `/status` shows per-user stats, `/status admin:true` shows full server stats (requires Administrator permission). Also exports `handleAutocomplete`. All commands are user-scoped — users can only see and manage their own saved searches.
- **`src/buttons.js`** — All interactive UI logic (buttons, modals, select menus). Manages pending search state in-memory via `pendingSearches` Map with 15-minute TTL cleanup. Handles the filter editing flow (category, size, condition, price with back/clear buttons), `/list` actions (edit/pause/resume/delete/close/back), and the activate/cancel lifecycle. Every handler verifies `watch.user_id === interaction.user.id`.
- **`src/monitor.js`** — Polling engine. Iterates active watches, calls Depop scraper, diffs against seen items in DB, sends notifications. First poll per session seeds items without notifying (`firstPollDone` Set). Adds 2-5s random delay between watches. Uses overlap guard (`isPolling` flag) to prevent concurrent polls. Exports `stats` object tracking uptime, poll count, duration, and notification count.
- **`src/depop.js`** — Depop scraping via Puppeteer. Primary method extracts product JSON from Next.js RSC data in `<script>` tags. Falls back to DOM scraping if RSC extraction fails. Blocks fonts/images/analytics for speed (~1.5s per query). Uses `PUPPETEER_EXECUTABLE_PATH` env var for Docker compatibility.
- **`src/db.js`** — SQLite layer (better-sqlite3). Three tables: `watches`, `seen_items`, `settings`. Uses prepared statements, WAL mode, and `DB_PATH` env var for configurable location.
- **`deploy-commands.js`** — One-time script to register slash commands with Discord API.

### Key patterns

- **Pending vs saved searches:** `/watch` and `/edit` create in-memory pending searches (`p1`, `p2`, etc.) via `pendingSearches` Map. Filter edits modify the pending copy only. "Save & Start" creates/updates the DB row. Cancel discards the pending copy. Editing an existing search sets `_editingDbId` on the pending copy to track which DB row to update. Stale entries are cleaned up after 15 minutes.
- **User scoping:** All queries use `getWatchesByUser(guildId, userId)`. Autocomplete, `/list`, and all action handlers only return/act on watches owned by the interacting user. Ownership is verified at every handler entry point.
- **Custom ID encoding:** Button/menu custom IDs encode action and watch ID: `category_p1`, `sizeclear_42`, `listaction_edit`, `back_p1`. `parseWatchId()` handles both pending (`p1`) and DB (`42`) IDs. `getWatch()` abstracts lookups across both stores.
- **Filtering pipeline:** Price and category/gender filter via Depop URL params (server-side). Size and condition filter client-side using exact Set matching. Date filtering compares `item.dateCreated` against `watch.created_at` (UTC with `Z` suffix appended, 3-min grace period).
- **RSC extraction:** Depop's Next.js app embeds product data in `self.__next_f.push()` script tags with variable escape levels (`\\\"` or `\"`). The scraper handles both by doing two-pass unescaping, then finds and parses the `"products":[...]` JSON array. Products without a `slug` field are filtered out.
- **Notification channel:** Defaults to the watch's channel. `/setchannel` overrides per-guild via the `settings` table.
- **Size ordering:** Sizes display in logical order (XXS→XS→S→M→L→XL→XXL) via `SIZE_ORDER` array. Numeric/shoe sizes sort numerically.
- **UI consistency:** All filter submenus (category, size, condition, price) use the same pattern: dropdown/options on top, Clear + Back buttons below. The embed updates in-place via `interaction.update()`.
- **Discord API limits:** Embed titles truncated to 250 chars, descriptions to 4096 chars, select menu labels to ~90 chars.

### Testing

Tests mock Puppeteer (`mockPage`, `mockBrowser`), Discord interactions, and the database. Monitor tests use `jest.mock()` for both `../src/depop` and `../src/db`. The `firstPollDone` Set is exported for test access. `setTimeout` is mocked in monitor tests to skip inter-watch delays. Run a single test file with `npx jest tests/db.test.js`.
