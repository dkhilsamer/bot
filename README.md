# Discord Soundboard Bot

A Discord bot that plays sounds in voice channels.

## Features
- Plays welcome sounds when users join voice channels.
- Configurable sound settings.
- Support for local sound files.

## Setup
1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file with your `DISCORD_TOKEN`.
4. Update `config.json` with your bot settings.
5. Run `node index.js` or use `run.bat`.

## Dependencies
- `discord.js`
- `@discordjs/voice`
- `ffmpeg` (included or path configured)
