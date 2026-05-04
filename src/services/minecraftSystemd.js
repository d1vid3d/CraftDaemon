// systemd + save-all orchestration for the Minecraft service.
// This module provides functions to check the Minecraft service status, start, stop, and restart the server connected to systemd.

const { exec } = require("child_process");
const { promisify } = require("util");
const { createLogger } = require("./logger");
const { rconSend } = require("./rconQuery");

const execAsync = promisify(exec);
const minecraftLogger = createLogger("Minecraft");

function getEnvInt(name, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === "") return fallback;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

const MC_SERVICE = process.env.MC_SERVICE || "minecraft";
const SAVEALL_DELAY_MS = getEnvInt("SAVEALL_DELAY_MS", 1_000, { min: 0, max: 30_000 });

async function getServiceState() {
    try {
        const { stdout } = await execAsync(
            `systemctl is-active ${MC_SERVICE}`
        );
        return stdout.trim();
    } catch (err) {
        return (err.stdout || "unknown").trim();
    }
}

async function isServerRunning() {
    return (await getServiceState()) === "active";
}

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
    }
}

async function startServer() {
    await execAsync(`sudo systemctl start ${MC_SERVICE}`);
}

async function stopServer() {
    await saveAll();
    await new Promise((resolve) => setTimeout(resolve, SAVEALL_DELAY_MS));
    await execAsync(`sudo systemctl stop ${MC_SERVICE}`);
}

async function restartServer() {
    await saveAll();
    await new Promise((resolve) => setTimeout(resolve, SAVEALL_DELAY_MS));
    await execAsync(`sudo systemctl restart ${MC_SERVICE}`);
}

async function getServiceUptime() {
    try {
        const { stdout } = await execAsync(
            `sudo systemctl show ${MC_SERVICE} --property=ActiveEnterTimestamp`
        );
        const value = stdout.replace("ActiveEnterTimestamp=", "").trim();
        if (!value) return "N/A";

        const startDate = new Date(value);
        if (isNaN(startDate.getTime())) return "N/A";

        const totalSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
        if (totalSeconds < 0) return "N/A";

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours}h ${minutes}m ${seconds}s`;
    } catch {
        return "N/A";
    }
}

module.exports = {
    getServiceState,
    isServerRunning,
    startServer,
    stopServer,
    restartServer,
    getServiceUptime,
};
