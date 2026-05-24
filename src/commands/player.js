const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { createLogger } = require("../services/logger");
const { getRconManager } = require("../services/rconQuery");
const { hasPermission } = require("../permissions/resolver");
const { getAllPlayers, getPlayer } = require("../utils/playerStore");
const permissionConfig = require("../../config/permission-config");

const playerLogger = createLogger("Player");

const GAMEMODES = {
    0: "Survival",
    1: "Creative",
    2: "Adventure",
    3: "Spectator",
};

module.exports = {
    permission: null,
    data: new SlashCommandBuilder()
        .setName("player")
        .setDescription("Player management and information")
        .addStringOption((option) =>
            option
                .setName("lookup")
                .setDescription("Look up a known player by exact name")
                .setRequired(false)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        if (!hasPermission(interaction, "player.lookup", permissionConfig)) {
            await interaction.respond([]).catch(() => {});
            return;
        }

        const focused = interaction.options.getFocused().toLowerCase();
        const choices = Object.entries(getAllPlayers())
            .filter(([name]) => name.toLowerCase().includes(focused))
            .sort(([, a], [, b]) => {
                if (!!a.online !== !!b.online) return a.online ? -1 : 1;
                return getTimestamp(b.lastSeen) - getTimestamp(a.lastSeen);
            })
            .slice(0, 25)
            .map(([name, data]) => ({
                name: `${data.online ? "🟢" : "⚫"} ${name}`,
                value: name,
            }));

        await interaction.respond(choices).catch(() => {});
    },

    async execute(interaction) {
        const lookup = interaction.options.getString("lookup");

        if (lookup) {
            if (!(await ensurePermission(interaction, "player.lookup"))) {
                return;
            }

            playerLogger.info(`/player lookup:${lookup} from ${interaction.user.tag}`);
            await interaction.deferReply();
            return handleLookup(interaction, lookup);
        }

        if (!(await ensurePermission(interaction, "player.list"))) {
            return;
        }

        playerLogger.info(`/player from ${interaction.user.tag}`);
        return interaction.reply({ embeds: [buildListEmbed()] });
    },
};

async function handleLookup(interaction, name) {
    const record = getPlayer(name);

    if (!record) {
        return interaction.editReply({
            embeds: [{
                title: "👤 Player Lookup",
                description: "No record found for that player name. Names are case-sensitive.",
                color: 0xffcc00,
            }],
        });
    }

    if (!record.online) {
        return interaction.editReply({
            embeds: [buildStoredDetailEmbed(name, record, "Live data is unavailable for offline players.")],
        });
    }

    const rconManager = getRconManager();
    if (!rconManager?.connected) {
        return interaction.editReply({
            embeds: [buildStoredDetailEmbed(name, record, "RCON is unavailable. Cannot fetch live player data.")],
        });
    }

    try {
        const liveData = await fetchLivePlayerData(rconManager, name);
        return interaction.editReply({ embeds: [buildLiveDetailEmbed(name, record, liveData)] });
    } catch (err) {
        playerLogger.warn(`Live lookup failed for ${name}: ${err.message}`);
        return interaction.editReply({
            embeds: [buildStoredDetailEmbed(name, record, "Could not fetch live data. Server may be restarting.")],
        });
    }
}

async function ensurePermission(interaction, permission) {
    if (hasPermission(interaction, permission, permissionConfig)) {
        return true;
    }

    await interaction.reply({
        embeds: [{
            title: "🔒 Permission Denied",
            description: "You do not have permission to use this command.",
            color: 0xff0000,
        }],
        flags: MessageFlags.Ephemeral,
    });

    return false;
}

function buildListEmbed() {
    const players = Object.entries(getAllPlayers())
        .sort(([, a], [, b]) => {
            if (!!a.online !== !!b.online) return a.online ? -1 : 1;
            return getTimestamp(b.lastSeen) - getTimestamp(a.lastSeen);
        });

    if (!players.length) {
        return {
            title: "👥 Player List",
            description: "No player data yet. Data is collected as players join the server.",
            color: 0xffcc00,
        };
    }

    const onlineCount = players.filter(([, data]) => data.online).length;
    const allLines = players.map(([name, data]) => (
        data.online
            ? `🟢 **${name}** - Online now`
            : `⚫ **${name}** - Last seen ${formatLastSeen(data.lastSeen)}`
    ));
    const lines = [];
    let hiddenCount = 0;

    for (const line of allLines) {
        const nextDescription = [...lines, line].join("\n");
        if (nextDescription.length > 3800) {
            hiddenCount += 1;
            continue;
        }
        lines.push(line);
    }

    if (hiddenCount > 0) {
        lines.push(`...and ${hiddenCount} more player${hiddenCount === 1 ? "" : "s"}.`);
    }

    return {
        title: "👥 Player List",
        description: lines.join("\n"),
        color: onlineCount > 0 ? 0x00ff66 : 0x5865f2,
        footer: {
            text: `${onlineCount} online • ${players.length} known`,
        },
    };
}

