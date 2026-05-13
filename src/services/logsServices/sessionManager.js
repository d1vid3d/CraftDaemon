//  sessionManager.js  |  Live log session lifecycle manager
//  Enforces one active live-log session per channel.
//  Each session owns:
//    - The spawned child process (journalctl / tail -f)
//    - The 2-second Discord message edit interval
//    - The 60-second auto-stop timeout
//    - The rotating LogBuffer instance

"use strict";

const { createLogger } = require("../logger");
const { LogBuffer } = require("./logBuffer");
const { createLiveStream } = require("./logStream");

const logsLogger = createLogger("Logs");

/** @type {Map<string, Session>} channelId → Session */
const activeSessions = new Map();

const EDIT_INTERVAL_MS = 2000;  // 2 seconds — safe for Discord rate limits
const SESSION_TIMEOUT_MS = 60_000; // 60 seconds auto-stop

/**
 * @typedef {Object} Session
 * @property {Function}         kill      - Kills the child process
 * @property {NodeJS.Timeout}   interval  - The 2s edit interval
 * @property {import("discord.js").Message} message - The Discord message being edited
 * @property {NodeJS.Timeout}   timeout   - The auto-stop timeout
 * @property {LogBuffer}        buffer    - The rotating log buffer
 */

/**
 * Checks whether a channel already has an active log session.
 *
 * @param {string} channelId
 * @returns {boolean}
 */
function hasActiveSession(channelId) {
    return activeSessions.has(channelId);
}

/**
 * Starts a new live log streaming session in the given channel.
 *
 * @param {string} channelId
 * @param {import("discord.js").Message} message - The live-updating Discord message.
 * @returns {{ success: boolean, error?: string }}
 */
function startSession(channelId, message) {
    if (activeSessions.has(channelId)) {
        return { success: false, error: "A log session is already active in this channel." };
    }

    const buffer = new LogBuffer();
    const { emitter, kill } = createLiveStream();

    // Stream → Buffer
    emitter.on("line", (line) => {
        buffer.push(line);
    });

    emitter.on("error", () => {
        // Process errors are logged by logStream.js. Stop session gracefully.
        stopSession(channelId, "Log stream encountered an error.");
    });

    emitter.on("close", () => {
        // If the process exits on its own, clean up the session.
        if (activeSessions.has(channelId)) {
            stopSession(channelId, "Log stream process exited.");
        }
    });

    // 2s Edit Interval
    const interval = setInterval(async () => {
        if (!buffer.hasChanged()) return;

        const content = buffer.getContent();
        buffer.markSent();

        try {
            await message.edit({ content });
        } catch (err) {
            // Handle rate limit or unknown message errors gracefully.
            // Don't stop the session — just skip this edit cycle.
            logsLogger.warn(`[session] message edit failed: ${err.message}`);
        }
    }, EDIT_INTERVAL_MS);

    // 60s Auto-Stop Timeout
    const timeout = setTimeout(() => {
        stopSession(channelId, "Session timed out after 60 seconds.");
    }, SESSION_TIMEOUT_MS);

    // Register session
    activeSessions.set(channelId, {
        kill,
        interval,
        message,
        timeout,
        buffer,
    });

    logsLogger.info(`Live log session started in channel ${channelId}.`);
    return { success: true };
}

/**
 * Stops an active log session and cleans up all resources.
 *
 * @param {string} channelId
 * @param {string} [reason="Session ended."]
 */
async function stopSession(channelId, reason = "Session ended.") {
    const session = activeSessions.get(channelId);
    if (!session) return;

    // Kill child process first to stop new data flowing in.
    session.kill();
    clearInterval(session.interval);
    clearTimeout(session.timeout);
    activeSessions.delete(channelId);

    logsLogger.info(`Live log session stopped in channel ${channelId}: ${reason}`);

    // Update the Discord message with a final notice.
    try {
        const finalContent = session.buffer.getContent().replace(/```$/, "") +
            `\n--- [${reason}] ---\n` + "```";
        await session.message.edit({ content: finalContent });
    } catch (err) {
        logsLogger.warn(`[session] final message edit failed: ${err.message}`);
    }
}

module.exports = { hasActiveSession, startSession, stopSession };
