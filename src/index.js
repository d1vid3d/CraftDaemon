const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../config/.env") });

const { Client, Collection, GatewayIntentBits, ActivityType, PermissionFlagsBits } = require("discord.js");
// Per release version 1.2.0 RconManager replaces the old stateless rcon helper.
// The raw `rcon` package is now an internal detail of RconManager only.
const { setRconManager } = require("./services/rconQuery");
const { getServiceState, stopServer } = require("./services/minecraftSystemd");
const {
    RconManager,
    DEFAULT_KEEPALIVE_INTERVAL_MS,
    DEFAULT_RECONNECT_INTERVAL_MS,
    DEFAULT_STARTING_GRACE_PERIOD_MS,
    DEFAULT_COMMAND_TIMEOUT_MS,
    DEFAULT_MAX_KEEPALIVE_FAILURES,
    DEFAULT_REFUSED_LOG_INTERVAL_MS,
} = require("./services/rconManager");

// Import custom logger
const { createLogger, mainLogger, LogLevel } = require("./services/logger");
const { init: initUpdateService } = require("./services/updateService");

// Create category-specific loggers here (Create your own categories as needed by calling createLogger with a custom name in your modules , check docs for details)
const botLogger = createLogger('Bot');
const discordLogger = createLogger('Discord');
const autoStopLogger = createLogger('AutoStop');
const systemdLogger = createLogger('SystemD');

const LOG_LEVEL_NAME_BY_VALUE = Object.fromEntries(
    Object.entries(LogLevel).map(([name, value]) => [value, name])
);


// Config warnings checks
// This is a best-effort heuristic system to catch common misconfigurations like forgetting to fill in the RBAC config or leaving placeholder values in .env.
// It runs once on startup and logs any warnings it finds, but it does not prevent the bot from running since some warnings may be non-critical
// depending on your use case (e.g. you might intentionally not use RBAC or have a separate presence monitoring system instead of RCON).
// Review the logged warnings and ensure your environment is set up correctly before relying on the bot in production.

/** @type {any} */
let permissionConfig = null;
try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    permissionConfig = require("../config/permission-config");
} catch {
    permissionConfig = null;
}

function isAllSameDigitSnowflake(id) {
    return /^\d{17,20}$/.test(id) && /^(\d)\1+$/.test(id);
}

function looksLikeTemplatePermissionConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return true;

    const templateIds = new Set([
        "123456789012345678",
        "111111111111111111",
        "222222222222222222",
        "444444444444444444",
    ]);

    const owners = Array.isArray(cfg.owner) ? cfg.owner : [];
    if (owners.some((id) => templateIds.has(String(id)))) return true;

    const roles = cfg.roles && typeof cfg.roles === "object" ? cfg.roles : {};
    for (const roleId of Object.values(roles)) {
        const id = String(roleId || "");
        if (!id) continue;
        if (templateIds.has(id)) return true;
        if (isAllSameDigitSnowflake(id)) return true;
    }

    const users = cfg.users && typeof cfg.users === "object" ? cfg.users : {};
    for (const userId of Object.keys(users)) {
        if (templateIds.has(String(userId))) return true;
    }

    return false;
}

function envLooksUnsetOrPlaceholder(raw) {
    const v = String(raw ?? "").trim();
    if (!v) return true;
    const upper = v.toUpperCase();
    if (upper.includes("YOUR_")) return true;
    if (upper.includes("CHANGE_ME")) return true;
    if (upper.includes("REPLACE_ME")) return true;
    if (upper.includes("TODO")) return true;
    return false;
}

