//  Block dangerous commands, command checker for /exec - v1.3.0
//  Checks commands against the two safety lists defined in
//  permission-config.js (exec section):
//    - blockedCommands  → hard block, no one can run
//    - dangerousCommands → requires confirmation before running


"use strict";

const permissionConfig = require("../../../config/permission-config");

/**
 * Extracts the base command from a full command string.
 * For multi-word dangerous entries (e.g. "whitelist off"), also checks
 * the full prefix against the list.
 *
 * @param {string} fullCommand - e.g. "time set day"
 * @returns {string} - e.g. "time"
 */
function getBaseCommand(fullCommand) {
    return fullCommand.trim().split(/\s+/)[0].toLowerCase();
}

/**
 * Checks if a command is blocked (hard block, cannot be executed at all).
 *
 * @param {string} command - The full Minecraft command string.
 * @returns {boolean}
 */
function isBlocked(command) {
    const base = getBaseCommand(command);
    const lower = command.trim().toLowerCase();

    return permissionConfig.exec.blockedCommands.some((blocked) => {
        const b = blocked.toLowerCase();
        return base === b || lower === b || lower.startsWith(b + " ");
    });
}

/**
 * Checks if a command is dangerous (requires confirmation).
 *
 * @param {string} command - The full Minecraft command string.
 * @returns {boolean}
 */
function isDangerous(command) {
    const base = getBaseCommand(command);
    const lower = command.trim().toLowerCase();

    return permissionConfig.exec.dangerousCommands.some((dangerous) => {
        const d = dangerous.toLowerCase();
        return base === d || lower === d || lower.startsWith(d + " ");
    });
}

module.exports = { isBlocked, isDangerous, getBaseCommand };
