# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Start the bot (node src/index.js)
npm run deploy         # Register slash commands with Discord (run after changing command definitions)
npm test               # Run Jest test suite
npx jest tests/db.test.js  # Run a single test file
```

The bot requires a `.env` file (see `.env.example`) with `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, and `POLL_INTERVAL`.

Database (`depopbot.db`) auto-initializes on first run. Schema migrations run automatically via `ALTER TABLE` with try/catch.

## Architecture

Discord bot that monitors Depop for new clothing listings and sends real-time notifications.

**Flow:** User creates a saved search via `/watch` → configures filters via interactive buttons/dropdowns → hits "Save & Start" → monitor polls Depop every 30s → sends Discord embeds for new items.

### Source files

- **`src/index.js`** — Bot entry point. Registers event handlers (commands, autocomplete, buttons, modals, select menus) and starts the polling loop.
- **`src/commands.js`** — Slash command definitions and handlers. Commands: `/watch`, `/list`, `/pause`, `/resume`, `/delete`, `/edit`, `/setchannel`. The `/pause`, `/resume`, `/delete`, `/edit` commands use Discord autocomplete to suggest saved searches by name. Also exports `handleAutocomplete` for the autocomplete interaction.
- **`src/buttons.js`** — All interactive UI logic (buttons, modals, select menus). Manages pending search state in-memory via `pendingSearches` Map. Handles the filter editing flow (category, size, condition, price with back/clear buttons), `/list` actions (edit/pause/resume/delete/close/back), and the activate/cancel lifecycle.
- **`src/monitor.js`** — Polling engine. Iterates active watches, calls Depop scraper, diffs against seen items in DB, sends notifications. First poll per session seeds items without notifying (`firstPollDone` Set). Adds 2-5s random delay between watches to avoid rate limiting.
- **`src/depop.js`** — Depop scraping via Puppeteer. Primary method extracts product JSON from Next.js RSC data in `<script>` tags. Falls back to DOM scraping if RSC extraction fails. Blocks fonts/images/analytics for speed (~1.5s per query). Server-side filters: price (`priceMin`/`priceMax`), gender (`gender=male|female`), category (`categories=menswear.tops`).
- **`src/db.js`** — SQLite layer (better-sqlite3). Three tables: `watches`, `seen_items`, `settings`. Uses prepared statements and WAL mode. Includes `pauseWatch`/`activateWatch` for toggling active state.
- **`deploy-commands.js`** — One-time script to register slash commands with Discord API.

### Key patterns

- **Pending vs saved searches:** `/watch` and `/edit` create in-memory pending searches (`p1`, `p2`, etc.) via `pendingSearches` Map. Filter edits modify the pending copy only. "Save & Start" creates/updates the DB row. Cancel discards the pending copy. Editing an existing search sets `_editingDbId` on the pending copy to track which DB row to update.
- **Custom ID encoding:** Button/menu custom IDs encode action and watch ID: `category_p1`, `sizeclear_42`, `listaction_edit`, `back_p1`. `parseWatchId()` handles both pending (`p1`) and DB (`42`) IDs. `getWatch()` abstracts lookups across both stores.
- **Filtering pipeline:** Price and category/gender filter via Depop URL params (server-side). Size and condition filter client-side after results are returned. Date filtering compares `item.dateCreated` against `watch.created_at` (UTC with `Z` suffix appended, 3-min grace period).
- **RSC extraction:** Depop's Next.js app embeds product data in `self.__next_f.push()` script tags with variable escape levels (`\\\"` or `\"`). The scraper handles both by doing two-pass unescaping (`\\\\"` → `\\"` → `"`), then finds and parses the `"products":[...]` JSON array.
- **Notification channel:** Defaults to the watch's channel. `/setchannel` overrides per-guild via the `settings` table.
- **Size ordering:** Sizes display in logical order (XXS→XS→S→M→L→XL→XXL) via `SIZE_ORDER` array in `buildWatchMessage`. Numeric/shoe sizes sort numerically.
- **UI consistency:** All filter submenus (category, size, condition, price) use the same pattern: dropdown/options on top, Clear + Back buttons below. The embed updates in-place via `interaction.update()`.

### Testing

Tests mock Puppeteer (`mockPage`, `mockBrowser`), Discord interactions, and the database. Monitor tests use `jest.mock()` for both `../src/depop` and `../src/db`. Run a single test file with `npx jest tests/db.test.js`.