function buildLiveDetailEmbed(name, record, liveData) {
    return {
        title: `👤 ${name}`,
        color: 0x00ff66,
        fields: [
            { name: "Status", value: "🟢 Online", inline: true },
            { name: "Game Mode", value: liveData.gamemode || "Unknown", inline: true },
            { name: "XP Level", value: liveData.xp !== null ? `✨ ${liveData.xp}` : "Unknown", inline: true },
            {
                name: "Position",
                value: liveData.x !== null
                    ? `X: ${liveData.x}  Y: ${liveData.y}  Z: ${liveData.z}`
                    : "Unknown",
                inline: false,
            },
            {
                name: "Health",
                value: liveData.health !== null ? `❤️ ${liveData.health.toFixed(1)} / 20` : "Unknown",
                inline: true,
            },
            {
                name: "Food",
                value: liveData.food !== null ? `🍗 ${liveData.food} / 20` : "Unknown",
                inline: true,
            },
            { name: "First seen", value: formatDate(record.firstSeen), inline: true },
            { name: "Last seen", value: "Now", inline: true },
        ],
    };
}

function buildStoredDetailEmbed(name, record, warning) {
    return {
        title: `👤 ${name}`,
        color: record.online ? 0xffa500 : 0x5865f2,
        description: warning,
        fields: [
            {
                name: "Status",
                value: record.online ? "🟢 Online" : "⚫ Offline",
                inline: true,
            },
            { name: "First seen", value: formatDate(record.firstSeen), inline: true },
            {
                name: "Last seen",
                value: formatLastSeen(record.lastSeen),
                inline: true,
            },
        ],
    };
}

async function fetchLivePlayerData(rconManager, name) {
    const posRaw = await tryFetchField(rconManager, name, "Pos");
    const healthRaw = await tryFetchField(rconManager, name, "Health");
    const foodRaw = await tryFetchField(rconManager, name, "foodLevel");
    const xpRaw = await tryFetchField(rconManager, name, "XpLevel");
    const gamemodeRaw = await tryFetchField(rconManager, name, "playerGameType");

    return {
        ...parsePositionResponse(posRaw),
        health: parseFloatResponse(healthRaw),
        food: parseIntegerResponse(foodRaw),
        xp: parseIntegerResponse(xpRaw),
        gamemode: parseGamemodeResponse(gamemodeRaw),
    };
}

async function tryFetchField(rconManager, playerName, fieldName) {
    try {
        return await rconManager.sendCommand(`data get entity ${playerName} ${fieldName}`);
    } catch (err) {
        playerLogger.warn(`Live lookup field failed for ${playerName}.${fieldName}: ${err.message}`);
        return null;
    }
}

function parsePositionResponse(raw) {
    const match = typeof raw === "string"
        ? raw.match(/\[\s*(-?[\d.]+)d\s*,\s*(-?[\d.]+)d\s*,\s*(-?[\d.]+)d\s*\]/i)
        : null;

    return {
        x: match ? Math.floor(parseFloat(match[1])) : null,
        y: match ? Math.floor(parseFloat(match[2])) : null,
        z: match ? Math.floor(parseFloat(match[3])) : null,
    };
}

function parseFloatResponse(raw) {
    const match = typeof raw === "string"
        ? raw.match(/(-?[\d.]+)(?:[dDfF])?\s*$/)
        : null;

    return match ? parseFloat(match[1]) : null;
}

function parseIntegerResponse(raw) {
    const match = typeof raw === "string"
        ? raw.match(/(-?\d+)(?:[bBsSlL])?\s*$/)
        : null;

    return match ? parseInt(match[1], 10) : null;
}

function parseGamemodeResponse(raw) {
    const value = parseIntegerResponse(raw);
    return value !== null ? GAMEMODES[value] ?? "Unknown" : null;
}

function formatLastSeen(isoString) {
    const timestamp = getTimestamp(isoString);
    if (!timestamp) return "Unknown";

    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function formatDate(isoString) {
    const timestamp = getTimestamp(isoString);
    if (!timestamp) return "Unknown";

    return new Date(timestamp).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

function getTimestamp(isoString) {
    const timestamp = new Date(isoString).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}
