# Contributing to DepopAlerts

Thanks for your interest in contributing! Here's how to get started.

## Getting started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/DepopAlerts.git`
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env` and fill in your Discord bot credentials
5. Register commands: `npm run deploy`
6. Start the bot: `npm start`

## Making changes

1. Create a branch from `main`: `git checkout -b feat/your-feature` or `fix/your-fix`
2. Make your changes
3. Run tests: `npm test`
4. Commit using conventional format:
   - `feat: add new feature`
   - `fix: resolve bug`
   - `refactor: restructure code`
   - `test: add or update tests`
   - `docs: update documentation`
5. Push and open a PR against `main`

## Branch naming

- `feat/description` — new features
- `fix/description` — bug fixes
- `refactor/description` — code restructuring
- `docs/description` — documentation changes

## Code style

- No semicolons are fine — the codebase doesn't enforce them strictly
- Use `const`/`let`, not `var`
- Use async/await over raw promises
- Add console logging for important operations (`[Bot]`, `[Monitor]`, `[Depop]` prefixes)
- Keep Discord interaction responses fast — defer or ack within 3 seconds

## Testing

- Run all tests: `npm test`
- Run a single file: `npx jest tests/db.test.js`
- Tests mock Puppeteer and Discord — no real browser or bot token needed to run them
- If you change function signatures in `src/`, update the corresponding mocks in `tests/`

## Pull requests

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Make sure all tests pass before submitting
- PRs require approval from a maintainer before merging

## Reporting issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Bot console output if relevant
