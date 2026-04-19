// Global lock for state-changing slash commands (start / stop / restart).

function getEnvInt(name, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === "") return fallback;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

const COMMAND_COOLDOWN_MS = getEnvInt("COMMAND_COOLDOWN_MS", 10_000, { min: 2_000, max: 60_000 });

let commandLock = false;
let commandLockTimeout = null;
let lastCommand = "";

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {string} commandName
 * @returns {Promise<boolean>} true if already locked (caller should return)
 */
async function acquireLock(interaction, commandName) {
    if (commandLock) {
        await interaction.reply({
            embeds: [{
                title: "⏳ Command Busy",
                description: `Previous \`${lastCommand}\` command is still processing. Please wait...`,
                color: 0xffcc00,
            }],
            ephemeral: true,
        });
        return true;
    }

    commandLock = true;
    lastCommand = commandName;

    commandLockTimeout = setTimeout(() => {
        commandLock = false;
        commandLockTimeout = null;
    }, COMMAND_COOLDOWN_MS);

    return false;
}

function releaseLock() {
    if (commandLockTimeout) {
        clearTimeout(commandLockTimeout);
        commandLockTimeout = null;
    }
    commandLock = false;
    lastCommand = "";
}

module.exports = { acquireLock, releaseLock };
