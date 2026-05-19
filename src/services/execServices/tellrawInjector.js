//  tellrawInjector.js  -  In-game command visibility for /exec - v1.3.0
//
//  Sends a tellraw message to all online players (or a configured
//  target) before executing the actual command, so players see who
//  executed what from Discord.
//
//  Configurable via .env

"use strict";

const { createLogger } = require("../logger");
const { getEnvBool, getEnvString } = require("../../utils/env");

const execLogger = createLogger("Exec");

// Configuration

const TELLRAW_ENABLED = getEnvBool("EXEC_TELLRAW_ENABLED", true);
const TELLRAW_TARGET = getEnvString("EXEC_TELLRAW_TARGET", "@a");
const TELLRAW_COLOR = getEnvString("EXEC_TELLRAW_COLOR", "gold");
const TELLRAW_PREFIX = getEnvString("EXEC_TELLRAW_PREFIX", "[DISCORD]");

/** Commands that should never produce a tellraw announcement. */
const SILENT_COMMANDS = getEnvString("EXEC_SILENT_COMMANDS", "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

/**
 * Checks if a command is in the auto-silent list (e.g. login, register).
 *
 * @param {string} command - Full command string.
 * @returns {boolean}
 */
function isAutoSilent(command) {
    const base = command.trim().split(/\s+/)[0].toLowerCase();
    return SILENT_COMMANDS.includes(base);
}

/**
 * Builds the tellraw command string for a given user and command.
 *
 * @param {string} username  - Discord username.
 * @param {string} command   - The Minecraft command being executed.
 * @returns {string} The full tellraw command to send via RCON.
 */
function buildTellraw(username, command) {
    const json = JSON.stringify({
        text: `${TELLRAW_PREFIX} ${username} executed: ${command}`,
        color: TELLRAW_COLOR,
    });
    return `tellraw ${TELLRAW_TARGET} ${json}`;
}

/**
 * Injects a tellraw message before command execution if conditions are met.
 *
 * @param {Object} options
 * @param {string} options.username  - Discord username.
 * @param {string} options.command   - The Minecraft command.
 * @param {boolean} options.silent   - Whether silent mode was requested.
 * @param {Function} options.sendFn  - Function to send RCON commands (rconSend or rconManager.sendCommand).
 * @returns {Promise<void>}
 */
async function injectTellraw({ username, command, silent, sendFn }) {
    // Skip if tellraw is globally disabled.
    if (!TELLRAW_ENABLED) return;

    // Skip if the user explicitly requested silent mode.
    if (silent) {
        execLogger.debug(`Tellraw skipped (silent mode): ${command}`);
        return;
    }

    // Skip if the command is in the auto-silent list.
    if (isAutoSilent(command)) {
        execLogger.debug(`Tellraw skipped (auto-silent command): ${command}`);
        return;
    }

    try {
        const tellrawCmd = buildTellraw(username, command);
        await sendFn(tellrawCmd);
        execLogger.debug(`Tellraw injected: ${tellrawCmd}`);
    } catch (err) {
        // Tellraw failure should not block command execution.
        execLogger.warn(`Tellraw injection failed: ${err.message}`);
    }
}

module.exports = { injectTellraw, buildTellraw, isAutoSilent, TELLRAW_ENABLED };
