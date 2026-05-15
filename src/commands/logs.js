//  /logs command  |  Live server log streaming & tail snapshot
//  Modes:
//    live - streams new log lines in real-time (default)
//    tail - fetches last N lines as a static snapshot
//    stop - stops the active log session in this channel

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { createLogger } = require("../services/logger");
const { hasActiveSession, startSession, stopSession, SESSION_TIMEOUT_MS } = require("../services/logsServices/sessionManager");
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
                    { name: "tail", value: "tail" },
                    { name: "stop", value: "stop" }
                )
        )
        .addIntegerOption((option) =>
            option
                .setName("lines")
                .setDescription("Number of lines to fetch (only for tail mode, does not affect live mode)")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
        ),

    async execute(interaction) {
        const mode = interaction.options.getString("mode") || "live";
        const lines = interaction.options.getInteger("lines") || 20;

        logsLogger.info(`/logs ${mode} from ${interaction.user.tag} (source: ${LOGS_SOURCE})`);

        // Stop mode
        if (mode === "stop") {
            if (!hasActiveSession(interaction.channelId)) {
                return interaction.reply({
                    content: "⚠️ No active log session in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
            }
            stopSession(interaction.channelId, "Stopped by user.");
            return interaction.reply({
                content: "🛑 Log stream stopped.",
                flags: MessageFlags.Ephemeral,
            });
        }

        // Tail mode
        if (mode === "tail") {
            await interaction.deferReply();

            const logLines = fetchTailLines(lines);
            const content = logLines.join("\n");

            // Discord message limit is ~2000 chars. Truncate if needed.
            const truncated = content.length > 1900
                ? content.substring(content.length - 1900)
                : content;

            const footer = `📋 Server Logs (Tail) • Last ${logLines.length} line(s) • Source: ${LOGS_SOURCE}`;

            return interaction.editReply({
                content: `${footer}\n\`\`\`\n${truncated}\n\`\`\``,
            });
        }

        // Live mode

        // Concurrent session guard — one per channel.
        if (hasActiveSession(interaction.channelId)) {
            return interaction.reply({
                content: "⚠️ A log session is already active in this channel. Wait for it to end or try again later.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const timeoutLabel = SESSION_TIMEOUT_MS === 0
            ? "No timeout"
            : `Auto-stops after ${SESSION_TIMEOUT_MS / 1000}s`;

        // Send the initial message that will be live-edited.
        const replyRes = await interaction.reply({
            embeds: [{
                title: "📡 Live Server Logs",
                description: "Starting log stream...",
                color: 0x00ff66,
                footer: { text: `Source: ${LOGS_SOURCE} • ${timeoutLabel}` },
            }],
            withResponse: true,
        });

        // Fetch the sent message so we can edit it.
        const liveMessage = replyRes.resource.message;

        // Replace the embed with a plain code block that the session
        // manager will edit every 2 seconds.
        await liveMessage.edit({ embeds: [], content: "```\nWaiting for log output...\n```" });

        const footer = `📡 Live Server Logs • Source: ${LOGS_SOURCE} • ${timeoutLabel}`;
        const result = startSession(interaction.channelId, liveMessage, footer, 'above');

        if (!result.success) {
            logsLogger.warn(`Failed to start session: ${result.error}`);
            await liveMessage.edit({
                content: `❌ Failed to start log stream: ${result.error}`,
            });
        }
    },
};
