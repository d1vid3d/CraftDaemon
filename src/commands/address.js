const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");

const discordLogger = createLogger("Discord");

const MAIN_ADDRESS = process.env.MAIN_ADDRESS || null;

module.exports = {
    permission: "server.address",
    data: new SlashCommandBuilder()
        .setName("address")
        .setDescription("Get the IP address of the Minecraft server"),
    async execute(interaction) {
        discordLogger.info(`Address command from ${interaction.user.tag}`);
        if (!MAIN_ADDRESS) {
            return interaction.reply({
                embeds: [{
                    title: "⚠️ Server Address Not Configured",
                    description: "Set `MAIN_ADDRESS` in the bot's `.env` file.",
                    color: 0xffcc00,
                }],
            });
        }
        return interaction.reply({
            embeds: [{
                title: "🌐 Server Address",
                description: "Share these addresses with your friends to let them join!",
                color: 0x5865f2,
                fields: [
                    { name: "Main Address", value: `\`${MAIN_ADDRESS}\``, inline: false },
                    { name: "Java Edition", value: `\`${process.env.JAVA_EDITION_VERSION || "Not configured"}\``, inline: true },
                    { name: "LAN Address", value: `\`${process.env.LOCAL_ADDRESS || "Not configured"}\``, inline: true },
                ],
            }],
        });
    },
};
