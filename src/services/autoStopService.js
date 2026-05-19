// Auto-stop service: monitors player count and automatically shuts down the server
// after a configurable period of inactivity, with optional warning messages.
// This service relies on rconManager's playerCount and connected state.

const { PermissionFlagsBits } = require("discord.js");
const { createLogger } = require("./logger");
const { stopServer } = require("./minecraftSystemd");
const { getEnvInt, getEnvString } = require("../utils/env");

const autoStopLogger = createLogger("AutoStop");

// ========== Configuration parsing (from .env with defaults) ==========   

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
const STATUS_CHANNEL_ID = getEnvString("STATUS_CHANNEL_ID", null);

// ========== Runtime state ==========

let emptySince = null;
let warningSent = false;
let intervalHandle = null;

// ========== Helper functions for Discord messaging ==========

async function sendAutoStopWarning(client, minutesLeft) {
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

async function sendAutoStopShutdown(client) {
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

// ========== Auto-stop check loop ==========
// Player count is sourced from rconManager.playerCount (kept fresh by the manager's keepalive loop)
// rather than making separate RCON calls, which eliminates double-polling and log spam.

function startAutoStopLoop(client, rconManager) {
    if (intervalHandle !== null) {
        autoStopLogger.warn("Auto-stop loop already running, skipping.");
        return;
    }

    intervalHandle = setInterval(async () => {
        if (AUTO_STOP_MINUTES <= 0) return; // Explicitly disabled by config.

        // If the manager hasn't been initialised yet, skip this tick.
        if (!rconManager) return;

        // Use the manager's connection state as the authoritative "is server up" signal.
        if (!rconManager.connected) {
            if (emptySince !== null) {
                // [AUTO-STOP TRACKING] Server offline - reset timer
                autoStopLogger.info("Server went offline. Resetting auto-stop timer.");
            }
            emptySince = null;
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
            emptySince = null;
            warningSent = false;
            return;
        }

        // No players online
        if (!emptySince) {
            // [AUTO-STOP TRACKING] Server became empty - start timer
            emptySince = Date.now();
            warningSent = false;
            autoStopLogger.info(`Server is now empty. Auto-stop timer started (${AUTO_STOP_MINUTES} minutes until shutdown).`);
            return;
        }

        const minutesEmpty = (Date.now() - emptySince) / 60_000;

        if (EFFECTIVE_WARNING_MINUTES > 0 && minutesEmpty >= EFFECTIVE_WARNING_MINUTES && !warningSent) {
            const minutesLeft = Math.ceil(AUTO_STOP_MINUTES - minutesEmpty);
            // [AUTO-STOP TRACKING] Sending warning
            autoStopLogger.warn(`Server empty for ${minutesEmpty.toFixed(1)} minutes. Warning sent (${minutesLeft} min until shutdown).`);
            await sendAutoStopWarning(client, minutesLeft);
            warningSent = true;
        }

        if (minutesEmpty >= AUTO_STOP_MINUTES) {
            // [AUTO-STOP TRACKING] Threshold reached - shutting down
            autoStopLogger.info(`Server empty for ${minutesEmpty.toFixed(1)} minutes (threshold: ${AUTO_STOP_MINUTES}). Initiating shutdown.`);
            try {
                await stopServer();
                await sendAutoStopShutdown(client);
                autoStopLogger.warn(`Server stopped due to inactivity. Shutdown notification sent.`);
            } catch (err) {
                autoStopLogger.error(`Failed to stop server: ${err.message}`);
            }
            emptySince = null;
            warningSent = false;
        }
    }, CHECK_INTERVAL_MS);
}

function stopAutoStopLoop() {
    if (intervalHandle !== null) {
        clearInterval(intervalHandle);
        intervalHandle = null;
        autoStopLogger.info("Auto-stop loop stopped.");
    }
}

// ========== Exported initialization function ==========

/**
 * Initialize the auto-stop service.
 * @param {import("discord.js").Client} client - Discord client instance
 * @param {import("./rconManager").RconManager} rconManager - RCON manager instance
 */
function init(client, rconManager) {
    if (AUTO_STOP_MINUTES <= 0) {
        autoStopLogger.info("Auto-stop disabled by configuration (AUTO_STOP_MINUTES <= 0).");
        return;
    }

    autoStopLogger.info(`Auto-stop initialized: ${AUTO_STOP_MINUTES} min idle, warning at ${EFFECTIVE_WARNING_MINUTES || "disabled"} min, check every ${CHECK_INTERVAL_MS}ms`);
    startAutoStopLoop(client, rconManager);
}

function shutdown() {
    stopAutoStopLoop();
}

module.exports = {
    init,
    shutdown,
    // Export config constants for startup logging
    AUTO_STOP_MINUTES,
    EFFECTIVE_WARNING_MINUTES,
};
