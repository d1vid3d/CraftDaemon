//  /help command  -  Command reference & quick start guide - v1.4.0
//  Public command, no permission required.
//  Uses a StringSelectMenu to switch between pages.
//  Supports /help commands:<name> for detailed command info.

"use strict";

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    MessageFlags,
} = require("discord.js");
const { createLogger } = require("../services/logger");

const helpLogger = createLogger("Help");

const SELECT_TIMEOUT_MS = 120_000; // 2 minutes

// ── Category overview (used by the "Commands Reference" page) ──────────

const COMMAND_CATEGORIES = [
    {
        name: "Server Control",
        emoji: "\u{1F3AE}",
        commands: [
            { name: "/start", desc: "Start the Minecraft server", perm: "server.start" },
            { name: "/stop", desc: "Stop the Minecraft server", perm: "server.stop" },
            { name: "/restart", desc: "Restart the Minecraft server", perm: "server.restart" },
            { name: "/status", desc: "Get server status, TPS, and player info", perm: "server.status" },
        ],
    },
    {
        name: "Admin & Tools",
        emoji: "\u{1F6E0}\uFE0F",
        commands: [
            { name: "/exec", desc: "Execute Minecraft console commands via RCON", perm: "admin.exec" },
            { name: "/logs", desc: "View live or tail server logs", perm: "admin.logs" },
            { name: "/checkupdate", desc: "Check for bot updates", perm: "bot.checkUpdate" },
        ],
    },
    {
        name: "Information",
        emoji: "\u2139\uFE0F",
        commands: [
            { name: "/address", desc: "Get the server IP address", perm: "server.address" },
            { name: "/ping", desc: "Check bot latency", perm: null },
            { name: "/help", desc: "Show this help menu", perm: null },
        ],
    },
];

// ── Detailed help entries (for /help commands:<name>) ─────────────────

