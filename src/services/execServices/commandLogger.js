//  commandLogger.js, JSONL execution logger for /exec - v1.3.0
//  Appends one JSON object per line to the exec log file.
//  Format: JSON Lines (.jsonl) — append-only, no full-file rewrites.

"use strict";

const fs = require("fs");
const path = require("path");
const { createLogger } = require("../logger");

const execLogger = createLogger("Exec");

const EXEC_LOG_PATH = process.env.EXEC_LOG_PATH || "./logs/exec.jsonl";

/**
 * Ensures the log directory exists.
 * Called once lazily on first write.
 *
 * @private
 */
let _dirEnsured = false;
function ensureDir() {
    if (_dirEnsured) return;
    const dir = path.dirname(path.resolve(EXEC_LOG_PATH));
    fs.mkdirSync(dir, { recursive: true });
    _dirEnsured = true;
}

/**
 * Logs an /exec command execution to the JSONL log file.
 *
 * @param {Object} entry
 * @param {string} entry.userId           - Discord user ID.
 * @param {string} entry.username         - Discord username / tag.
 * @param {string} entry.command          - The Minecraft command that was executed.
 * @param {boolean} entry.success         - Whether RCON execution succeeded.
 * @param {boolean} [entry.requiresConfirmation=false] - Whether a confirmation prompt was shown.
 * @param {boolean} [entry.silent=false]  - Whether silent mode was used.
 */
function logExecution(entry) {
    try {
        ensureDir();

        const record = {
            timestamp: Math.floor(Date.now() / 1000),
            userId: entry.userId,
            username: entry.username,
            command: entry.command,
            success: entry.success,
            requiresConfirmation: entry.requiresConfirmation || false,
            silent: entry.silent || false,
        };

        const line = JSON.stringify(record) + "\n";
        fs.appendFileSync(path.resolve(EXEC_LOG_PATH), line, "utf8");

        execLogger.debug(`Logged exec: ${entry.username} -> ${entry.command} (success: ${entry.success})`);
    } catch (err) {
        // Logging should never crash the bot, warn and move on.
        execLogger.error(`Failed to write exec log: ${err.message}`);
    }
}

module.exports = { logExecution, EXEC_LOG_PATH };
