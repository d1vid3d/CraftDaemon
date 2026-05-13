//  /logs command  |  Live server log streaming & tail snapshot
//  Modes:
//    live - streams new log lines in real-time (default)
//    tail - fetches last N lines as a static snapshot

const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");
const { hasActiveSession, startSession } = require("../services/logsServices/sessionManager");
const { fetchTailLines, LOGS_SOURCE } = require("../services/logsServices/logStream");

const logsLogger = createLogger("Logs");

module.exports = {
    permission: "admin.logs",
    data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("Stream or view live server logs")
        .addStringOption((option) =>
            option
                .setName("mode")
                .setDescription("Log viewing mode")
                .setRequired(false)
                .addChoices(
                    { name: "live", value: "live" },
                    { name: "tail", value: "tail" }
                )
        )
        .addIntegerOption((option) =>
            option
                .setName("lines")
                .setDescription("Number of lines to fetch (tail mode only)")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(50)
        ),

    async execute(interaction) {
        const mode = interaction.options.getString("mode") || "live";
        const lines = interaction.options.getInteger("lines") || 20;

        logsLogger.info(`/logs ${mode} from ${interaction.user.tag} (source: ${LOGS_SOURCE})`);

        // Tail mode
        if (mode === "tail") {
            await interaction.deferReply();

            const logLines = fetchTailLines(lines);
            const content = logLines.join("\n");

            // Discord message limit is ~2000 chars. Truncate if needed.
            const truncated = content.length > 1900
                ? content.substring(content.length - 1900)
                : content;

            return interaction.editReply({
                embeds: [{
                    title: "📋 Server Logs (Tail)",
                    description: "```\n" + truncated + "\n```",
                    color: 0x5865f2,
                    footer: { text: `Last ${logLines.length} line(s) • Source: ${LOGS_SOURCE}` },
                    timestamp: new Date().toISOString(),
                }],
            });
        }

        // Live mode

        // Concurrent session guard — one per channel.
        if (hasActiveSession(interaction.channelId)) {
            return interaction.reply({
                content: "⚠️ A log session is already active in this channel. Wait for it to end or try again later.",
                ephemeral: true,
            });
        }

        // Send the initial message that will be live-edited.
        await interaction.reply({
            embeds: [{
                title: "📡 Live Server Logs",
                description: "Starting log stream...",
                color: 0x00ff66,
                footer: { text: `Source: ${LOGS_SOURCE} • Auto-stops after 60s` },
            }],
        });

        // Fetch the sent message so we can edit it.
        const liveMessage = await interaction.fetchReply();

        // Replace the embed with a plain code block that the session
        // manager will edit every 2 seconds.
        await liveMessage.edit({ embeds: [], content: "```\nWaiting for log output...\n```" });

        const result = startSession(interaction.channelId, liveMessage);

        if (!result.success) {
            logsLogger.warn(`Failed to start session: ${result.error}`);
            await liveMessage.edit({
                content: `❌ Failed to start log stream: ${result.error}`,
            });
        }
    },
};
