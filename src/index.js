// Linux Warning: This bot uses sudo to manage the Minecraft server via systemd, so it must be run in an environment where it has passwordless sudo permissions for the specified systemctl commands.
// Make sure to configure your sudoers file accordingly and understand the security implications.

// ============================================================
//  Minecraft Server Discord Bot
//  Server management via systemd  |  Stats via RCON
// ============================================================

// Make sure to fill in the .env file with the appropriate values before running the bot.
// and run `node src/register-commands.js` once to set up the slash commands in your Discord server.

require("dotenv").config();
const { Client, IntentsBitField, GatewayIntentBits, ActivityType } = require("discord.js");
const { exec } = require("child_process");
const { promisify } = require("util");
const Rcon = require("rcon");

const execAsync = promisify(exec);

// ---- Example Config (from .env) ----------------------------------------
//
//  TOKEN=
//  GUILD_ID=
//  STATUS_CHANNEL_ID=
//
//  MC_SERVICE=minecraft          ← your systemd service name
//
//  RCON_HOST=127.0.0.1
//  RCON_PORT=25575
//  RCON_PASSWORD=
//
//  TUNNEL_ADDRESS=xx.ip.gl.ply.gg:12345  ← your optional tunnel address (e.g. Playit.gg) to display in the /address command
//
// ----------------------------------------------------------------

// Hardcoding is not reccomended for these values since they may differ between environments, but you can change the defaults here if you want:

const RCON_HOST        = process.env.RCON_HOST     || "127.0.0.1";
const RCON_PORT        = parseInt(process.env.RCON_PORT || "25575", 10);
const RCON_PASSWORD    = process.env.RCON_PASSWORD || "";
const MC_SERVICE        = process.env.MC_SERVICE       || "minecraft";
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID;
const TUNNEL_ADDRESS    = process.env.TUNNEL_ADDRESS   || null;

// Auto-shutdown configuration (Not on .env since these are more like constants that you probably won't change per-deployment)

const AUTO_STOP_MINUTES = 10;
const WARNING_MINUTES   = 8;
const CHECK_INTERVAL    = 30_000; // ms

// ---- Runtime state ---------------------------------------------
let emptySince   = null;
let warningSent  = false;

// ================================================================
//  systemd helpers
// ================================================================

// Returns the raw systemd active state:
//"active" | "inactive" | "activating" | "deactivating" | "failed" | "unknown"

async function getServiceState() {
    try {
        const { stdout } = await execAsync(
            `sudo systemctl is-active ${MC_SERVICE}`
        );
        return stdout.trim();
    } catch (err) {
        // is-active exits non-zero when not active; stdout still contains the state
        return (err.stdout || "unknown").trim();
    }
}

// Returns true only when the service is fully active
async function isServerRunning() {
    return (await getServiceState()) === "active";
}

// Runs systemctl start and resolves when the command returns
async function startServer() {
    await execAsync(`sudo systemctl start ${MC_SERVICE}`);
}

// Runs systemctl stop and resolves when the command returns
async function stopServer() {
    await execAsync(`sudo systemctl stop ${MC_SERVICE}`);
}

// Runs systemctl restart and resolves when the command returns
async function restartServer() {
    await execAsync(`sudo systemctl restart ${MC_SERVICE}`);
}

