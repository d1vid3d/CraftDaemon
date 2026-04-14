# CraftDaemon

> A self-hosted Discord bot for controlling a Minecraft server through **systemd** and **RCON** — built for people who run their own Linux server and want Discord as the control panel.

![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-systemd-FCC624?style=flat-square&logo=linux&logoColor=black)
![Paper](https://img.shields.io/badge/Paper-Recommended-F96854?style=flat-square)
![Self-Hosted](https://img.shields.io/badge/Self--Hosted-required-red?style=flat-square)

---

## Overview

CraftDaemon gives you Discord slash commands to start, stop, restart, and monitor a Minecraft server running on your own Linux machine. Instead of SSH-ing in or keeping a terminal open, you interact with the server entirely from Discord.

It works by sitting alongside your Minecraft server on the same host — both running as **systemd services**. The bot controls the server by calling `systemctl` commands, and reads live stats (TPS, player list, RCON latency) by talking directly to the server over **RCON**.

### How it works, at a glance

```
Discord User
     │
     │  slash command (/start, /stop, /status…)
     ▼
CraftDaemon Bot  ──── systemctl start/stop/restart ────▶  Minecraft systemd service
  (systemd)      ◀─── RCON (127.0.0.1:25575) ──────────  (Paper server)
```

Two systemd services run on your host:

| Service | What it is |
|---|---|
| `craftdaemon` (or your chosen name) | The Discord bot itself |
| `minecraft` (or your chosen name) | Your Minecraft (Paper) server |

The bot does **not** spawn the Minecraft process itself — it delegates entirely to systemd. This means clean startup/shutdown handling, proper logging via `journald`, and automatic restarts on failure, all without the bot being in the middle of the process tree.

### Why Paper?

CraftDaemon uses the `tps` RCON command to read server performance. This command is provided by **Paper** — it does not exist on vanilla Minecraft servers. Paper is also the standard choice for most server setups, so it's the recommended and tested platform for this bot.

> Vanilla servers will work for basic start/stop/restart/status, but TPS will not be available in `/status`.

---

## Features

### Slash Commands

| Command | Description |
|---|---|
| `/start` | Starts the Minecraft server via `systemctl start` |
| `/stop` | Stops the server via `systemctl stop` |
| `/restart` | Restarts the server via `systemctl restart` |
| `/status` | Shows a full status embed: systemd state, uptime, TPS, player list, and RCON ping |
| `/address` | Shows the server's connection addresses (tunnel, LAN, Java version) |
| `/ping` | Checks the bot's Discord API latency |

### Smart Bot Presence

The bot's Discord status updates automatically every 60 seconds to reflect the server's real state:

| State | Bot status | Activity shown |
|---|---|---|
| Server offline | 🔴 Do Not Disturb | `🟥 Server Offline` |
| Server starting (RCON not ready) | 🟡 Idle | `🟡 Server Starting...` |
| Server online | 🟢 Online | `🟩 N player(s) online` |

### Auto-Shutdown

When the server has been empty for **10 minutes**, CraftDaemon automatically stops it to save resources. At the **8-minute** mark, it posts a warning to your configured status channel first.

This is entirely handled through RCON player count polling — no modifications to the server needed.

---

## Before You Start

CraftDaemon is a self-hosted project with no guided installer or dashboard. Setting it up correctly requires working across a few different areas at once. You'll have a much smoother experience if you're already comfortable with:

- **Linux & systemd** — creating and managing service units, reading logs with `journalctl`, and understanding file permissions
- **Node.js** — running scripts, installing packages with `npm`, and reading basic JavaScript
- **Discord bots** — creating an application in the Developer Portal, generating a bot token, and understanding OAuth2 scopes
- **Networking basics** — what RCON is, local vs. public addresses, and basic port concepts

This isn't meant to gatekeep — the documentation tries to be as clear as possible. But if any of the above is unfamiliar territory, it's worth getting comfortable with those fundamentals first, as most setup issues stem from one of these areas rather than the bot itself.

---

## Requirements

- A **Linux machine** running **systemd** (Ubuntu, Debian, Arch, etc.)
- **Node.js 22** (tested on v22 — older versions may work but are not officially tested)
- A **Minecraft server** (Paper recommended) configured as a **systemd service**, with RCON enabled
- A **Discord bot token** from the [Discord Developer Portal](https://discord.com/developers/applications)
- `sudo` access for the bot's user to run specific `systemctl` commands (see setup)
- A **public tunnel address** (e.g. playit.gg) if you want `/address` to show a tunnel address (optional)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/CraftDaemon.git
cd CraftDaemon
```

### 2. Install dependencies

```bash
npm install
```

This will install all required packages, including:

- [`discord.js`](https://discord.js.org/) v14 — Discord bot framework
- [`rcon`](https://www.npmjs.com/package/rcon) — RCON client for communicating with the Minecraft server
- [`dotenv`](https://www.npmjs.com/package/dotenv) — environment variable loading

### 3. Configure your environment

Copy the example file and fill it in:

```bash
cp .env.example .env
nano .env
```

| Variable | Required | Description |
|---|---|---|
| `TOKEN` | ✅ | Your Discord bot token |
| `CLIENT_ID` | ✅ | Your bot's application/client ID |
| `GUILD_ID` | ✅ | Your Discord server (guild) ID |
| `STATUS_CHANNEL_ID` | ✅ | Channel ID where auto-shutdown warnings are posted |
| `RCON_HOST` | ✅ | RCON host — `127.0.0.1` if bot and server are on the same machine |
| `RCON_PORT` | ✅ | RCON port (default: `25575`) |
| `RCON_PASSWORD` | ✅ | RCON password from your `server.properties` |
| `MC_SERVICE` | ✅ | Your Minecraft server's systemd service name (e.g. `minecraft`) |
| `JAVA_EDITION_VERSION` | ☑️ | Java edition version string shown in `/address` |
| `TUNNEL_ADDRESS` | ☑️ | Your public tunnel address shown in `/address` and `/status` (e.g. a playit.gg address) |
| `LOCAL_ADDRESS` | ☑️ | Your LAN address shown in `/address` |

> ☑️ = Optional, but `/address` will show "Not configured" for anything left blank.

### 4. Set up the Minecraft server as a systemd service

If you haven't already, create a systemd unit for your Minecraft server. Here's a minimal example using Paper:

```ini
# /etc/systemd/system/minecraft.service

[Unit]
Description=Minecraft Paper Server
After=network.target

[Service]
User=minecraft
WorkingDirectory=/opt/minecraft
ExecStart=/usr/bin/java -Xmx4G -Xms1G -jar paper.jar nogui
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Reload and enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable minecraft
```

The service name you use here (e.g. `minecraft`) must match `MC_SERVICE` in your `.env`.

> **⚠️ Heads up — console access:** Running the server as a systemd service means you lose direct console input from your terminal. You can still read logs with `journalctl -u minecraft -f`, but you won't be able to type commands directly into the server console over SSH. The practical workaround is to use an RCON terminal client like [mcrcon](https://github.com/Tiiffi/mcrcon) — it opens an interactive RCON session from your shell where you can run any server command without a leading `/`. CraftDaemon does not currently have a send-console-command feature, so mcrcon (or equivalent) is the recommended solution for direct server administration.

### 5. Enable RCON on your Minecraft server

In your `server.properties`:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=your_rcon_password_here
```

This password must match `RCON_PASSWORD` in your `.env`. Keep both files out of version control.

### 6. Grant the bot sudoers permissions

The bot runs `systemctl` commands with `sudo`. You need to allow this without a password prompt for the specific commands only.

```bash
sudo visudo -f /etc/sudoers.d/craftdaemon
```

Add the following (replace `botuser` with the Linux user that will run the bot):

```
botuser ALL=(ALL) NOPASSWD: /bin/systemctl start minecraft, /bin/systemctl stop minecraft, /bin/systemctl restart minecraft, /bin/systemctl is-active minecraft, /bin/systemctl show minecraft
```

> Keep this as narrow as possible — only grant the exact commands the bot needs.

### 7. Register slash commands

Run this **once** to register the slash commands to your Discord guild:

```bash
node src/register-commands.js
```

You'll need to re-run this if you add or change any commands.

### 8. Run the bot

For a quick test:

```bash
node src/index.js
```

For persistent background operation, run it as a systemd service too. Create `/etc/systemd/system/craftdaemon.service`:

```ini
[Unit]
Description=CraftDaemon Discord Bot
After=network.target

[Service]
User=botuser
WorkingDirectory=/home/botuser/CraftDaemon
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
EnvironmentFile=/home/botuser/CraftDaemon/.env

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable craftdaemon
sudo systemctl start craftdaemon
```

Both services are now managed by systemd and will survive reboots.

---

## Project Structure

```
CraftDaemon/
├── src/
│   ├── index.js               # Bot entry point
│   └── register-commands.js   # Slash command registration (run once)
├── .env.example               # Environment variable template
├── package.json
└── README.md
```

> The `src/` layout is the intended structure, but the bot isn't rigid about it — if you prefer running `index.js` from the project root that works too, as long as paths and your systemd `ExecStart` point to the right place.

---

## Auto-Shutdown Details

The bot checks player count via RCON every **30 seconds**. The shutdown sequence works like this:

1. Server is running, 0 players online → timer starts
2. After **8 minutes** of being empty → warning posted to `STATUS_CHANNEL_ID`
3. After **10 minutes** of being empty → `systemctl stop` is called automatically
4. If a player joins at any point → timer and warning are reset

The auto-shutdown thresholds (`AUTO_STOP_MINUTES`, `WARNING_MINUTES`) are constants at the top of `index.js` and can be adjusted there.

---

## Troubleshooting

**Slash commands don't appear in Discord**
Run `node src/register-commands.js` and wait a few minutes. Also make sure your bot invite URL includes the `applications.commands` scope.

**`sudo: a terminal is required` or permission denied on systemctl**
The sudoers rule isn't set up, is set up for the wrong user, or the service names don't match. Re-check step 6.

**`/status` shows RCON not responding right after `/start`**
This is expected — Paper takes 20–30 seconds to fully boot and open the RCON port. Run `/status` again after a moment.

**TPS not showing in `/status`**
TPS is read via the `tps` command which only exists on Paper. Vanilla servers will show N/A here.

**`RCON_PASSWORD is not set` error**
Your `.env` file is missing or not being loaded. Make sure it exists in the project root and `dotenv` is installed.

**Bot goes offline / crashes**
Check logs with `journalctl -u craftdaemon -n 50 --no-pager` if running as a systemd service.

---

## Contributing

This is a personal-use project. PRs and issues are welcome — open an issue first for larger changes.

---

## License

MIT — see [LICENSE](LICENSE).