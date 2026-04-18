// Linux Warning: This bot uses sudo to manage the Minecraft server via systemd, so it must be run in an environment where it has passwordless sudo permissions for the specified systemctl commands.
// Make sure to configure your sudoers file accordingly and understand the security implications.

// ============================================================
//  CraftDaemon  |  A Discord bot for managing your Minecraft server on Linux
//  Server management via systemd  |  Stats via RCON
//  Required external files: .env (configuration), logger.js (custom logging utility), rconmanager.js (RCON manager)
// ============================================================

// Make sure to fill in the .env file with the appropriate values before running the bot.
// and run `node src/register-commands.js` once to set up the slash commands in your Discord server.

require("dotenv").config();
const { Client, GatewayIntentBits, ActivityType, PermissionFlagsBits } = require("discord.js");
const { exec } = require("child_process");
const { promisify } = require("util");
// RconManager replaces the old stateless rcon helper.
// The raw `rcon` package is now an internal detail of RconManager only.
const {
    RconManager,
    DEFAULT_KEEPALIVE_INTERVAL_MS,
    DEFAULT_RECONNECT_INTERVAL_MS,
    DEFAULT_STARTING_GRACE_PERIOD_MS,
    DEFAULT_COMMAND_TIMEOUT_MS,
    DEFAULT_MAX_KEEPALIVE_FAILURES,
    DEFAULT_REFUSED_LOG_INTERVAL_MS,
} = require("./services/rconmanager");

// Import custom logger
const { createLogger, mainLogger, LogLevel } = require("./services/logger");

// Promisified exec for easier async/await usage
const execAsync = promisify(exec);

// Create category-specific loggers (Create your own categories as needed by calling createLogger with a custom name in your modules)
const botLogger = createLogger('Bot');
const discordLogger = createLogger('Discord');
const minecraftLogger = createLogger('Minecraft');
const autoStopLogger = createLogger('AutoStop');
const systemdLogger = createLogger('SystemD');

const LOG_LEVEL_NAME_BY_VALUE = Object.fromEntries(
    Object.entries(LogLevel).map(([name, value]) => [value, name])
);

// ---- Example Config [CHANGE IN .ENV] (check .env.example for details) ----------------------------------------
//
//  TOKEN=
//  GUILD_ID=
//  STATUS_CHANNEL_ID=
//
//  MC_SERVICE=minecraft        [your systemd service name]
//
//  RCON_HOST=127.0.0.1
//  RCON_PORT=25575
//  RCON_PASSWORD=
//
// ----------------------------------------------------------------

// Hardcoding is not reccomended for these values since they may differ between environments, but you can change the defaults here if you want:

function getEnvInt(name, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === "") return fallback;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

const RCON_HOST = process.env.RCON_HOST || "127.0.0.1";
const RCON_PORT = getEnvInt("RCON_PORT", 25575, { min: 1, max: 65535 });
const RCON_PASSWORD = process.env.RCON_PASSWORD || "";
const MC_SERVICE = process.env.MC_SERVICE || "minecraft";
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID || null;
const MAIN_ADDRESS = process.env.MAIN_ADDRESS || null;

// Auto-shutdown configuration (from .env with defaults)

const AUTO_STOP_MINUTES = getEnvInt("AUTO_STOP_MINUTES", 10, { min: 0, max: 10_080 }); // 7 days max
const WARNING_MINUTES = getEnvInt("WARNING_MINUTES", 8, { min: 0, max: 10_080 });
const EFFECTIVE_WARNING_MINUTES = WARNING_MINUTES > 0
    ? Math.min(WARNING_MINUTES, Math.max(AUTO_STOP_MINUTES - 1, 1))
    : 0;
