// Utility functions for reading/writing JSON state files, specifically for tracking the last notified version per guild.
// This is used by the update notification system to avoid spamming guilds with the same update message.

const fs = require("fs");
const path = require("path");

const DEFAULT_STATE = () => ({ guilds: {} });

/**
 * @param {string} filePath Absolute or project-relative JSON file path
 * @returns {{ guilds: Record<string, { lastNotifiedVersion: string }> }}
 */
function readState(filePath) {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object") return DEFAULT_STATE();
        if (!data.guilds || typeof data.guilds !== "object") {
            return { ...DEFAULT_STATE(), ...data, guilds: {} };
        }
        return data;
    } catch {
        return DEFAULT_STATE();
    }
}

function writeState(filePath, state) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/**
 * @param {string} filePath
 * @param {string} guildId
 * @returns {string|null}
 */
function getLastNotifiedVersion(filePath, guildId) {
    const state = readState(filePath);
    const entry = state.guilds[guildId];
    if (!entry || typeof entry.lastNotifiedVersion !== "string") return null;
    return entry.lastNotifiedVersion;
}

/**
 * @param {string} filePath
 * @param {string} guildId
 * @param {string} version
 */
function setLastNotifiedVersion(filePath, guildId, version) {
    const state = readState(filePath);
    if (!state.guilds[guildId]) state.guilds[guildId] = {};
    state.guilds[guildId].lastNotifiedVersion = version;
    writeState(filePath, state);
}

module.exports = {
    readState,
    writeState,
    getLastNotifiedVersion,
    setLastNotifiedVersion,
};
