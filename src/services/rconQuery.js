// Thin RCON helpers used by slash commands and save-all (backed by persistent RconManager).

const { createLogger } = require("./logger");
const minecraftLogger = createLogger("Minecraft");

/** @type {import("./rconManager").RconManager|null} */
let rconManager = null;

/**
 * @param {import("./rconManager").RconManager|null} manager
 */
function setRconManager(manager) {
    rconManager = manager;
}

/**
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
 * @param {string|undefined} serverType - Server type from SERVER_TYPE env var
 * @returns {Promise<string|null>}
 */
async function getTps(serverType) {
    // Normalize server type to uppercase and trim whitespace
    const normalizedType = (serverType || "").toUpperCase().trim();

    // Only query /tps command for PAPER servers
    if (normalizedType === "PAPER") {
        const res = await rconSend("tps");
        return res ? res.replace(/§./g, "").trim() : null;
    }

    // For any other value, return null (RCON not queried)
    return null;
}

/**
 * @returns {Promise<string|null>}
 */
async function getPlayerList() {
    return rconSend("list");
}

/**
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

module.exports = {
    setRconManager,
    rconSend,
    getTps,
    getPlayerList,
    getPlayerListWithPing,
};
