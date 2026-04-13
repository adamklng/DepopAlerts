# DepopAlerts

A Discord bot that monitors Depop in real-time and sends instant notifications when new listings match your saved searches. Built because Depop's built-in saved search notifications are too slow and lack customization.

## Features

- **Real-time monitoring** — polls Depop every 30 seconds for new listings
- **Rich notifications** — item image, price, size, seller, and direct link to the listing
- **Saved searches** — create multiple searches with different filters
- **Filters** — category, size, condition, price range, gender
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
docker compose up -d --build
```

The database persists in a Docker volume. The container auto-restarts on crash.

To use with Portainer: create a new Stack and point it to the `docker-compose.yml`, or use the Git repository deployment.

## Commands

| Command | Description |
|---------|-------------|
| `/watch <query>` | Create a new saved search. Optional: `size`, `category`, `min_price`, `max_price`, `condition` |
| `/list` | View all saved searches with options to edit, pause, resume, or delete |
| `/edit <search>` | Edit filters on a saved search (autocomplete) |
| `/pause <search>` | Pause a saved search (autocomplete) |
| `/resume <search>` | Resume a paused search (autocomplete) |
| `/delete <search>` | Delete a saved search (autocomplete) |
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

1. Puppeteer loads the Depop search page in a headless browser
2. Product data is extracted from Next.js RSC (React Server Components) data embedded in the HTML — no API keys needed
3. Results are compared against previously seen items in a local SQLite database
4. New items are sent as Discord embeds with images, price, size, and a link to the listing

## Tech stack

- **discord.js** — Discord bot framework
- **Puppeteer** — headless Chrome for Depop scraping
- **better-sqlite3** — local database
- **Jest** — testing

## License

[MIT](LICENSE)