const CHECK_INTERVAL_MS = getEnvInt(
    "CHECK_INTERVAL_MS",
    getEnvInt("CHECK_INTERVAL", 30_000, { min: 5_000, max: 300_000 }), // backward-compatible legacy key
    { min: 5_000, max: 300_000 }
);
const PRESENCE_SYSTEMD_FALLBACK_INTERVAL_MS = getEnvInt("PRESENCE_SYSTEMD_FALLBACK_INTERVAL_MS", 15_000, { min: 5_000, max: 120_000 });
const SAVEALL_DELAY_MS = getEnvInt("SAVEALL_DELAY_MS", 1_000, { min: 0, max: 30_000 });

const RCON_KEEPALIVE_INTERVAL_MS = getEnvInt("RCON_KEEPALIVE_INTERVAL_MS", DEFAULT_KEEPALIVE_INTERVAL_MS, { min: 10_000, max: 300_000 });
const RCON_RECONNECT_INTERVAL_MS = getEnvInt("RCON_RECONNECT_INTERVAL_MS", DEFAULT_RECONNECT_INTERVAL_MS, { min: 1_000, max: 60_000 });
const RCON_STARTING_GRACE_PERIOD_MS = getEnvInt("RCON_STARTING_GRACE_PERIOD_MS", DEFAULT_STARTING_GRACE_PERIOD_MS, { min: 0, max: 120_000 });
const RCON_COMMAND_TIMEOUT_MS = getEnvInt("RCON_COMMAND_TIMEOUT_MS", DEFAULT_COMMAND_TIMEOUT_MS, { min: 1_000, max: 60_000 });
const RCON_MAX_KEEPALIVE_FAILURES = getEnvInt("RCON_MAX_KEEPALIVE_FAILURES", DEFAULT_MAX_KEEPALIVE_FAILURES, { min: 1, max: 10 });
const RCON_REFUSED_LOG_INTERVAL_MS = getEnvInt("RCON_REFUSED_LOG_INTERVAL_MS", DEFAULT_REFUSED_LOG_INTERVAL_MS, { min: 0, max: 300_000 });

// ---- Runtime state ---------------------------------------------
let emptySince   = null;
let warningSent  = false;

// rconManager is declared here so every part of this file can reference it,
// but it is only *initialised* inside client.once("clientReady") - after the
// Discord client is fully logged in - because the manager drives bot presence.
/** @type {import("./services/rconmanager").RconManager|null} */
let rconManager  = null;

// ========== STARTUP CONFIG LOGGING (Default Console Broadcast when bot starts) ==========
botLogger.info("========== BOT STARTUP CONFIGURATION ==========");
botLogger.info(`Active log level: ${LOG_LEVEL_NAME_BY_VALUE[mainLogger.minLevel] || "INFO"}`);
botLogger.info(`RCON Host: ${RCON_HOST}`);
botLogger.info(`RCON Port: ${RCON_PORT}`);
botLogger.info(`Minecraft Service: ${MC_SERVICE}`);
botLogger.info(`Auto-stop enabled: ${AUTO_STOP_MINUTES > 0 ? `Yes (${AUTO_STOP_MINUTES} min idle, warning at ${EFFECTIVE_WARNING_MINUTES || "disabled"} min)` : "No"}`);
botLogger.info(`Status channel ID: ${STATUS_CHANNEL_ID || "NOT SET"}`);
botLogger.info(`Main address: ${MAIN_ADDRESS || "NOT SET"}`);
botLogger.info(`RCON keepalive/reconnect/timeout: ${RCON_KEEPALIVE_INTERVAL_MS}ms / ${RCON_RECONNECT_INTERVAL_MS}ms / ${RCON_COMMAND_TIMEOUT_MS}ms`);
botLogger.info("=============================================");

// ================================================================
//  systemd helpers
// ================================================================

// Returns the raw systemd active state:
//"active" | "inactive" | "activating" | "deactivating" | "failed" | "unknown"

