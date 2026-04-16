<div align="center">

  <picture>
    <source srcset="assets/logo-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset="assets/logo-light.svg" media="(prefers-color-scheme: light)">
    <img src="assets/logo-dark.svg" width="70%">
  </picture>

  <h4>
    A self-hosted Discord bot for controlling a Minecraft server<br>
    through <b>systemd</b> and <b>RCON</b> — built for people who run<br>
    their own Linux server and want Discord as the control panel.
  </h4>

  <a href="https://nodejs.org" target="_blank"><img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white" /></a>&nbsp;
  <a href="https://discord.js.org" target="_blank"><img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>&nbsp;
  <a href="https://systemd.io" target="_blank"><img src="https://img.shields.io/badge/Linux-systemd-FCC624?style=flat-square&logo=linux&logoColor=white" /></a>&nbsp;
  <a href="https://papermc.io" target="_blank"><img src="https://img.shields.io/badge/Paper-Recommended-F96854?style=flat-square" /></a>&nbsp;
  <a href="https://github.com/d1vid3d/CraftDaemon" target="_blank"><img src="https://img.shields.io/badge/Self--Hosted-Required-red?style=flat-square" /></a>&nbsp;
  <a href="https://github.com/d1vid3d/CraftDaemon/releases" target="_blank"><img src="https://img.shields.io/github/v/release/d1vid3d/CraftDaemon?style=flat-square" /></a>

</div>

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
| `/address` | Shows the server's connection addresses (main address, LAN, Java version) |
| `/ping` | Checks the bot's Discord API latency |

### Bot Responses (Brief showcase)

📸 **Screenshot:** `/status` embed — online state with RCON stats
<p align="left">
  <picture>
    <source srcset="assets/status-example-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset="assets/status-example-light.png" media="(prefers-color-scheme: light)">
    <img src="assets/status-example-dark.png" width="60%"/>
  </picture>
</p>

📸 **Screenshot:** `/address` embed — assigned address informations
<p align="left">
  <picture>
    <source srcset="assets/address-example-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset="assets/address-example-light.png" media="(prefers-color-scheme: light)">
    <img src="assets/address-example-dark.png" width="60%"/>
  </picture>
</p>

📸 **Screenshot:** `Auto-Shutdown Warning` embed — notification posted after the set amount of time
<p align="left">
  <picture>
    <source srcset="assets/warning-example-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset="assets/warning-example-light.png" media="(prefers-color-scheme: light)">
    <img src="assets/warning-example-dark.png" width="60%"/>
  </picture>
</p>

📸 **Screenshot:** `Bot Presence Status` you can see the current server status from the server member list or the bot profile's
<p align="left">
  <picture>
    <source srcset="assets/bot-presence-example-dark.png" media="(prefers-color-scheme: dark)">
    <source srcset="assets/bot-presence-example-light.png" media="(prefers-color-scheme: light)">
    <img src="assets/bot-presence-example-dark.png" width="30%"/>
  </picture>
</p>


The `/status` command is the most information-dense response in the bot. When the server is fully online and RCON is responding, it shows systemd uptime, live TPS, current player count and names, and RCON round-trip latency — all in a single Discord embed. When the server is offline or still starting up, it reflects that state instead.

### Smart Bot Presence

The bot's Discord status updates automatically every 60 seconds to reflect the server's real state:

| State | Bot status | Activity shown |
|---|---|---|
| Server offline | 🔴 Do Not Disturb | `🟥 Server Offline` |
| Server starting (RCON not ready) | 🟡 Idle | `🟡 Server Starting...` |
| Server online | 🟢 Online | `🟩 N player(s) online` |

### Auto-Shutdown

When the server has been empty for a configurable amount of time (default: **10 minutes**), CraftDaemon automatically stops it to save resources. Before that, at the **8-minute** mark, it posts a warning to your configured status channel. Both thresholds and the check interval are fully configurable in your `.env`.

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
- A **public tunnel or forwarded address** (e.g. playit.gg) if you want `/address` to show a main address (optional)

---

## Setup

### 1. Clone the repository