const COMMAND_DETAILS = {
    start: {
        name: "/start",
        shortDesc: "Start the Minecraft server",
        permission: "server.start",
        usage: "`/start`",
        details: "Boots the Minecraft server via systemd. Shows real-time status updates while the server starts.\n\nIf the server is already running or currently starting, the command will let you know instead of attempting a duplicate start.",
        examples: [
            "/start",
        ],
        notes: "Acquires a command lock that prevents concurrent start/stop/restart operations. Estimated startup time is ~30 seconds. Use `/status` to monitor progress after starting.",
    },
    stop: {
        name: "/stop",
        shortDesc: "Stop the Minecraft server",
        permission: "server.stop",
        usage: "`/stop`",
        details: "Sends a `save-all` command to save all worlds, then gracefully stops the server via systemd.\n\nIf the server is not running, the command will report it as already offline.",
        examples: [
            "/stop",
        ],
        notes: "Requires an active server. Acquires a command lock to prevent concurrent start/stop/restart operations.",
    },
    restart: {
        name: "/restart",
        shortDesc: "Restart the Minecraft server",
        permission: "server.restart",
        usage: "`/restart`",
        details: "Performs a full save → stop → start cycle. Saves all worlds with `save-all`, gracefully stops the server, then boots it back up.\n\nIf the server is not running, the command will suggest using `/start` instead.",
        examples: [
            "/restart",
        ],
        notes: "Requires an active server. Estimated cycle time is ~30 seconds. Acquires a command lock to prevent concurrent start/stop/restart operations.",
    },
    status: {
        name: "/status",
        shortDesc: "Get server status, TPS, and player info",
        permission: "server.status",
        usage: "`/status`",
        details: "Checks the systemd service state and — if the server is running — queries **TPS** (ticks per second), **player list**, and **RCON round-trip time** via the RCON connection.\n\nIf the server is offline, the raw systemd state is reported. If the server is still starting up, RCON may not be ready yet.",
        examples: [
            "/status",
        ],
        notes: "The `SERVER_TYPE` environment variable must be set to `paper` for accurate TPS display. If unset or invalid, TPS will show as \"Not Set\" or \"Not Supported\".",
    },
    exec: {
        name: "/exec",
        shortDesc: "Execute Minecraft console commands via RCON",
        permission: "admin.exec",
        usage: "`/exec <command> [silent]`",
        details: "Sends a Minecraft console command to the server over RCON.\n\n**Command safety checks** (in order):\n1. **Permission check** — the executor's role must be in the exec allowlist (`permission-config.js`).\n2. **Blocked commands** — certain commands are completely prevented (e.g. `stop`, `op`, etc.).\n3. **Dangerous commands** — commands like `kick`, `ban`, `whitelist` require clicking a confirmation button before execution.\n4. **Silent mode** — if `silent` is `true`, the in-game tellraw announcement is suppressed (Admin/Owner only).\n\nThe `command` field supports **autocomplete** — start typing a Minecraft command and the bot will suggest completions.",
        examples: [
            "/exec command: list",
            "/exec command: time set day",
            "/exec command: ban Steve silent: true",
        ],
        notes: "The command string is required and must not be empty. Silent mode requires one of the `silentRoles` configured in `permission-config.js`. All executed commands are logged to a JSONL file for auditing.",
    },
    logs: {
        name: "/logs",
        shortDesc: "View live or tail server logs",
        permission: "admin.logs",
        usage: "`/logs live` | `/logs tail [lines]` | `/logs stop`",
        details: "Three subcommands for accessing Minecraft server logs:\n\n**`/logs live`** — Starts a real-time log stream. The bot sends a message and edits it every 2 seconds with fresh log output. Only one live session per channel is allowed.\n\n**`/logs tail [lines]`** — Fetches the last N lines as a static snapshot in a code block. Defaults to 20 lines if not specified, maximum is 25.\n\n**`/logs stop`** — Stops the active live log session in the current channel.",
        examples: [
            "/logs live",
            "/logs tail",
            "/logs tail lines: 10",
            "/logs stop",
        ],
        notes: "Only one live session per channel at a time. Sessions auto-stop after a configured timeout (`SESSION_TIMEOUT_MS`). The log source (journald or file) is displayed in the footer.",
    },
    address: {
        name: "/address",
        shortDesc: "Get the server IP address",
        permission: "server.address",
        usage: "`/address`",
        details: "Displays the main server address, Java Edition version, and local LAN address as configured in the bot's `.env` file. Share these with friends so they can join the server.",
        examples: [
            "/address",
        ],
        notes: "The `MAIN_ADDRESS` environment variable must be set in `.env` for this command to work. If not configured, a warning will be shown.",
    },
    ping: {
        name: "/ping",
        shortDesc: "Check bot latency",
        permission: "Public (no permission required)",
        usage: "`/ping`",
        details: "Measures the round-trip latency between Discord and the bot. It sends a message, records the timestamp, and calculates the difference.\n\nThis is useful for diagnosing whether the bot is responsive.",
        examples: [
            "/ping",
        ],
        notes: "Public command - anyone can use it. The displayed latency is the Discord API round-trip time, not the Minecraft server ping.",
    },
    checkupdate: {
        name: "/checkupdate",
        shortDesc: "Check for bot updates",
        permission: "bot.checkUpdate",
        usage: "`/checkupdate`",
        details: "Polls the CraftDaemon GitHub releases page and compares the latest published version against the currently installed version (from `package.json`).\n\nIf a newer release exists, the bot will provide a summary and can notify an update channel.",
        examples: [
            "/checkupdate",
        ],
        notes: "The reply is ephemeral (only you can see it). Update notifications can also be sent automatically to a configured channel.",
    },
    help: {
        name: "/help",
        shortDesc: "Show command reference and quick start guide",
        permission: "Public (no permission required)",
        usage: "`/help` | `/help command: <name>`",
        details: "The main help system for CraftDaemon.\n\n- Use **`/help`** by itself to see the full commands reference table and a quick start guide, switchable via the dropdown menu.\n- Use **`/help command: <name>`** to get detailed information about a specific command, including its syntax, usage examples, permission requirements, and notes.",
        examples: [
            "/help",
            "/help command: logs",
            "/help command: exec",
        ],
        notes: "Public command - anyone can use it. The dropdown menu expires after 2 minutes of inactivity.",
    },
};

