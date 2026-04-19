// Thin RCON helpers used by slash commands and save-all (backed by persistent RconManager).

const { createLogger } = require("./logger");
const minecraftLogger = createLogger("Minecraft");

/** @type {import("./rconmanager").RconManager|null} */
let rconManager = null;

/**
 * @param {import("./rconmanager").RconManager|null} manager
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
 * @returns {Promise<string|null>}
 */
async function getTps() {
    const res = await rconSend("tps");
    return res ? res.replace(/§./g, "").trim() : null;
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