```bash
git clone --branch v1.0.1 https://github.com/d1vid3d/CraftDaemon
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

### 3. Create your Discord bot application

<details>
<summary><b>Click to expand — Discord Developer Portal walkthrough</b></summary>

#### 3a. Create the application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and log in
2. Click **New Application** in the top right
3. Give it a name (e.g. `CraftDaemon`) and click **Create**

#### 3b. Create the bot and get your token

1. In the left sidebar, click **Bot**
2. Click **Add Bot** → **Yes, do it!**
3. Under the bot's username, click **Reset Token** and copy it — this is your `TOKEN` value
   > ⚠️ Treat this token like a password. Never share it or commit it to version control. If it leaks, reset it immediately from this page.
4. Scroll down to **Privileged Gateway Intents** and enable:
   - **Server Members Intent**
   - **Message Content Intent**

#### 3c. Get your Client ID

1. In the left sidebar, click **OAuth2 → General**
2. Copy the **Client ID** — this is your `CLIENT_ID` value

#### 3d. Invite the bot to your server

1. In the left sidebar, click **OAuth2 → URL Generator**
2. Under **Scopes**, check: `bot` and `applications.commands`
3. Under **Bot Permissions**, check: `Send Messages`, `Embed Links`, `Read Message History`
4. Copy the generated URL at the bottom and open it in your browser
5. Select your server from the dropdown and click **Authorize**

#### 3e. Get your Guild ID (Server ID)

1. Open Discord and go to **Settings → Advanced**
2. Enable **Developer Mode**
3. Close settings, then right-click your server icon in the left sidebar
4. Click **Copy Server ID** — this is your `GUILD_ID` value

#### 3f. Get your Status Channel ID

1. Right-click the channel you want the bot to post auto-shutdown warnings in
2. Click **Copy Channel ID** — this is your `STATUS_CHANNEL_ID` value

</details>

### 4. Configure your environment

Your `.env` file is how you configure CraftDaemon. It's a plain text file that lives in the project root and is loaded automatically by the bot on startup via `dotenv`. It's never committed to version control — it stays on your machine only.

Copy the example file and fill it in:

```bash
cp .env.example .env
nano .env
```

<details>
<summary><b>Click to expand — full .env variable reference</b></summary>

| Variable | Required | Description |
|---|---|---|
| `TOKEN` | ✅ | Your Discord bot token (from step 3b) |
| `CLIENT_ID` | ✅ | Your bot's application/client ID (from step 3c) |
| `GUILD_ID` | ✅ | Your Discord server ID (from step 3e) |
| `STATUS_CHANNEL_ID` | ✅ | Channel ID where auto-shutdown warnings are posted (from step 3f) |
| `RCON_HOST` | ✅ | RCON host — `127.0.0.1` if bot and server are on the same machine |
| `RCON_PORT` | ✅ | RCON port (default: `25575`) |
| `RCON_PASSWORD` | ✅ | RCON password from your `server.properties` |
| `MC_SERVICE` | ✅ | Your Minecraft server's systemd service name (e.g. `minecraft`) |
| `AUTO_STOP_MINUTES` | ✅ | Minutes of inactivity before the server auto-stops (set to `0` to disable) |
| `WARNING_MINUTES` | ✅ | Minutes of inactivity before the warning message is posted |
| `CHECK_INTERVAL` | ✅ | How often in milliseconds the bot polls for player activity (e.g. `30000` = 30s) |
| `JAVA_EDITION_VERSION` | ☑️ | Java edition version string shown in `/address` (e.g. `1.21.4`) |
| `MAIN_ADDRESS` | ☑️ | Your public server address shown in `/address` and `/status` (e.g. a playit.gg tunnel or port-forwarded address) |
| `LOCAL_ADDRESS` | ☑️ | Your LAN address shown in `/address` (e.g. `192.168.1.100:25565`) |

> ✅ = Required for the bot to function. ☑️ = Optional, but `/address` will show "Not configured" for anything left blank.

**A note on auto-shutdown variables:** `WARNING_MINUTES` should always be set lower than `AUTO_STOP_MINUTES` — if it's equal or higher, no warning will be sent before the server stops. Setting `AUTO_STOP_MINUTES=0` disables auto-shutdown entirely.

</details>

### 5. Set up the Minecraft server as a systemd service

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

### 6. Enable RCON on your Minecraft server

In your `server.properties`:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=your_rcon_password_here
```

This password must match `RCON_PASSWORD` in your `.env`. Keep both files out of version control.

### 7. Grant the bot sudoers permissions

The bot runs `systemctl` commands with `sudo`. You need to allow this without a password prompt for the specific commands only.

```bash
sudo visudo -f /etc/sudoers.d/craftdaemon
```

Add the following (replace `botuser` with the Linux user that will run the bot):

```
botuser ALL=(ALL) NOPASSWD: /bin/systemctl start minecraft, /bin/systemctl stop minecraft, /bin/systemctl restart minecraft, /bin/systemctl is-active minecraft, /bin/systemctl show minecraft
```

> Keep this as narrow as possible — only grant the exact commands the bot needs.

### 8. Register slash commands

Run this **once** to register the slash commands to your Discord guild:

```bash
node src/register-commands.js
```

You'll need to re-run this if you add or change any commands.

### 9. Run the bot

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

## Managing Your Services