// ── Embed Builders ────────────────────────────────────────────────────

function buildCommandsEmbed() {
    const fields = COMMAND_CATEGORIES.map((cat) => {
        const lines = cat.commands.map((cmd) => {
            const lock = cmd.perm ? " \u{1F512}" : "";
            return `\`${cmd.name}\`${lock} \u2014 ${cmd.desc}`;
        });
        return {
            name: `${cat.emoji}  ${cat.name}`,
            value: lines.join("\n"),
            inline: false,
        };
    });

    return {
        title: "\u{1F4D6} CraftDaemon - Commands Reference",
        description: "All available bot commands grouped by category.\nCommands marked with \u{1F512} require specific permissions.\nUse `/help command:<name>` for detailed info on any command.",
        fields,
        color: 0x5865f2,
        footer: { text: "Use the menu below to switch pages \u2022 Expires in 2 min" },
        timestamp: new Date().toISOString(),
    };
}

function buildQuickStartEmbed() {
    return {
        title: "\u{1F680} CraftDaemon \u2014 Quick Start Guide",
        description: "Get up and running with your Minecraft server in seconds.",
        fields: [
            {
                name: "1\uFE0F\u20E3  Starting the Server",
                value: "Use `/start` to boot the Minecraft server.\nThe bot will show real-time status updates as the server starts up.",
                inline: false,
            },
            {
                name: "2\uFE0F\u20E3  Checking Status",
                value: "Use `/status` to see if the server is online, current TPS, and who's playing.",
                inline: false,
            },
            {
                name: "3\uFE0F\u20E3  Sharing the Address",
                value: "Use `/address` to get the server IP \u2014 share it with friends to let them join!",
                inline: false,
            },
            {
                name: "4\uFE0F\u20E3  Viewing Logs",
                value: [
                    "`/logs live` \u2014 Stream server logs in real-time",
                    "`/logs tail` \u2014 Fetch the last N log lines as a snapshot",
                    "`/logs stop` \u2014 Stop an active log stream in the channel",
                ].join("\n"),
                inline: false,
            },
            {
                name: "5\uFE0F\u20E3  Remote Commands",
                value: "Use `/exec <command>` to run Minecraft console commands via RCON.\nDangerous commands will ask for confirmation first.",
                inline: false,
            },
            {
                name: "6\uFE0F\u20E3  Stopping / Restarting",
                value: "`/stop` gracefully saves and shuts down the server.\n`/restart` performs a full save \u2192 stop \u2192 start cycle.",
                inline: false,
            },
            {
                name: "\u{1F4A1} Tips",
                value: [
                    "\u2022 The bot auto-stops the server after a configurable idle period.",
                    "\u2022 Use `/checkupdate` to see if a new bot version is available.",
                    "\u2022 Permissions are managed by server admins in `permission-config.js`.",
                ].join("\n"),
                inline: false,
            },
        ],
        color: 0x00ff66,
        footer: { text: "Use the menu below to switch pages \u2022 Expires in 2 min" },
        timestamp: new Date().toISOString(),
    };
}

/**
 * Builds a detailed help embed for a specific command.
 * @param {string} commandKey - Key into COMMAND_DETAILS.
 * @returns {Object} Discord embed object.
 */
