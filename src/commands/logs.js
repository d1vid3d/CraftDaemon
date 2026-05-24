//  /logs command  |  Live server log streaming & tail snapshot & file attachment
//  Subcommands:
//    live        - streams new log lines in real-time
//    tail [N]    - fetches last N lines as a static snapshot
//    stop        - stops the active log session in this channel
//    download    - downloads the server log file (auto-compresses if over 7MB)

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { createLogger } = require("../services/logger");
const { hasActiveSession, startSession, stopSession, SESSION_TIMEOUT_MS } = require("../services/logsServices/sessionManager");
const { fetchTailLines, LOGS_SOURCE } = require("../services/logsServices/logStream");

const logsLogger = createLogger("Logs");

const MC_LOG_PATH = process.env.MC_LOG_PATH || "";
const SIZE_LIMIT = 7 * 1024 * 1024;
const TEMP_PATH = path.join(os.tmpdir(), "craftdaemon-latest.log.gz");

module.exports = {
    permission: "admin.logs",
    data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("Stream or view live server logs")
        .addSubcommand((sub) =>
            sub
                .setName("live")
                .setDescription("Stream new log lines in real-time")
        )
        .addSubcommand((sub) =>
            sub
                .setName("tail")
                .setDescription("Fetch the last N lines as a static snapshot")
                .addIntegerOption((option) =>
                    option
                        .setName("lines")
                        .setDescription("Number of lines to fetch")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("stop")
                .setDescription("Stop the active log session in this channel")
        )
        .addSubcommand((sub) =>
            sub
                .setName("download")
                .setDescription("Download the server log file")
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        logsLogger.info(`/logs ${subcommand} from ${interaction.user.tag} (source: ${LOGS_SOURCE})`);

        // Stop
        if (subcommand === "stop") {
            if (!hasActiveSession(interaction.channelId)) {
                return interaction.reply({
                    content: "⚠️ No active log session in this channel.",
                    flags: MessageFlags.Ephemeral,
                });
            }
            await stopSession(interaction.channelId, "Stopped by user.");
            return interaction.reply({
                content: "🛑 Log stream stopped.",
                flags: MessageFlags.Ephemeral,
            });
        }

        // Tail
        if (subcommand === "tail") {
            await interaction.deferReply();

            const lines = interaction.options.getInteger("lines") || 20;
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

        // Download
        if (subcommand === "download") {
            return handleAttach(interaction);
        }

        // Live

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
        const result = startSession(interaction.channelId, liveMessage, footer);

        if (!result.success) {
            logsLogger.warn(`Failed to start session: ${result.error}`);
            await liveMessage.edit({
                content: `❌ Failed to start log stream: ${result.error}`,
            });
        }
    },
};

async function handleAttach(interaction) {
    await interaction.deferReply();

    if (!MC_LOG_PATH) {
        return interaction.editReply({
            embeds: [{
                title: "📄 Log Attach",
                description: "MC_LOG_PATH is not configured. Set it in your config/.env file.",
                color: 0xff0000,
            }],
        });
    }

    let stat;
    try {
        stat = await fs.promises.stat(MC_LOG_PATH);
    } catch (err) {
        if (err.code === "ENOENT") {
            return interaction.editReply({
                embeds: [{
                    title: "📄 Log Attach",
                    description: `No file found at \`${MC_LOG_PATH}\`. Check that MC_LOG_PATH points to your server's logs/latest.log.`,
                    color: 0xff0000,
                }],
            });
        }
        return interaction.editReply({
            embeds: [{
                title: "📄 Log Attach",
                description: `Failed to read log file: ${err.message}`,
                color: 0xff0000,
            }],
        });
    }

    if (stat.size <= SIZE_LIMIT) {
        const attachment = new AttachmentBuilder(MC_LOG_PATH, { name: "latest.log.txt" });
        return interaction.editReply({
            content: "📋 Current session log:",
            files: [attachment],
        });
    }

    try {
        await pipeline(
            fs.createReadStream(MC_LOG_PATH),
            zlib.createGzip(),
            fs.createWriteStream(TEMP_PATH)
        );

        const attachment = new AttachmentBuilder(TEMP_PATH, { name: "latest.log.gz" });
        await interaction.editReply({
            content: "📋 Log exceeded 8MB and was compressed. Extract with any archive tool.",
            files: [attachment],
        });
    } catch (err) {
        logsLogger.error(`/logs download: gzip pipeline failed: ${err.message}`);
        return interaction.editReply({
            embeds: [{
                title: "📄 Log Download",
                description: `Failed to compress log file: ${err.message}`,
                color: 0xff0000,
            }],
        });
    } finally {
        try {
            await fs.promises.unlink(TEMP_PATH);
        } catch (_) {
            // Already cleaned up or never written - safe to ignore.
        }
    }
}
