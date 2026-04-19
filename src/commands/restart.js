const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");
const { acquireLock } = require("../services/commandLock");
const { isServerRunning, restartServer } = require("../services/minecraftSystemd");

const systemdLogger = createLogger("SystemD");

module.exports = {
    permission: "server.restart",
    data: new SlashCommandBuilder()
        .setName("restart")
        .setDescription("Restart the Minecraft server"),
    async execute(interaction) {
        systemdLogger.info(`Restart command from ${interaction.user.tag}`);
        if (await acquireLock(interaction, "restart")) return;
        const running = await isServerRunning();

        if (!running) {
            return interaction.reply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🔴 Server is not running, use `/start` instead.",
                    color: 0xff0000,
                }],
            });
        }

        await interaction.reply({
            embeds: [{
                title: "🔄 Restarting Server",
                description: "Restarting server… (this takes ~30 seconds)",
                color: 0x5865f2,
            }],
        });
        try {
            await restartServer();
            return interaction.followUp({
                embeds: [{
                    title: "✅ Restart Command Sent",
                    description: "Use `/status` to monitor the restart.",
                    color: 0x00ff66,
                }],
            });
        } catch (err) {
            systemdLogger.error(`Restart command failed: ${err.message}`);
            return interaction.followUp({
                embeds: [{
                    title: "❌ Restart Failed",
                    description: "Failed to restart the server. Check bot sudo permissions.",
                    color: 0xff0000,
                }],
            });
        }
    },
};
