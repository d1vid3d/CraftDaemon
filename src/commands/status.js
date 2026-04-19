const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");
const { getTps, getPlayerListWithPing } = require("../services/rconQuery");
const { getServiceState, getServiceUptime } = require("../services/minecraftSystemd");

const systemdLogger = createLogger("SystemD");
const minecraftLogger = createLogger("Minecraft");

const MAIN_ADDRESS = process.env.MAIN_ADDRESS || null;

module.exports = {
    permission: "server.status",
    data: new SlashCommandBuilder()
        .setName("status")
        .setDescription("Get the status of the Minecraft server"),
    async execute(interaction) {
        systemdLogger.info(`Status command from ${interaction.user.tag}`);
        await interaction.deferReply();

        const state = await getServiceState();

        if (state !== "active" && state !== "activating") {
            systemdLogger.warn(`Server offline, state: ${state}`);
            return interaction.editReply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: `🔴 **Server is OFFLINE**\n\`systemd state: ${state}\``,
                    color: 0xff0000,
                }],
            });
        }

        if (state === "activating") {
            systemdLogger.info("Server is activating, RCON not ready yet");
            return interaction.editReply({
                embeds: [{
                    title: "🖥️ Server Status",
                    description: "🟡 **Server is STARTING UP…**\nRCON will be available shortly.",
                    color: 0xffcc00,
                }],
            });
        }

        const statsStartTime = Date.now();
        const uptimeText = await getServiceUptime();

        let tps = null;
        let players = null;
        let ping = null;
        let rconOk = false;

        const [tpsRes, playersWithPingRes] = await Promise.allSettled([
            getTps(),
            getPlayerListWithPing(),
        ]);

        if (tpsRes.status === "fulfilled") tps = tpsRes.value;
        if (playersWithPingRes.status === "fulfilled") {
            players = playersWithPingRes.value.players;
            ping = playersWithPingRes.value.ping;
        }

        if (tpsRes.status === "rejected") minecraftLogger.warn(`TPS query failed: ${tpsRes.reason.message}`);
        if (playersWithPingRes.status === "rejected") minecraftLogger.warn(`Player list query failed: ${playersWithPingRes.reason.message}`);
        rconOk = !!(tps || players);

        const statsEndTime = Date.now();
        const queryTime = statsEndTime - statsStartTime;
        systemdLogger.debug(`Status query completed in ${queryTime}ms | TPS: ${tps || "N/A"} | Players Online: ${players ? players.split(":").pop().trim().substring(0, 40) : "N/A"} | RCON RTT: ${ping || "N/A"}ms`);

        let playersLine = "N/A";
        if (players) {
            const match = players.match(/There are (\d+) of a max of (\d+)/i);
            if (match) {
                const names = players.replace(/^There are .*?:\s*/i, "").trim();
                playersLine = `${match[1]} / ${match[2]}`;
                if (names) playersLine += `\n${names}`;
            } else {
                playersLine = players;
            }
        }

        const embed = {
            title: "🖥️ Server Status",
            color: rconOk ? 0x00ff66 : 0xffa500,
            description: rconOk
                ? "🟢 **Server is RUNNING**"
                : "🟠 **Server is running, but RCON is not responding yet.**",
            fields: [
                { name: "Uptime", value: `⏱️ ${uptimeText}`, inline: false },
            ],
        };

        if (rconOk) {
            embed.fields.push({ name: "TPS", value: `📉 ${tps}`, inline: false });
            embed.fields.push({ name: "Players", value: `👥 ${playersLine}`, inline: false });
            embed.fields.push({ name: "Ping (RCON RTT)", value: ping !== null ? `📡 ${ping} ms` : "N/A", inline: false });
            if (MAIN_ADDRESS) {
                embed.fields.push({ name: "Address", value: `🌐 \`${MAIN_ADDRESS}\``, inline: false });
            }
        } else {
            embed.fields.push({
                name: "RCON",
                value: "⚠️ RCON did not respond. The server may still be booting — try again in a moment.",
                inline: false,
            });
        }

        return interaction.editReply({ embeds: [embed] });
    },
};