function buildCommandDetailEmbed(commandKey) {
    const cmd = COMMAND_DETAILS[commandKey];
    if (!cmd) {
        return {
            title: "\u2753 Unknown Command",
            description: `No details available for \`${commandKey}\`. Use \`/help commands\` to see all available commands.`,
            color: 0xffcc00,
        };
    }

    const fields = [
        { name: "Description", value: cmd.shortDesc, inline: false },
        { name: "Usage", value: cmd.usage, inline: false },
        { name: "Details", value: cmd.details, inline: false },
        { name: "Examples", value: cmd.examples.map((e) => `\u2022 \`${e}\``).join("\n"), inline: false },
        { name: "Required Permission", value: `\`${cmd.permission}\``, inline: true },
    ];

    if (cmd.notes) {
        fields.push({ name: "Notes", value: cmd.notes, inline: false });
    }

    return {
        title: `\u{1F4D6} Help: ${cmd.name}`,
        fields,
        color: 0x5865f2,
        footer: { text: "Use /help without options for the full command reference" },
        timestamp: new Date().toISOString(),
    };
}

// ── Select Menu ───────────────────────────────────────────────────────

function buildSelectRow(activeValue) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("help_page_select")
        .setPlaceholder("Select a page\u2026")
        .addOptions([
            {
                label: "Commands Reference",
                description: "View all commands grouped by category",
                value: "commands",
                emoji: "\u{1F4D6}",
                default: activeValue === "commands",
            },
            {
                label: "Quick Start Guide",
                description: "Get started with CraftDaemon",
                value: "quickstart",
                emoji: "\u{1F680}",
                default: activeValue === "quickstart",
            },
        ]);
    return new ActionRowBuilder().addComponents(menu);
}

// ── Command Definition ────────────────────────────────────────────────

module.exports = {
    permission: null,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show command reference and quick start guide")
        .addStringOption((option) =>
            option
                .setName("command")
                .setDescription("Get detailed info about a specific command (e.g. logs, exec)")
                .setRequired(false)
                .setAutocomplete(true)
        ),

    /**
     * Autocomplete handler for the `command` option.
     * @param {import("discord.js").AutocompleteInteraction} interaction
     */
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = Object.keys(COMMAND_DETAILS);
        const filtered = focused
            ? choices.filter((key) => key.includes(focused))
            : choices;
        await interaction.respond(
            filtered.slice(0, 25).map((key) => ({
                name: COMMAND_DETAILS[key].name,
                value: key,
            }))
        );
    },

    async execute(interaction) {
        // ── Detailed help for a specific command ──
        const commandKey = interaction.options.getString("command");
        if (commandKey) {
            helpLogger.info(`/help command:${commandKey} from ${interaction.user.tag}`);
            const detail = COMMAND_DETAILS[commandKey.toLowerCase()];
            if (!detail) {
                return interaction.reply({
                    embeds: [{
                        title: "\u2753 Unknown Command",
                        description: `No details available for \`${commandKey}\`. Use \`/help\` to see the commands reference.`,
                        color: 0xffcc00,
                    }],
                    flags: MessageFlags.Ephemeral,
                });
            }
            return interaction.reply({
                embeds: [buildCommandDetailEmbed(commandKey.toLowerCase())],
                flags: MessageFlags.Ephemeral,
            });
        }

        // ── Overview with page selector ──
        helpLogger.info(`/help from ${interaction.user.tag}`);

        let currentPage = "commands";

        await interaction.reply({
            embeds: [buildCommandsEmbed()],
            components: [buildSelectRow(currentPage)],
            flags: MessageFlags.Ephemeral,
        });

        const reply = await interaction.fetchReply();
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => i.user.id === interaction.user.id,
            time: SELECT_TIMEOUT_MS,
        });

        collector.on("collect", async (selectInteraction) => {
            currentPage = selectInteraction.values[0];

            const embed = currentPage === "quickstart"
                ? buildQuickStartEmbed()
                : buildCommandsEmbed();

            await selectInteraction.update({
                embeds: [embed],
                components: [buildSelectRow(currentPage)],
            });
        });

        collector.on("end", async () => {
            try {
                const disabledMenu = new StringSelectMenuBuilder()
                    .setCustomId("help_page_select")
                    .setPlaceholder("Session expired")
                    .setDisabled(true)
                    .addOptions([{ label: "Expired", value: "expired" }]);
                const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);

                await interaction.editReply({ components: [disabledRow] });
            } catch (_) {
                // Message may have been deleted - ignore.
            }
        });
    },
};