<details>
<summary><b>Click to expand — useful systemd & journalctl commands</b></summary>

Once both services are running, you'll mostly interact with them through Discord. But here are the essential commands to know for when you need to manage things directly from your server.

### systemctl — controlling services

```bash
# Check the current status of a service (active state, recent logs, PID)
sudo systemctl status craftdaemon
sudo systemctl status minecraft

# Start a service
sudo systemctl start craftdaemon

# Stop a service
sudo systemctl stop craftdaemon

# Restart a service (stop then start)
sudo systemctl restart craftdaemon

# Enable a service to start automatically on boot
sudo systemctl enable craftdaemon

# Disable autostart on boot
sudo systemctl disable craftdaemon

# Reload systemd after creating or editing a .service file
sudo systemctl daemon-reload
```

### journalctl — reading logs

```bash
# View the last 50 lines of logs for the bot
journalctl -u craftdaemon -n 50 --no-pager

# Follow live logs in real time (like tail -f)
journalctl -u craftdaemon -f

# Follow live logs for the Minecraft server
journalctl -u minecraft -f

# View logs since the last boot only
journalctl -u craftdaemon -b

# View logs from a specific time window
journalctl -u craftdaemon --since "1 hour ago"
```

`journalctl -f` is your best friend when debugging — run it in a separate terminal while reproducing an issue to see exactly what the bot or server is doing in real time.

</details>

---

## Auto-Shutdown Details

<details>
<summary><b>Click to expand</b></summary>

The bot polls player count via RCON on the interval defined by `CHECK_INTERVAL` in your `.env`. The shutdown sequence works like this:

1. Server is running, 0 players online → inactivity timer starts
2. After `WARNING_MINUTES` of being empty → warning message posted to `STATUS_CHANNEL_ID`
3. After `AUTO_STOP_MINUTES` of being empty → `systemctl stop` is called automatically
4. If a player joins at any point → timer and warning state are fully reset

Setting `AUTO_STOP_MINUTES=0` in your `.env` disables auto-shutdown entirely. `WARNING_MINUTES` must be lower than `AUTO_STOP_MINUTES`, otherwise the warning will never fire before the shutdown.

</details>

---

## Customization

CraftDaemon's codebase is intentionally small and readable. If the default behavior doesn't quite fit your setup, you're encouraged to open `src/index.js` and adjust things directly — you don't need to be an expert, just comfortable reading through code and making small targeted changes.

Some things that are straightforward to modify:

- **Bot presence update frequency** — the `setInterval(updateBotPresence, 60_000)` call controls how often the bot's Discord status refreshes. Change `60_000` to any value in milliseconds.
- **RCON command timeout** — the `rconCommand` function has a default timeout of `2500ms`. If your server is slow to respond, bump this up.
- **Embed styling** — all Discord embeds are plain objects inside the slash command handlers. Colors, field labels, and copy are easy to change without touching any bot logic.
- **Auto-shutdown behavior** — configurable via `.env`, but the underlying logic lives in the `setInterval` block near the bottom of `index.js` if you want to change how it actually works.

If something's broken and you suspect it might be a simple fix, take a look at the code before opening an issue — it's probably shorter than you expect.

---

## Troubleshooting

**Slash commands don't appear in Discord**
Run `node src/register-commands.js` and wait a few minutes. Make sure your bot invite URL includes the `applications.commands` scope, and that `CLIENT_ID` and `GUILD_ID` in your `.env` are correct.

**`sudo: a terminal is required` or permission denied on systemctl**
The sudoers rule isn't set up correctly, is configured for the wrong user, or the service name in the sudoers file doesn't match `MC_SERVICE`. Re-check step 7.

**`/status` shows RCON not responding right after `/start`**
This is expected — Paper takes 20–30 seconds to fully boot and open the RCON port. Run `/status` again after a moment.

**TPS not showing in `/status`**
TPS is read via the `tps` command which only exists on Paper. Vanilla servers will show N/A here.

**`RCON_PASSWORD is not set` error**
Your `.env` file is missing or not being loaded. Make sure it exists in the project root and that `dotenv` is installed (`npm install`).

**Auto-shutdown isn't triggering**
Check that `AUTO_STOP_MINUTES` is not set to `0` in your `.env`, and that `WARNING_MINUTES` is set lower than `AUTO_STOP_MINUTES`.

**Bot goes offline or crashes unexpectedly**
Check logs with `journalctl -u craftdaemon -n 50 --no-pager`. The most common causes are an invalid or expired token, a missing `.env` value, or a Node.js version mismatch.

---

## Contributing

This is a personal-use project. PRs and issues are welcome — open an issue first for larger changes so we can align before you put work in.

---

## License

MIT — see [LICENSE](LICENSE).