function collectLikelyMisconfigWarnings() {
    /** @type {string[]} */
    const warnings = [];

    if (!permissionConfig) {
        warnings.push("RBAC config not found (expected `config/permission-config.js`).");
    } else if (looksLikeTemplatePermissionConfig(permissionConfig)) {
        warnings.push("RBAC config still looks like the template (`config/permission-config.js`). Replace example owner/role/user IDs with real Discord IDs.");
    }

    if (envLooksUnsetOrPlaceholder(process.env.TOKEN)) warnings.push("Discord `TOKEN` is missing or still looks like a placeholder.");
    if (envLooksUnsetOrPlaceholder(process.env.CLIENT_ID)) warnings.push("Discord `CLIENT_ID` is missing or still looks like a placeholder.");
    if (envLooksUnsetOrPlaceholder(process.env.GUILD_ID)) warnings.push("Discord `GUILD_ID` is missing or still looks like a placeholder.");

    if (envLooksUnsetOrPlaceholder(process.env.RCON_PASSWORD)) {
        warnings.push("Minecraft `RCON_PASSWORD` is missing or still looks like a placeholder (RCON features will not work reliably).");
    }

    if (AUTO_STOP_MINUTES > 0 && envLooksUnsetOrPlaceholder(process.env.STATUS_CHANNEL_ID)) {
        warnings.push("Auto-stop is enabled, but `STATUS_CHANNEL_ID` is missing or still looks like a placeholder (warnings/shutdown posts may fail).");
    }

    return warnings;
}

function warnStartupOperatorChecklist() {
    const warnings = collectLikelyMisconfigWarnings();
    if (!warnings.length) return;

    botLogger.warn("Startup checklist: please verify your environment + RBAC config before relying on this bot in production.");
    for (const w of warnings) botLogger.warn(`- ${w}`);
}

let startupOperatorChecklistWarned = false;

// Config parsing and validation (with defaults and sanity checks)
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
/** @type {import("./services/rconManager").RconManager|null} */
let rconManager  = null;

// ========== STARTUP CONFIG LOGGING (Default Console Broadcast when bot starts) ==========
botLogger.info("========== BOT STARTUP CONFIGURATION ==========");
botLogger.info(`CraftDaemon v${require("../package.json").version}`);
botLogger.info(`Active log level: ${LOG_LEVEL_NAME_BY_VALUE[mainLogger.minLevel] || "INFO"}`);
botLogger.info(`RCON Host: ${RCON_HOST}`);
botLogger.info(`RCON Port: ${RCON_PORT}`);
botLogger.info(`Minecraft Service: ${MC_SERVICE}`);
botLogger.info(`Auto-stop enabled: ${AUTO_STOP_MINUTES > 0 ? `Yes (${AUTO_STOP_MINUTES} min idle, warning at ${EFFECTIVE_WARNING_MINUTES || "disabled"} min)` : "No"}`);
botLogger.info(`Status channel ID: ${STATUS_CHANNEL_ID || "NOT SET"}`);
botLogger.info(`Main address: ${MAIN_ADDRESS || "NOT SET"}`);
botLogger.info(`RCON keepalive/reconnect/timeout: ${RCON_KEEPALIVE_INTERVAL_MS}ms / ${RCON_RECONNECT_INTERVAL_MS}ms / ${RCON_COMMAND_TIMEOUT_MS}ms`);
botLogger.info("=============================================");

// systemd + RCON query helpers live in ./services/minecraftSystemd and
// ./services/rconQuery (wired to `rconManager` after login).

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
//  Commands (config-driven RBAC expects command objects)
// ================================================================

// Load commands from the commands directory

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const command = require(filePath);
        if (command?.data?.name) {
            client.commands.set(command.data.name, command);
        }
    }
}

// ================================================================
//  Events
// ================================================================

const registerInteractionCreate = require("./events/interactionCreate");
registerInteractionCreate(client);

// ================================================================
//  Bot presence  (driven by RconManager events, not polling, as per v1.2.0 refactor)
//  See client.once("clientReady") for the event wiring
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
//  Auto-stop and its interval.
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

    if (!startupOperatorChecklistWarned) {
        startupOperatorChecklistWarned = true;
        warnStartupOperatorChecklist();
    }

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
    setRconManager(rconManager);

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

    initUpdateService(client);
});

// Slash commands live in ./commands and are dispatched from
// ./events/interactionCreate.js (RBAC via `permissionMiddleware`).

client.login(process.env.TOKEN);