// Parses the ActiveEnterTimestamp from systemctl and returns uptime
// as a formatted string like "2h 15m 30s", or "N/A" if unavailable.
async function getServiceUptime() {
    try {
        const { stdout } = await execAsync(
            `sudo systemctl show ${MC_SERVICE} --property=ActiveEnterTimestamp`
        );
        // stdout: "ActiveEnterTimestamp=Wed 2025-01-01 12:00:00 WIB"
        const value = stdout.replace("ActiveEnterTimestamp=", "").trim();
        if (!value) return "N/A";

        const startDate = new Date(value);
        if (isNaN(startDate.getTime())) return "N/A";

        const totalSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
        if (totalSeconds < 0) return "N/A";

        const hours   = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours}h ${minutes}m ${seconds}s`;
    } catch {
        return "N/A";
    }
}

// ================================================================
//  RCON helpers 
// ================================================================

// Strip Minecraft formatting codes like §a, §r from RCON responses for cleaner display in Discord
function cleanMinecraftFormatting(str) {
    if (!str || typeof str !== "string") return "";
    return str.replace(/§[0-9A-FK-OR]/gi, "");
}

// Send a single RCON command and resolve with the cleaned response
function rconCommand(cmd, timeout = 2500) {
    return new Promise((resolve, reject) => {
        if (!RCON_PASSWORD)
            return reject(new Error("RCON_PASSWORD is not set in .env"));

        const conn = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD);
        let responded = false;
        let timer = null;

        const cleanup = () => {
            try { conn.disconnect(); } catch (_) {}
            if (timer) clearTimeout(timer);
        };

        conn.on("auth", () => {
            try { conn.send(cmd); } catch (e) { cleanup(); reject(e); }
        });

        conn.on("response", (str) => {
            responded = true;
            cleanup();
            resolve(cleanMinecraftFormatting(String(str)));
        });

        conn.on("error", (err) => { cleanup(); reject(err); });

        conn.on("end", () => {
            if (!responded) { cleanup(); reject(new Error("RCON connection ended before response.")); }
        });

        timer = setTimeout(() => {
            if (!responded) { cleanup(); reject(new Error("RCON timed out")); }
        }, timeout);

        try { conn.connect(); } catch (e) { cleanup(); reject(e); }
    });
}

async function getTps() {
    const res = await rconCommand("tps");
    return res.replace(/§./g, "").trim();
}

async function getPlayerList() {
    return rconCommand("list");
}

async function getOnlinePlayerCount() {
    try {
        const res = await rconCommand("list");
        const match = res.match(/There are (\d+) of a max of (\d+)/i);
        return match ? parseInt(match[1], 10) : null;
    } catch {
        return null;
    }
}

async function measureRconPing() {
    const start = Date.now();
    try {
        await rconCommand("list", 3000);
        return Date.now() - start;
    } catch {
        return null;
    }
}

// ================================================================
//  Discord client
// ================================================================

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        GatewayIntentBits.Guilds,
    ],
});

// ================================================================
//  Bot presence  driven by systemd state and RCON availability
// ================================================================

async function updateBotPresence() {
    try {
        const running = await isServerRunning();

        if (!running) {
            client.user.setPresence({
                status: "dnd",
                activities: [{ name: "🟥 Server Offline", type: ActivityType.Watching }],
            });
            return;
        }

        // Server is active — try to get player count via RCON
        const players = await getOnlinePlayerCount();

        if (players === null) {
            // Active but RCON not ready yet (still starting up)
            client.user.setPresence({
                status: "idle",
                activities: [{ name: "🟡 Server Starting...", type: ActivityType.Watching }],
            });
            return;
        }

        client.user.setPresence({
            status: "online",
            activities: [{
                name: `🟩 ${players} player${players !== 1 ? "s" : ""} online`,
                type: ActivityType.Watching,
            }],
        });
    } catch (err) {
        console.error("Presence update failed:", err);
    }
}

// ================================================================
//  Auto-shutdown  (Uses stopServer() instead of stdin.write)
// ================================================================

async function sendAutoStopWarning(minutesLeft) {
    try {
        const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
        if (!channel) return;
        await channel.send(
            `⚠️ **Server inactivity warning**\n` +
            `No players online for ${AUTO_STOP_MINUTES - minutesLeft} minute(s).\n` +
            `🕒 Server will automatically stop in **${minutesLeft} minute(s)** if no one joins.`
        );
    } catch (err) {
        console.error("Failed to send auto-stop warning:", err);
    }
}

setInterval(async () => {
    const running = await isServerRunning();

    if (!running) {
        emptySince  = null;
        warningSent = false;
        return;
    }

    const players = await getOnlinePlayerCount();
    if (players === null) return; // RCON not ready yet, skip this tick

    if (players > 0) {
        emptySince  = null;
        warningSent = false;
        return;
    }

    // No players
    if (!emptySince) {
        emptySince  = Date.now();
        warningSent = false;
        return;
    }

    const minutesEmpty = (Date.now() - emptySince) / 60_000;

    if (minutesEmpty >= WARNING_MINUTES && !warningSent) {
        const minutesLeft = Math.ceil(AUTO_STOP_MINUTES - minutesEmpty);
        await sendAutoStopWarning(minutesLeft);
        warningSent = true;
    }

    if (minutesEmpty >= AUTO_STOP_MINUTES) {
        console.log("[AutoStop] Stopping server due to inactivity.");
        try {
            await stopServer();
        } catch (err) {
            console.error("[AutoStop] Failed to stop server:", err);
        }
        emptySince  = null;
        warningSent = false;
    }

}, CHECK_INTERVAL);

// ================================================================
//  Ready
// ================================================================

client.on("ready", (c) => {
    console.log(`✅ ${c.user.username} is online.`);
});

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Managing systemd service: ${MC_SERVICE}`);

    await updateBotPresence();
    setInterval(updateBotPresence, 60_000);
});

