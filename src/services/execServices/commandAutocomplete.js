//  commandAutocomplete.js - Early Minecraft command autocomplete
//  Static list of common Minecraft commands for Discord slash
//  command autocomplete. Version-pinned to 1.21.x.
//
//  Future improvement: dynamically fetch via RCON `help` command.

"use strict";

// Static Minecraft command list (1.21.x)
// Only base commands - no argument-level autocomplete in v1.3.0.

const MINECRAFT_COMMANDS = [
    "advancement",
    "attribute",
    "ban",
    "ban-ip",
    "banlist",
    "bossbar",
    "clear",
    "clone",
    "damage",
    "data",
    "datapack",
    "debug",
    "defaultgamemode",
    "deop",
    "difficulty",
    "effect",
    "enchant",
    "execute",
    "experience",
    "fill",
    "fillbiome",
    "forceload",
    "function",
    "gamemode",
    "gamerule",
    "give",
    "help",
    "item",
    "jfr",
    "kick",
    "kill",
    "list",
    "locate",
    "loot",
    "me",
    "msg",
    "op",
    "pardon",
    "pardon-ip",
    "particle",
    "perf",
    "place",
    "playsound",
    "publish",
    "random",
    "recipe",
    "reload",
    "return",
    "ride",
    "say",
    "schedule",
    "scoreboard",
    "seed",
    "setblock",
    "setidletimeout",
    "setworldspawn",
    "spawnpoint",
    "spectate",
    "spreadplayers",
    "stop",
    "stopsound",
    "summon",
    "tag",
    "team",
    "teammsg",
    "teleport",
    "tell",
    "tellraw",
    "tick",
    "time",
    "title",
    "tm",
    "tp",
    "transfer",
    "trigger",
    "w",
    "weather",
    "whitelist",
    "worldborder",
    "xp",
];

/**
 * Filters commands based on the user's current input.
 * Returns up to 25 results (Discord autocomplete limit).
 *
 * @param {string} focusedValue - The user's current typed input.
 * @returns {Array<{name: string, value: string}>}
 */
function getAutocompleteResults(focusedValue) {
    const query = focusedValue.toLowerCase().trim();

    if (!query) {
        // Return first 25 commands if no input yet.
        return MINECRAFT_COMMANDS.slice(0, 25).map((cmd) => ({
            name: cmd,
            value: cmd,
        }));
    }

    return MINECRAFT_COMMANDS
        .filter((cmd) => cmd.startsWith(query))
        .slice(0, 25)
        .map((cmd) => ({ name: cmd, value: cmd }));
}

module.exports = { getAutocompleteResults, MINECRAFT_COMMANDS };
