//  /help command  -  Command reference & quick start guide - v1.3.1
//  Public command, no permission required.
//  Uses a StringSelectMenu to switch between pages.

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

// Data

const COMMAND_CATEGORIES = [
    {
        name: "Server Control",
        emoji: "🎮",
        commands: [
            { name: "/start", desc: "Start the Minecraft server", perm: "server.start" },
            { name: "/stop", desc: "Stop the Minecraft server", perm: "server.stop" },
            { name: "/restart", desc: "Restart the Minecraft server", perm: "server.restart" },
            { name: "/status", desc: "Get server status, TPS, and player info", perm: "server.status" },
        ],
    },
    {
        name: "Admin & Tools",
        emoji: "🛠️",
        commands: [
            { name: "/exec", desc: "Execute Minecraft console commands via RCON", perm: "admin.exec" },
            { name: "/logs", desc: "View live or tail server logs", perm: "admin.logs" },
            { name: "/checkupdate", desc: "Check for bot updates", perm: "bot.checkUpdate" },
        ],
    },
    {
        name: "Information",
        emoji: "ℹ️",
        commands: [
            { name: "/address", desc: "Get the server IP address", perm: "server.address" },
            { name: "/ping", desc: "Check bot latency", perm: null },
            { name: "/help", desc: "Show this help menu", perm: null },
        ],
    },
];

// Embed Builders

function buildCommandsEmbed() {
    const fields = COMMAND_CATEGORIES.map((cat) => {
        const lines = cat.commands.map((cmd) => {
            const lock = cmd.perm ? " 🔒" : "";
            return `\`${cmd.name}\`${lock} — ${cmd.desc}`;
        });
        return {
            name: `${cat.emoji}  ${cat.name}`,
            value: lines.join("\n"),
            inline: false,
        };
    });

    return {
        title: "📖 CraftDaemon - Commands Reference",
        description: "All available bot commands grouped by category.\nCommands marked with 🔒 require specific permissions.",
        fields,
        color: 0x5865f2,
        footer: { text: "Use the menu below to switch pages • Expires in 2 min" },
        timestamp: new Date().toISOString(),
    };
}

function buildQuickStartEmbed() {
    return {
        title: "🚀 CraftDaemon — Quick Start Guide",
        description: "Get up and running with your Minecraft server in seconds.",
        fields: [
            {
                name: "1️⃣  Starting the Server",
                value: "Use `/start` to boot the Minecraft server.\nThe bot will show real-time status updates as the server starts up.",
                inline: false,
            },
            {
                name: "2️⃣  Checking Status",
                value: "Use `/status` to see if the server is online, current TPS, and who's playing.",
                inline: false,
            },
            {
                name: "3️⃣  Sharing the Address",
                value: "Use `/address` to get the server IP — share it with friends to let them join!",
                inline: false,
            },
            {
                name: "4️⃣  Viewing Logs",
                value: [
                    "`/logs live` — Stream server logs in real-time",
                    "`/logs tail` — Fetch the last N log lines as a snapshot",
                    "`/logs stop` — Stop an active log stream in the channel",
                ].join("\n"),
                inline: false,
            },
            {
                name: "5️⃣  Remote Commands",
                value: "Use `/exec <command>` to run Minecraft console commands via RCON.\nDangerous commands will ask for confirmation first.",
                inline: false,
            },
            {
                name: "6️⃣  Stopping / Restarting",
                value: "`/stop` gracefully saves and shuts down the server.\n`/restart` performs a full save → stop → start cycle.",
                inline: false,
            },
            {
                name: "💡 Tips",
                value: [
                    "• The bot auto-stops the server after a configurable idle period.",
                    "• Use `/checkupdate` to see if a new bot version is available.",
                    "• Permissions are managed by server admins in `permission-config.js`.",
                ].join("\n"),
                inline: false,
            },
        ],
        color: 0x00ff66,
        footer: { text: "Use the menu below to switch pages • Expires in 2 min" },
        timestamp: new Date().toISOString(),
    };
}

// Select Menu

function buildSelectRow(activeValue) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("help_page_select")
        .setPlaceholder("Select a page…")
        .addOptions([
            {
                label: "Commands Reference",
                description: "View all commands grouped by category",
                value: "commands",
                emoji: "📖",
                default: activeValue === "commands",
            },
            {
                label: "Quick Start Guide",
                description: "Get started with CraftDaemon",
                value: "quickstart",
                emoji: "🚀",
                default: activeValue === "quickstart",
            },
        ]);
    return new ActionRowBuilder().addComponents(menu);
}

// Command Definition

module.exports = {
    permission: null,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show command reference and quick start guide"),

    async execute(interaction) {
        helpLogger.info(`/help from ${interaction.user.tag}`);

        // Default page: Commands Reference
        let currentPage = "commands";

        await interaction.reply({
            embeds: [buildCommandsEmbed()],
            components: [buildSelectRow(currentPage)],
            flags: MessageFlags.Ephemeral,
        });

        // Collector for the select menu
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
            // Disable the select menu after timeout
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