// ================================================================
//  Slash command handler
// ================================================================

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // ── PING ───────────────────────────────────────────────────
    if (interaction.commandName === "ping") {
        const sent = await interaction.reply({ content: "🏓 Pinging...", fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        return interaction.editReply(`🏓 Pong! (${latency}ms)`);
    }

    // ── START ──────────────────────────────────────────────────
    if (interaction.commandName === "start") {
        const state = await getServiceState();

        if (state === "active") {
            return interaction.reply("🟢 Server is already running.");
        }
        if (state === "activating") {
            return interaction.reply("🟡 Server is already starting up, give it a moment.");
        }

        await interaction.reply("▶️ Starting server… (ETA ~30 seconds)");
        try {
            await startServer();
            return interaction.followUp("✅ Start command sent. Use `/status` to monitor startup.");
        } catch (err) {
            console.error("[/start]", err);
            return interaction.followUp("❌ Failed to start the server. Check bot sudo permissions.");
        }
    }

    // ── STOP ───────────────────────────────────────────────────
    if (interaction.commandName === "stop") {
        const running = await isServerRunning();

        if (!running) {
            return interaction.reply("🔴 Server is not running.");
        }

        await interaction.reply("🛑 Stopping server…");
        try {
            await stopServer();
            return interaction.followUp("✅ Server stopped.");
        } catch (err) {
            console.error("[/stop]", err);
            return interaction.followUp("❌ Failed to stop the server. Check bot sudo permissions.");
        }
    }

    // ── RESTART ────────────────────────────────────────────────
    if (interaction.commandName === "restart") {
        const running = await isServerRunning();

        if (!running) {
            return interaction.reply("🔴 Server is not running, use `/start` instead.");
        }

        await interaction.reply("🔄 Restarting server… (this takes ~30 seconds)");
        try {
            await restartServer();
            return interaction.followUp("✅ Restart command sent. Use `/status` to monitor.");
        } catch (err) {
            console.error("[/restart]", err);
            return interaction.followUp("❌ Failed to restart the server. Check bot sudo permissions.");
        }
    }

    // ── ADDRESS ────────────────────────────────────────────────
    if (interaction.commandName === "address") {
        if (!TUNNEL_ADDRESS) {
            return interaction.reply("⚠️ No server address has been configured. Set `TUNNEL_ADDRESS` in the bot's `.env` file.");
        }
        return interaction.reply({
            embeds: [{
                title: "🌐 Server Address",
                description: `Connect using the address below:`,
                color: 0x5865f2,
                fields: [
                    { name: "Java Edition Version", value: `\`${process.env.JAVA_EDITION_VERSION || "Not configured"}\``, inline: false },
                    { name: "Tunnel Address", value: `\`${TUNNEL_ADDRESS}\``, inline: false },
                    { name: "Local (LAN) Address", value: `\`${process.env.LOCAL_ADDRESS || "Not configured"}\``, inline: false },
                ],
                footer: { text: "Share this with your friends to let them join!" },
            }],
        });
    }

    // ── STATUS ─────────────────────────────────────────────────
    if (interaction.commandName === "status") {
        await interaction.deferReply();

        const state = await getServiceState();

        // Offline / failed
        if (state !== "active" && state !== "activating") {
            return interaction.editReply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: `🔴 **Server is OFFLINE**\n\`systemd state: ${state}\``,
                    color: 0xff0000,
                }],
            });
        }

        // Still starting up
        if (state === "activating") {
            return interaction.editReply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🟡 **Server is STARTING UP…**\nRCON will be available shortly.",
                    color: 0xffcc00,
                }],
            });
        }

        // Active — gather stats
        const uptimeText = await getServiceUptime();

        let tps = null, players = null, ping = null, rconOk = false;

        const [tpsRes, playersRes, pingRes] = await Promise.allSettled([
            getTps(),
            getPlayerList(),
            measureRconPing(),
        ]);

        if (tpsRes.status     === "fulfilled") tps     = tpsRes.value;
        if (playersRes.status === "fulfilled") players = playersRes.value;
        if (pingRes.status    === "fulfilled") ping    = pingRes.value;

        rconOk = !!(tps || players);

        // Parse player line
        let playersLine = "N/A";
        if (players) {
            const match = players.match(/There are (\d+) of a max of (\d+)/i);
            if (match) {
                const names = players.replace(/^There are .*?:\s*/i, "").trim();
                playersLine = `${match[1]} / ${match[2]}`;
                if (names) playersLine += `\n${names}`;
            } else {
                playersLine = players;
            }
        }

        const embed = {
            title: "🖥️ Server Status",
            color: rconOk ? 0x00ff66 : 0xffa500,
            description: rconOk
                ? "🟢 **Server is RUNNING**"
                : "🟠 **Server is running, but RCON is not responding yet.**",
            fields: [
                { name: "Uptime", value: `⏱️ ${uptimeText}`, inline: false },
            ],
        };

        if (rconOk) {
            embed.fields.push({ name: "TPS",             value: `📉 ${tps}`,                                    inline: false });
            embed.fields.push({ name: "Players",         value: `👥 ${playersLine}`,                            inline: false });
            embed.fields.push({ name: "Ping (RCON RTT)", value: ping !== null ? `📡 ${ping} ms` : "N/A",        inline: false });
            if (TUNNEL_ADDRESS) {
                embed.fields.push({ name: "Address", value: `🌐 \`${TUNNEL_ADDRESS}\``, inline: false });
            }
        } else {
            embed.fields.push({
                name: "RCON",
                value: "⚠️ RCON did not respond. The server may still be booting — try again in a moment.",
                inline: false,
            });
        }

        return interaction.editReply({ embeds: [embed] });
    }
});

// ================================================================

client.login(process.env.TOKEN);