async function getServiceState() {
    try {
        const { stdout } = await execAsync(
            `systemctl is-active ${MC_SERVICE}`
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

// Send /save-all command via RCON to save world data (to prevent unexpected
// data loss on shutdown/restart). Called before stopServer() and restartServer().
// Uses rconSend() (backed by the persistent manager) rather than the old
// stateless rconCommand() helper that was removed in v1.2.0.
async function saveAll() {
    try {
        minecraftLogger.info("Sending /save-all command via RCON...");
        const res = await rconSend("save-all");
        if (res !== null) {
            minecraftLogger.info(`Save-all response: ${res}`);
        } else {
            minecraftLogger.warn("Save-all returned no response (RCON may not be connected). Continuing with shutdown.");
        }
    } catch (err) {
        minecraftLogger.error(`Failed to send save-all: ${err.message}`);
        // Don't throw — continue with shutdown even if save fails.
    }
}

// Runs systemctl stop and resolves when the command returns
async function stopServer() {
    await saveAll();
    // Give the server a moment to process the save command.
    await new Promise(resolve => setTimeout(resolve, SAVEALL_DELAY_MS));
    await execAsync(`sudo systemctl stop ${MC_SERVICE}`);
}

// Runs systemctl restart and resolves when the command returns
async function restartServer() {
    await saveAll();
    // Give the server a moment to process the save command.
    await new Promise(resolve => setTimeout(resolve, SAVEALL_DELAY_MS));
    await execAsync(`sudo systemctl restart ${MC_SERVICE}`);
}

// Parses the ActiveEnterTimestamp from systemctl and returns uptime
// as a formatted string like "2h 15m 30s", or "N/A" if unavailable.
async function getServiceUptime() {
    try {
        const { stdout } = await execAsync(
            `sudo systemctl show ${MC_SERVICE} --property=ActiveEnterTimestamp`
        );
        // stdout: "ActiveEnterTimestamp=Wed 2025-01-01 12:00:00 UTC"
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
//  NOTE: Low-level rcon helpers (rconCommand, cleanMinecraftFormatting,
//  getOnlinePlayerCount, etc.) have been removed in v1.2.0.
//  All RCON I/O now goes through the persistent `rconManager` instance
//  defined in the clientReady handler below.
//
//  Thin wrappers are kept here so the /status command can issue ad-hoc
//  commands via the manager without duplicating the send/await pattern.
// ================================================================

/**
 * Sends an RCON command through the persistent manager and returns the
 * cleaned response string.  Returns null (never throws) so callers can
 * safely use it inside Promise.allSettled() chains.
 *
 * @param {string} cmd
 * @returns {Promise<string|null>}
 */
async function rconSend(cmd) {
    try {
        return await rconManager.sendCommand(cmd);
    } catch (err) {
        minecraftLogger.warn(`rconSend("${cmd}") failed: ${err.message}`);
        return null;
    }
}

/**
 * Fetches the current TPS via RCON and strips any residual formatting codes.
 * @returns {Promise<string|null>}
 */
async function getTps() {
    const res = await rconSend("tps");
    return res ? res.replace(/§./g, "").trim() : null;
}

/**
 * Fetches the full "list" response (player names + count) via RCON.
 * @returns {Promise<string|null>}
 */
async function getPlayerList() {
    return rconSend("list");
}

/**
 * Fetches the full "list" response and the measured command round-trip time.
 * @returns {Promise<{ players: string|null, ping: number|null }>}
 */
async function getPlayerListWithPing() {
    const start = Date.now();
    const players = await getPlayerList();
    return {
        players,
        ping: players !== null ? Date.now() - start : null,
    };
}

// ================================================================
//  Discord client
// ================================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ================================================================
//  Bot presence  (driven by RconManager events, not polling)
//  ── See client.once("clientReady") for the event wiring ──────
// ================================================================

// ================================================================
//  Auto-shutdown  (Uses stopServer())
// ================================================================

async function sendAutoStopWarning(minutesLeft) {
    try {
        const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
        if (!channel) {
            autoStopLogger.error("Channel not found. Check STATUS_CHANNEL_ID in .env");
            return;
        }

        // Check bot permissions.
        if (!channel.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)) {
            autoStopLogger.warn("Bot missing SendMessages permission.");
        }
        if (!channel.permissionsFor(client.user).has(PermissionFlagsBits.EmbedLinks)) {
            autoStopLogger.error("Bot missing EmbedLinks permission - cannot send embeds.");
            return;
        }
        
        await channel.send({
            embeds: [{
                title: "⚠️ Server Inactivity Warning",
                description: `No players online for **${AUTO_STOP_MINUTES - minutesLeft}** minute(s).\n\nServer will automatically stop in **${minutesLeft}** minute(s) if no one joins.`,
                color: 0xffcc00,
            }],
        });
    } catch (err) {
        autoStopLogger.error(`Failed to send warning: ${err.message}`);
    }
}

async function sendAutoStopShutdown() {
    try {
        const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
        if (!channel) {
            autoStopLogger.error("Channel not found. Check STATUS_CHANNEL_ID in .env");
            return;
        }

        // Check bot permissions.
        if (!channel.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)) {
            autoStopLogger.warn("Bot missing SendMessages permission.");
        }
        if (!channel.permissionsFor(client.user).has(PermissionFlagsBits.EmbedLinks)) {
            autoStopLogger.error("Bot missing EmbedLinks permission - cannot send embeds.");
            return;
        }
        
        await channel.send({
            embeds: [{
                title: "🛑 Server Shut Down",
                description: `Server has been automatically stopped due to inactivity (${AUTO_STOP_MINUTES} minutes with no players online).`,
                color: 0xff0000,
            }],
        });
    } catch (err) {
        autoStopLogger.error(`Failed to send shutdown notification: ${err.message}`);
    }
}

// ================================================================
//  Auto-stop interval
//  Player count is sourced from rconManager.playerCount (kept fresh
//  by the manager's keepalive loop) rather than making separate RCON
//  calls, which eliminates double-polling and log spam.
// ================================================================

setInterval(async () => {
    if (AUTO_STOP_MINUTES <= 0) return; // Explicitly disabled by config.

    // If the manager hasn't been initialised yet (pre-ready), skip this tick.
    if (!rconManager) return;

    // Use the manager's connection state as the authoritative "is server up"
    // signal, replacing the old isServerRunning() systemctl check.
    if (!rconManager.connected) {
        if (emptySince !== null) {
            // [AUTO-STOP TRACKING] Server offline - reset timer
            autoStopLogger.info("Server went offline. Resetting auto-stop timer.");
        }
        emptySince  = null;
        warningSent = false;
        return;
    }

    // playerCount is null if the keepalive hasn't resolved yet (still starting).
    const players = rconManager.playerCount;
    if (players === null) return; // RCON not ready yet, skip this tick

    if (players > 0) {
        if (emptySince !== null) {
            // [AUTO-STOP TRACKING] Players joined - cancel shutdown
            autoStopLogger.info(`Players detected (${players}). Cancelling auto-stop timer.`);
        }
        emptySince  = null;
        warningSent = false;
        return;
    }

    // No players online
    if (!emptySince) {
        // [AUTO-STOP TRACKING] Server became empty - start timer
        emptySince  = Date.now();
        warningSent = false;
        autoStopLogger.info(`Server is now empty. Auto-stop timer started (${AUTO_STOP_MINUTES} minutes until shutdown).`);
        return;
    }

    const minutesEmpty = (Date.now() - emptySince) / 60_000;

    if (EFFECTIVE_WARNING_MINUTES > 0 && minutesEmpty >= EFFECTIVE_WARNING_MINUTES && !warningSent) {
        const minutesLeft = Math.ceil(AUTO_STOP_MINUTES - minutesEmpty);
        // [AUTO-STOP TRACKING] Sending warning
        autoStopLogger.warn(`Server empty for ${minutesEmpty.toFixed(1)} minutes. Warning sent (${minutesLeft} min until shutdown).`);
        await sendAutoStopWarning(minutesLeft);
        warningSent = true;
    }

    if (minutesEmpty >= AUTO_STOP_MINUTES) {
        // [AUTO-STOP TRACKING] Threshold reached - shutting down
        autoStopLogger.info(`Server empty for ${minutesEmpty.toFixed(1)} minutes (threshold: ${AUTO_STOP_MINUTES}). Initiating shutdown.`);
        try {
            await stopServer();
            await sendAutoStopShutdown();
            autoStopLogger.warn(`Server stopped due to inactivity. Shutdown notification sent.`);
        } catch (err) {
            autoStopLogger.error(`Failed to stop server: ${err.message}`);
        }
        emptySince  = null;
        warningSent = false;
    }

}, CHECK_INTERVAL_MS);

// ================================================================
//  Ready
// ================================================================

client.on("clientReady", (c) => {
    discordLogger.info(`✅ ${c.user.username} is online.`);
});

client.once("clientReady", async () => {
    discordLogger.info(`Logged in as ${client.user.tag}`);
    systemdLogger.info(`Managing systemd service: ${MC_SERVICE}`);

    // ── Initialise RconManager ───────────────────────────────
    //  Must happen here (post-login) because the manager immediately
    //  drives client.user.setPresence(), which requires an authenticated
    //  Discord session.  Creating it at module scope would crash on
    //  startup before login completes.

    rconManager = new RconManager({
        host:     RCON_HOST,
        port:     RCON_PORT,
        password: RCON_PASSWORD,
        keepaliveIntervalMs: RCON_KEEPALIVE_INTERVAL_MS,
        reconnectIntervalMs: RCON_RECONNECT_INTERVAL_MS,
        startingGracePeriodMs: RCON_STARTING_GRACE_PERIOD_MS,
        commandTimeoutMs: RCON_COMMAND_TIMEOUT_MS,
        maxKeepaliveFailures: RCON_MAX_KEEPALIVE_FAILURES,
        refusedLogIntervalMs: RCON_REFUSED_LOG_INTERVAL_MS,
    });

    // ── Presence event wiring ────────────────────────────────
    //  Each handler is a single setPresence call, keeping presence
    //  logic co-located and easy to audit.

    /**
     * Fallback presence resolver used while RCON is disconnected.
     * If systemd says the service is active/activating, show "Starting";
     * otherwise show "Offline".
     */
    async function setDisconnectedPresenceFromSystemd() {
        if (!rconManager || rconManager.connected) return;

        try {
            const state = await getServiceState();
            if (rconManager.connected) return; // avoid stale async updates

            if (state === "active" || state === "activating") {
                discordLogger.debug(`[PRESENCE] systemd fallback → starting (${state}).`);
                client.user.setPresence({
                    status: "idle",
                    activities: [{ name: "🟡 Server Starting...", type: ActivityType.Watching }],
                });
                return;
            }
        } catch (err) {
            systemdLogger.warn(`Presence systemd fallback failed: ${err.message}`);
        }

        discordLogger.debug("[PRESENCE] systemd fallback → offline.");
        client.user.setPresence({
            status: "dnd",
            activities: [{ name: "🟥 Server Offline", type: ActivityType.Watching }],
        });
    }

    /**
     * Fired by RconManager every keepalive cycle with the live player count.
     * Also re-fired when the starting grace period ends.
     * This is the normal "server is healthy" presence path.
     */
    rconManager.on("playerCount", (count) => {
        // During the starting grace period, ignore live counts — the
        // "starting" event handler already set the correct presence.
        if (rconManager.isStarting) return;

        discordLogger.debug(`[PRESENCE] playerCount event → ${count} player(s) online.`);
        client.user.setPresence({
            status: "online",
            activities: [{
                name: `🟩 ${count} player${count !== 1 ? "s" : ""} online`,
                type: ActivityType.Watching,
            }],
        });
    });

    /**
     * Fired when RCON socket is lost.  Covers both clean disconnects
     * and error-induced drops.  The manager will reconnect automatically.
     */
    rconManager.on("offline", () => {
        void setDisconnectedPresenceFromSystemd();
    });

    /**
     * Fired for STARTING_GRACE_PERIOD_MS immediately after a *re*connect
     * (not the very first connect).  Lets players know the server is coming
     * back up without showing a premature player count.
     */
    rconManager.on("starting", () => {
        discordLogger.debug("[PRESENCE] starting event → Server Starting…");
        client.user.setPresence({
            status: "idle",
            activities: [{ name: "🟡 Server Starting...", type: ActivityType.Watching }],
        });
    });

    // ── Start the persistent connection ─────────────────────
    //  This triggers the first connect attempt and kicks off the
    //  keepalive + reconnect lifecycle.
    rconManager.start();

    // While disconnected, periodically refine presence from systemd state so
    // startup is shown as "Starting..." instead of always "Offline".
    setInterval(() => {
        void setDisconnectedPresenceFromSystemd();
    }, PRESENCE_SYSTEMD_FALLBACK_INTERVAL_MS);

    // Prime presence immediately on startup before the first manager events.
    void setDisconnectedPresenceFromSystemd();
});

// ================================================================
//  Slash command handler
// ================================================================

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // ── PING ───────────────────────────────────────────────────
    if (interaction.commandName === "ping") {
        discordLogger.info(`Ping command from ${interaction.user.tag}`);
        const sent = await interaction.reply({ 
            embeds: [{
                title: "🏓 Pinging...",
                description: "Measuring latency...",
                color: 0x5865f2,
            }],
            fetchReply: true 
        });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        return interaction.editReply({
            embeds: [{
                title: "🏓 Pong!",
                description: `Bot latency: **${latency}ms**`,
                color: 0x5865f2,
            }],
        });
    }

    // ── START ──────────────────────────────────────────────────
    if (interaction.commandName === "start") {
        systemdLogger.info(`Start command from ${interaction.user.tag}`);
        const state = await getServiceState();

        if (state === "active") {
            return interaction.reply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🟢 Server is already running.",
                    color: 0x00ff66,
                }],
            });
        }
        if (state === "activating") {
            return interaction.reply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🟡 Server is already starting up, give it a moment.",
                    color: 0xffcc00,
                }],
            });
        }

        await interaction.reply({
            embeds: [{
                title: "▶️ Starting Server",
                description: "Starting server… (ETA ~30 seconds)",
                color: 0x5865f2,
            }],
        });
        try {
            await startServer();
            return interaction.followUp({
                embeds: [{
                    title: "✅ Start Command Sent",
                    description: "Use `/status` to monitor startup.",
                    color: 0x00ff66,
                }],
            });
        } catch (err) {
            systemdLogger.error(`Start command failed: ${err.message}`);
            return interaction.followUp({
                embeds: [{
                    title: "❌ Start Failed",
                    description: "Failed to start the server. Check bot sudo permissions.",
                    color: 0xff0000,
                }],
            });
        }
    }

    // ── STOP ───────────────────────────────────────────────────
    if (interaction.commandName === "stop") {
        systemdLogger.info(`Stop command from ${interaction.user.tag}`);
        const running = await isServerRunning();

        if (!running) {
            return interaction.reply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🔴 Server is not running.",
                    color: 0xff0000,
                }],
            });
        }
        
        await interaction.reply({
            embeds: [{
                title: "🛑 Stopping Server",
                description: "Stopping server…",
                color: 0xff4d00,
            }],
        });
        try {
            await stopServer();
            return interaction.followUp({
                embeds: [{
                    title: "✅ Server Stopped",
                    description: "Server has been stopped successfully.",
                    color: 0xff0000,
                }],
            });
        } catch (err) {
            systemdLogger.error(`Stop command failed: ${err.message}`);
            return interaction.followUp({
                embeds: [{
                    title: "❌ Stop Failed",
                    description: "Failed to stop the server. Check bot sudo permissions.",
                    color: 0xff0000,
                }],
            });
        }
    }

    // ── RESTART ────────────────────────────────────────────────
    if (interaction.commandName === "restart") {
        systemdLogger.info(`Restart command from ${interaction.user.tag}`);
        const running = await isServerRunning();

        if (!running) {
            return interaction.reply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🔴 Server is not running, use `/start` instead.",
                    color: 0xff0000,
                }],
            });
        }

        await interaction.reply({
            embeds: [{
                title: "🔄 Restarting Server",
                description: "Restarting server… (this takes ~30 seconds)",
                color: 0x5865f2,
            }],
        });
        try {
            await restartServer();
            return interaction.followUp({
                embeds: [{
                    title: "✅ Restart Command Sent",
                    description: "Use `/status` to monitor the restart.",
                    color: 0x00ff66,
                }],
            });
        } catch (err) {
            systemdLogger.error(`Restart command failed: ${err.message}`);
            return interaction.followUp({
                embeds: [{
                    title: "❌ Restart Failed",
                    description: "Failed to restart the server. Check bot sudo permissions.",
                    color: 0xff0000,
                }],
            });
        }
    }

    // ── ADDRESS ────────────────────────────────────────────────
    if (interaction.commandName === "address") {
        discordLogger.info(`Address command from ${interaction.user.tag}`);
        if (!MAIN_ADDRESS) {
            return interaction.reply({
                embeds: [{
                    title: "⚠️ Server Address Not Configured",
                    description: "Set `MAIN_ADDRESS` in the bot's `.env` file.",
                    color: 0xffcc00,
                }],
            });
        }
        return interaction.reply({
            embeds: [{
                title: "🌐 Server Address",
                description: "Share these addresses with your friends to let them join!",
                color: 0x5865f2,
                fields: [
                    { name: "Main Address", value: `\`${MAIN_ADDRESS}\``, inline: false },
                    { name: "Java Edition", value: `\`${process.env.JAVA_EDITION_VERSION || "Not configured"}\``, inline: true },
                    { name: "LAN Address", value: `\`${process.env.LOCAL_ADDRESS || "Not configured"}\``, inline: true },
                ],
            }],
        });
    }

    // ── STATUS ─────────────────────────────────────────────────
    if (interaction.commandName === "status") {
        systemdLogger.info(`Status command from ${interaction.user.tag}`);
        await interaction.deferReply();

        const state = await getServiceState();

        // Offline / failed
        if (state !== "active" && state !== "activating") {
            systemdLogger.warn(`Server offline, state: ${state}`);            
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
            systemdLogger.info("Server is activating, RCON not ready yet");           
            return interaction.editReply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🟡 **Server is STARTING UP…**\nRCON will be available shortly.",
                    color: 0xffcc00,
                }],
            });
        }

        // Active — gather stats
        // [STATUS QUERY] Starting stat collection
        const statsStartTime = Date.now();
        const uptimeText = await getServiceUptime();

        let tps = null, players = null, ping = null, rconOk = false;

        const [tpsRes, playersWithPingRes] = await Promise.allSettled([
            getTps(),
            getPlayerListWithPing(),
        ]);

        if (tpsRes.status     === "fulfilled") tps     = tpsRes.value;
        if (playersWithPingRes.status === "fulfilled") {
            players = playersWithPingRes.value.players;
            ping = playersWithPingRes.value.ping;
        }

        if (tpsRes.status === "rejected") minecraftLogger.warn(`TPS query failed: ${tpsRes.reason.message}`);
        if (playersWithPingRes.status === "rejected") minecraftLogger.warn(`Player list query failed: ${playersWithPingRes.reason.message}`);
        rconOk = !!(tps || players);
        
        // [STATUS QUERY] Log completed stats with query time
        const statsEndTime = Date.now();
        const queryTime = statsEndTime - statsStartTime;
        systemdLogger.debug(`Status query completed in ${queryTime}ms | TPS: ${tps || "N/A"} | Players Online: ${players ? players.split(":").pop().trim().substring(0, 40) : "N/A"} | RCON RTT: ${ping || "N/A"}ms`);

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
            if (MAIN_ADDRESS) {
                embed.fields.push({ name: "Address", value: `🌐 \`${MAIN_ADDRESS}\``, inline: false });
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