const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");
const { runUpdateCheck } = require("../services/updateService");

const discordLogger = createLogger("Discord");

module.exports = {
    permission: "bot.checkUpdate",
    data: new SlashCommandBuilder()
        .setName("checkupdate")
        .setDescription("Check GitHub for a newer CraftDaemon release and notify if needed"),
    async execute(interaction) {
        discordLogger.info(`checkUpdate command from ${interaction.user.tag}`);
        await interaction.deferReply({ ephemeral: true });

        try {
            const { summary } = await runUpdateCheck(interaction.client, { manual: true });
            await interaction.editReply({
                embeds: [{
                    title: "Update check",
                    description: summary || "Check completed.",
                    color: 0x5865f2,
                }],
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await interaction.editReply({
                embeds: [{
                    title: "Update check failed",
                    description: msg,
                    color: 0xed4245,
                }],
            });
        }
    },
};
