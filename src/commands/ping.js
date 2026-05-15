const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");

const discordLogger = createLogger("Discord");

module.exports = {
    permission: null,
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription('Pong!'),
    async execute(interaction) {
        discordLogger.info(`Ping command from ${interaction.user.tag}`);
        const replyRes = await interaction.reply({
            embeds: [{
                title: "🏓 Pinging...",
                description: "Measuring latency...",
                color: 0x5865f2,
            }],
            withResponse: true,
        });
        const sent = replyRes.resource.message;
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        return interaction.editReply({
            embeds: [{
                title: "🏓 Pong!",
                description: `Bot latency (Discord API): **${latency}ms**`,
                color: 0x5865f2,
            }],
        });
    },
};
