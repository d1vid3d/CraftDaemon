const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");
const { acquireLock } = require("../services/commandLock");
const { isServerRunning, stopServer } = require("../services/minecraftSystemd");

const systemdLogger = createLogger("SystemD");

module.exports = {
    permission: "server.stop",
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop the Minecraft server"),
    async execute(interaction) {
        systemdLogger.info(`Stop command from ${interaction.user.tag}`);
        if (await acquireLock(interaction, "stop")) return;
        const running = await isServerRunning();

        if (!running) {
            return interaction.reply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🔴 Server is not running.",
                    color: 0xff0000,
                }],
            });
        }

        await interaction.reply({
            embeds: [{
                title: "🛑 Stopping Server",
                description: "Stopping server…",
                color: 0xff4d00,
            }],
        });
        try {
            await stopServer();
            return interaction.followUp({
                embeds: [{
                    title: "✅ Server Stopped",
                    description: "Server has been stopped successfully.",
                    color: 0xff0000,
                }],
            });
        } catch (err) {
            systemdLogger.error(`Stop command failed: ${err.message}`);
            return interaction.followUp({
                embeds: [{
                    title: "❌ Stop Failed",
                    description: "Failed to stop the server. Check bot sudo permissions.",
                    color: 0xff0000,
                }],
            });
        }
    },
};
