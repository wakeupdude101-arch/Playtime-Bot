# Donut Playtime Bot

Separate Discord bot for monitoring DonutSMP usernames without using a paid DonutSMP API key.

It checks public stats pages, falls back across providers, updates one Discord message, and DMs the user when a watched player crosses 10, 20, or 30 days.

## Setup

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Set `DONUTSTATS_API_KEY` from a DonutStats account to enable the primary provider.
3. Invite the bot with the `bot` and `applications.commands` scopes. It needs `Send Messages`, `Embed Links`, and `Read Message History`.
4. Run `npm install`, then `npm run register`, then `npm start`.

Use `/watch username:<name>` to add a player, `/watchbulk usernames:<names>` to add multiple players separated by commas, spaces, or new lines, `/unwatch` to remove one, `/watching` to list players, `/setchannel` to choose the updating channel, and `/refresh` to fetch immediately. Bulk additions are limited to 50 names per command.

`DISCORD_GUILD_ID` is optional. Set it for fast guild-only command registration while testing; omit it to register globally.

## Deploy on Railway through GitHub

1. Push this folder to a GitHub repository. Do not commit `.env`; it contains secrets and is ignored by Git.
2. In Railway, create a new project and choose **Deploy from GitHub Repo**.
3. Add these variables in the Railway service's **Variables** tab:

   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID` (recommended while testing)
   - `DONUTSTATS_API_KEY`
   - `POLL_INTERVAL_MINUTES=60`
   - `REQUEST_TIMEOUT_MS=15000`
   - `USER_AGENT=DonutPlaytimeBot/1.0 (public stats monitor)`

4. Deploy. Railway detects the `npm start` script automatically.
5. If slash commands need registering for a new Discord application, run `npm run register` locally with the same Discord variables before starting the Railway service.

Railway's filesystem is not guaranteed to persist across redeploys. The bot's watched users and board message are stored in `data/`; add a Railway volume mounted at `/app/data` if you need that state to survive redeployments.

## Data sources

The default providers are the DonutStats.io API, DonutAtlas, MCIndex, and DonutStats.net. DonutStats.io requires a free API key in `DONUTSTATS_API_KEY`; if it is not configured or unavailable, the bot tries the remaining providers. These services may rely on the same upstream DonutSMP data, so adding many providers does not guarantee independent fallback data. Website layouts and availability can change, so the provider adapter is isolated in `src/providers.js`. A provider failure is reported in the bot log and the last successful value remains visible with its timestamp.

The bot polls once per hour by default (and never accepts a configured interval shorter than one hour) to stay within DonutStats.io's rate limit. Each watched username uses one API request during a poll, so six watched usernames will appear as six requests close together. Newly added names are fetched immediately; `/refresh` remains limited to once per hour and does not refetch existing names early. Follow each website's terms and rate limits; the bot does not bypass login, CAPTCHA, or paid API access.
