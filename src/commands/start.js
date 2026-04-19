const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");
const { acquireLock, releaseLock } = require("../services/commandLock");
const { getServiceState, startServer } = require("../services/minecraftSystemd");

const systemdLogger = createLogger("SystemD");

module.exports = {
    permission: "server.start",
    data: new SlashCommandBuilder()
        .setName("start")
        .setDescription("Start the Minecraft server"),
    async execute(interaction) {
        systemdLogger.info(`Start command from ${interaction.user.tag}`);
        if (await acquireLock(interaction, "start")) return;
        const state = await getServiceState();

        if (state === "active") {
            return interaction.reply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🟢 Server is already running.",
                    color: 0x00ff66,
                }],
            });
        }
        if (state === "activating") {
            return interaction.reply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🟡 Server is already starting up, give it a moment.",
                    color: 0xffcc00,
                }],
            });
        }

        await interaction.reply({
            embeds: [{
                title: "▶️ Starting Server",
                description: "Starting server… (ETA ~30 seconds)",
                color: 0x5865f2,
            }],
        });
        try {
            await startServer();
            releaseLock();
            return interaction.followUp({
                embeds: [{
                    title: "✅ Start Command Sent",
                    description: "Use `/status` to monitor startup.",
                    color: 0x00ff66,
                }],
            });
        } catch (err) {
            systemdLogger.error(`Start command failed: ${err.message}`);
            releaseLock();
            return interaction.followUp({
                embeds: [{
                    title: "❌ Start Failed",
                    description: "Failed to start the server. Check bot sudo permissions.",
                    color: 0xff0000,
                }],
            });
        }
    },
};
