# DepopAlerts

A Discord bot that monitors Depop in real-time and sends instant notifications when new listings match your saved searches. Built because Depop's built-in saved search notifications are too slow and lack customization.

## Features

- **Real-time monitoring** — polls Depop every 30 seconds for new listings
- **Rich notifications** — item image, price, size, seller, and direct link to the listing
- **Saved searches** — create multiple searches with different filters
- **Filters** — category, size, condition, price range, gender
- **Multi-user support** — each user manages their own saved searches, scoped per user
- **Discord slash commands** — `/watch`, `/list`, `/edit`, `/pause`, `/resume`, `/delete`
- **Autocomplete** — type a search name and the bot suggests matches
- **Inline setup** — set all filters directly in the command or use the interactive button UI
- **Per-server notification channel** — route all alerts to a specific channel with `/setchannel`

## Setup

### Prerequisites

- Node.js 18+
- A Discord bot token ([discord.com/developers](https://discord.com/developers/applications))

### Installation

```bash
git clone https://github.com/adamklng/DepopAlerts.git
cd DepopAlerts
npm install
```

### Configuration

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your-bot-token
CLIENT_ID=your-application-id
GUILD_ID=your-server-id
POLL_INTERVAL=30000
```

To get these values:
1. Create a new application at [discord.com/developers](https://discord.com/developers/applications)
2. Go to **Bot** tab → Reset Token → copy it (`DISCORD_TOKEN`)
3. Copy the **Application ID** from General Information (`CLIENT_ID`)
4. Enable Developer Mode in Discord settings, right-click your server → Copy Server ID (`GUILD_ID`)
5. Invite the bot: OAuth2 → URL Generator → check `bot` + `applications.commands` → check `Send Messages`, `Embed Links` → open the URL

### Running

```bash
# Register slash commands (run once, or after changing command definitions)
npm run deploy

# Start the bot
npm start
```

## Docker

```bash
# Register commands (one-time)
docker compose run --rm depopbot node deploy-commands.js

# Start the bot
docker compose up -d --build

# View logs
docker compose logs -f
```

The database persists in a Docker volume. The container auto-restarts on crash.

### Deploying on Proxmox (LXC)

1. Create a Debian 12/13 LXC container (1 CPU, 1GB RAM, 4GB disk, nesting enabled)
2. Inside the container:
   ```bash
   apt update && apt install -y curl git
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/adamklng/DepopAlerts.git
   cd DepopAlerts
   ```
3. Create `.env` with your credentials
4. Run `docker compose run --rm depopbot node deploy-commands.js`
5. Run `docker compose up -d --build`

### Deploying with Portainer

Create a new Stack → point it to the `docker-compose.yml` from this repo, or use Git repository deployment. Set environment variables for `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, and `POLL_INTERVAL`.

## Commands

| Command | Description |
|---------|-------------|
| `/watch <query>` | Create a new saved search. Optional: `size`, `category`, `min_price`, `max_price`, `condition` |
| `/list` | View your saved searches with options to edit, pause, resume, or delete |
| `/edit <search>` | Edit filters on a saved search (autocomplete) |
| `/pause <search>` | Pause a saved search (autocomplete) |
| `/resume <search>` | Resume a paused search (autocomplete) |
| `/delete <search>` | Delete a saved search (autocomplete) |
| `/status` | View your saved search stats and bot uptime |
| `/status admin:true` | View full server stats — admin only |
| `/setchannel <channel>` | Set the notification channel for the server |

### Quick start example

```
/watch query:ralph lauren category:All Men size:S,M,L max_price:50
```

Or create a watch interactively:

```
/watch query:ralph lauren
```

Then use the buttons to set filters and hit **Save & Start**.

## How it works

1. Puppeteer loads the Depop search page in a headless browser (Depop's API is blocked by Cloudflare)
2. Product data is extracted from Next.js RSC (React Server Components) data embedded in the HTML — no API keys needed
3. Results are compared against previously seen items in a local SQLite database
4. New items are sent as Discord embeds with images, price, size, and a link to the listing
5. Each user's saved searches are scoped — users can only see and manage their own

## Tech stack

- **discord.js** — Discord bot framework
- **Puppeteer** — headless Chrome for Depop scraping
- **better-sqlite3** — local SQLite database
- **Jest** — testing

## Roadmap

If you want to work on one of these, open an issue first to avoid duplicate work.

- [ ] Per-user saved search limit to prevent bot overload
- [ ] Richer notification embeds — multiple images, brand name, time since posted
- [ ] DM notifications option
- [ ] Proxy rotation for high-volume usage
- [ ] Retry logic with exponential backoff for failed scrapes
- [ ] Auto-build Docker image via GitHub Actions on release
- [ ] Depop size ID mapping for server-side size filtering
- [ ] More granular category filters (e.g. Men > Bottoms > Jeans)

## Known Limitations

- Depop can change their HTML/RSC format at any time, which would break scraping
- Size and condition filters are client-side — results may be fewer than 24 after filtering
- Depop caches results for less popular queries, so "newly listed" may lag behind
- Single Puppeteer instance — many concurrent watches will slow down polling

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style, and PR process.

## License

[MIT](LICENSE)
