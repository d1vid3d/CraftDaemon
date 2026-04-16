// Linux Warning: This bot uses sudo to manage the Minecraft server via systemd, so it must be run in an environment where it has passwordless sudo permissions for the specified systemctl commands.
// Make sure to configure your sudoers file accordingly and understand the security implications.

// ============================================================
//  CraftDaemon  |  A Discord bot for managing your Minecraft server on Linux
//  Server management via systemd  |  Stats via RCON
//  Required external files: .env (configuration), logger.js (custom logging utility)
// ============================================================

// Make sure to fill in the .env file with the appropriate values before running the bot.
// and run `node src/register-commands.js` once to set up the slash commands in your Discord server.

require("dotenv").config();
const { Client, IntentsBitField, GatewayIntentBits, ActivityType } = require("discord.js");
const { exec } = require("child_process");
const { promisify } = require("util");
const Rcon = require("rcon");

// Import custom logger
const { createLogger, LogLevel } = require("./logger");

// Promisified exec for easier async/await usage
const execAsync = promisify(exec);

// Create category-specific loggers (Create your own categories as needed by calling createLogger with a custom name in your modules)
const botLogger = createLogger('Bot');
const discordLogger = createLogger('Discord');
const nodeLogger = createLogger('Node');
const minecraftLogger = createLogger('Minecraft');
const rconLogger = createLogger('RCON');
const autoStopLogger = createLogger('AutoStop');
const systemdLogger = createLogger('SystemD');

// ---- Example Config [CHANGE IN .ENV] (check .env.example for details) ----------------------------------------
//
//  TOKEN=
//  GUILD_ID=
//  STATUS_CHANNEL_ID=
//
//  MC_SERVICE=minecraft        [your systemd service name]
//
//  RCON_HOST=127.0.0.1
//  RCON_PORT=25575
//  RCON_PASSWORD=
//
// ----------------------------------------------------------------

// Hardcoding is not reccomended for these values since they may differ between environments, but you can change the defaults here if you want:

const RCON_HOST        = process.env.RCON_HOST     || "127.0.0.1";
const RCON_PORT        = parseInt(process.env.RCON_PORT || "25575", 10);
const RCON_PASSWORD    = process.env.RCON_PASSWORD || "";
const MC_SERVICE        = process.env.MC_SERVICE       || "minecraft";
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID;
const MAIN_ADDRESS      = process.env.MAIN_ADDRESS     || null;

// Auto-shutdown configuration (from .env with defaults)

const AUTO_STOP_MINUTES = parseInt(process.env.AUTO_STOP_MINUTES || "10", 10);
const WARNING_MINUTES   = parseInt(process.env.WARNING_MINUTES || "8", 10);
const CHECK_INTERVAL    = parseInt(process.env.CHECK_INTERVAL || "30000", 10); //ms

// ---- Runtime state ---------------------------------------------
let emptySince   = null;
let warningSent  = false;

// ========== STARTUP CONFIG LOGGING (Default Console Broadcast when bot starts) ==========
botLogger.info("========== BOT STARTUP CONFIGURATION ==========");
botLogger.info(`RCON Host: ${RCON_HOST}`);
botLogger.info(`RCON Port: ${RCON_PORT}`);
botLogger.info(`Minecraft Service: ${MC_SERVICE}`);
botLogger.info(`Auto-stop enabled: Yes (${AUTO_STOP_MINUTES} min idle, warning at ${WARNING_MINUTES} min)`);
botLogger.info(`Status channel ID: ${STATUS_CHANNEL_ID || "NOT SET"}`);
botLogger.info(`Main address: ${MAIN_ADDRESS || "NOT SET"}`);
botLogger.info("=============================================");

// ================================================================
//  systemd helpers
// ================================================================

// Returns the raw systemd active state:
//"active" | "inactive" | "activating" | "deactivating" | "failed" | "unknown"

async function getServiceState() {
    try {
        const { stdout } = await execAsync(
            `systemctl is-active ${MC_SERVICE}`
        );
        return stdout.trim();
    } catch (err) {
        // is-active exits non-zero when not active; stdout still contains the state
        return (err.stdout || "unknown").trim();
    }
}

// Returns true only when the service is fully active
async function isServerRunning() {
    return (await getServiceState()) === "active";
}

// Runs systemctl start and resolves when the command returns
async function startServer() {
    await execAsync(`sudo systemctl start ${MC_SERVICE}`);
}

// Send /save-all command via RCON to save world data (To prevent unexpected data loss on shutdown/restart). This is called before stopServer() and restartServer().
async function saveAll() {
    try {
        minecraftLogger.info("Sending /save-all command via RCON...");
        const res = await rconCommand("save-all");
        minecraftLogger.info(`Save-all response: ${res}`);
    } catch (err) {
        minecraftLogger.error(`Failed to send save-all: ${err.message}`);
        // Don't throw - continue with shutdown even if save fails
    }
}

// Runs systemctl stop and resolves when the command returns
async function stopServer() {
    await saveAll();
    // Give the server a moment to process the save command
    await new Promise(resolve => setTimeout(resolve, 1000));
    await execAsync(`sudo systemctl stop ${MC_SERVICE}`);
}

// Runs systemctl restart and resolves when the command returns
async function restartServer() {
    await saveAll();
    // Give the server a moment to process the save command
    await new Promise(resolve => setTimeout(resolve, 1000));
    await execAsync(`sudo systemctl restart ${MC_SERVICE}`);
}

// Parses the ActiveEnterTimestamp from systemctl and returns uptime
// as a formatted string like "2h 15m 30s", or "N/A" if unavailable.
async function getServiceUptime() {
    try {
        const { stdout } = await execAsync(
            `sudo systemctl show ${MC_SERVICE} --property=ActiveEnterTimestamp`
        );
        // stdout: "ActiveEnterTimestamp=Wed 2025-01-01 12:00:00 UTC"
        const value = stdout.replace("ActiveEnterTimestamp=", "").trim();
        if (!value) return "N/A";

        const startDate = new Date(value);
        if (isNaN(startDate.getTime())) return "N/A";

        const totalSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
        if (totalSeconds < 0) return "N/A";

        const hours   = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours}h ${minutes}m ${seconds}s`;
    } catch {
        return "N/A";
    }
}

// ================================================================
//  RCON helpers 
// ================================================================

// Strip Minecraft formatting codes like §a, §r from RCON responses for cleaner display in Discord
function cleanMinecraftFormatting(str) {
    if (!str || typeof str !== "string") return "";
    return str.replace(/§[0-9A-FK-OR]/gi, "");
}

// Send a single RCON command and resolve with the cleaned response
function rconCommand(cmd, timeout = 2500) {
    return new Promise((resolve, reject) => {
        if (!RCON_PASSWORD)
            return reject(new Error("RCON_PASSWORD is not set in .env"));

        const conn = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD);
        let responded = false;
        let timer = null;

        const cleanup = () => {
            try { conn.disconnect(); } catch (_) {}
            if (timer) clearTimeout(timer);
        };

        conn.on("auth", () => {
            try { 
                rconLogger.debug(`Sending command: ${cmd}`);
                conn.send(cmd); 
            } catch (e) { 
                rconLogger.error(`Failed to send command: ${e.message}`);
                cleanup(); 
                reject(e); 
            }
        });

        conn.on("response", (str) => {
            responded = true;
            rconLogger.debug(`Response received for command: ${cmd}`);
            cleanup();
            resolve(cleanMinecraftFormatting(String(str)));
        });

        conn.on("error", (err) => { 
            if (err.code === 'ECONNREFUSED') {
                rconLogger.warn(`RCON connection refused (server may not be running): ${err.message}`);
            } else {
                rconLogger.error(`RCON error: ${err.message}`);
            }
            cleanup(); 
            reject(err); 
        });

        conn.on("end", () => {
            if (!responded) { 
                rconLogger.warn("RCON connection ended before response");
                cleanup(); 
                reject(new Error("RCON connection ended before response.")); 
            }
        });

        timer = setTimeout(() => {
            if (!responded) { 
                rconLogger.warn(`RCON command timed out after ${timeout}ms`);
                cleanup(); 
                reject(new Error("RCON timed out")); 
            }
        }, timeout);

        try { conn.connect(); } catch (e) { 
            rconLogger.error(`Failed to connect to RCON: ${e.message}`);
            cleanup(); 
            reject(e); 
        }
    });
}

async function getTps() {
    const res = await rconCommand("tps");
    return res.replace(/§./g, "").trim();
}

async function getPlayerList() {
    return rconCommand("list");
}

async function getOnlinePlayerCount() {
    try {
        const res = await rconCommand("list");
        const match = res.match(/There are (\d+) of a max of (\d+)/i);
        return match ? parseInt(match[1], 10) : null;
    } catch {
        return null;
    }
}

async function measureRconPing() {
    const start = Date.now();
    try {
        await rconCommand("list", 3000);
        return Date.now() - start;
    } catch {
        return null;
    }
}

// ================================================================
//  Discord client
// ================================================================

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        GatewayIntentBits.Guilds,
    ],
});

// ================================================================
//  Bot presence  driven by systemd state and RCON availability
// ================================================================

async function updateBotPresence() {
    try {
        const running = await isServerRunning();

            if (!running) {
            // [PRESENCE UPDATE] Server is offline
            discordLogger.debug("Updating presence: Server Offline (DND status)");
            client.user.setPresence({
                status: "dnd",
                activities: [{ name: "🟥 Server Offline", type: ActivityType.Watching }],
            });
            return;
        }

        // Server is active — try to get player count via RCON
        const players = await getOnlinePlayerCount();

        if (players === null) {
            // Active but RCON not ready yet (still starting up)
            // [PRESENCE UPDATE] Server is starting
            discordLogger.debug("Updating presence: Server Starting (IDLE status)");
            client.user.setPresence({
                status: "idle",
                activities: [{ name: "🟡 Server Starting...", type: ActivityType.Watching }],
            });
            return;
        }

        // [PRESENCE UPDATE] Server is running with players
        discordLogger.debug(`Updating presence: Server Online (${players} player${players !== 1 ? "s" : ""})`);
        client.user.setPresence({
            status: "online",
            activities: [{
                name: `🟩 ${players} player${players !== 1 ? "s" : ""} online`,
                type: ActivityType.Watching,
            }],
        });
    } catch (err) {
        discordLogger.error(`Presence update failed: ${err.message}`);
    }
}

// ================================================================
//  Auto-shutdown  (Uses stopServer())
// ================================================================

async function sendAutoStopWarning(minutesLeft) {
    try {
        const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
        if (!channel) {
            autoStopLogger.error("Channel not found. Check STATUS_CHANNEL_ID in .env");
            return;
        }

        // Check bot permissions
        if (!channel.permissionsFor(client.user).has("SEND_MESSAGES")) {
            autoStopLogger.warn("Bot missing SEND_MESSAGES permission");
        }
        if (!channel.permissionsFor(client.user).has("EMBED_LINKS")) {
            autoStopLogger.error("Bot missing EMBED_LINKS permission - cannot send embeds");
            return;
        }
        
        await channel.send({
            embeds: [{
                title: "⚠️ Server Inactivity Warning",
                description: `No players online for **${AUTO_STOP_MINUTES - minutesLeft}** minute(s).\n\nServer will automatically stop in **${minutesLeft}** minute(s) if no one joins.`,
                color: 0xffcc00,
            }],
        });
    } catch (err) {
        autoStopLogger.error(`Failed to send warning: ${err.message}`);
    }
}

async function sendAutoStopShutdown() {
    try {
        const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
        if (!channel) {
            autoStopLogger.error("Channel not found. Check STATUS_CHANNEL_ID in .env");
            return;
        }

        // Check bot permissions
        if (!channel.permissionsFor(client.user).has("SEND_MESSAGES")) {
            autoStopLogger.warn("Bot missing SEND_MESSAGES permission");
        }
        if (!channel.permissionsFor(client.user).has("EMBED_LINKS")) {
            autoStopLogger.error("Bot missing EMBED_LINKS permission - cannot send embeds");
            return;
        }
        
        await channel.send({
            embeds: [{
                title: "🛑 Server Shut Down",
                description: `Server has been automatically stopped due to inactivity (${AUTO_STOP_MINUTES} minutes with no players online).`,
                color: 0xff0000,
            }],
        });
    } catch (err) {
        autoStopLogger.error(`Failed to send shutdown notification: ${err.message}`);
    }
}

setInterval(async () => {
    const running = await isServerRunning();

    if (!running) {
        if (emptySince !== null) {
            // [AUTO-STOP TRACKING] Server offline - reset timer
            autoStopLogger.info("Server went offline. Resetting auto-stop timer.");
        }
        emptySince  = null;
        warningSent = false;
        return;
    }

    const players = await getOnlinePlayerCount();
    if (players === null) return; // RCON not ready yet, skip this tick

    if (players > 0) {
        if (emptySince !== null) {
            // [AUTO-STOP TRACKING] Players joined - cancel shutdown
            autoStopLogger.info(`Players detected (${players}). Cancelling auto-stop timer.`);
        }
        emptySince  = null;
        warningSent = false;
        return;
    }

    // No players online
    if (!emptySince) {
        // [AUTO-STOP TRACKING] Server became empty - start timer
        emptySince  = Date.now();
        warningSent = false;
        autoStopLogger.info(`Server is now empty. Auto-stop timer started (${AUTO_STOP_MINUTES} minutes until shutdown).`);
        return;
    }

    const minutesEmpty = (Date.now() - emptySince) / 60_000;

    if (minutesEmpty >= WARNING_MINUTES && !warningSent) {
        const minutesLeft = Math.ceil(AUTO_STOP_MINUTES - minutesEmpty);
        // [AUTO-STOP TRACKING] Sending warning
        autoStopLogger.warn(`Server empty for ${minutesEmpty.toFixed(1)} minutes. Warning sent (${minutesLeft} min until shutdown).`);
        await sendAutoStopWarning(minutesLeft);
        warningSent = true;
    }

    if (minutesEmpty >= AUTO_STOP_MINUTES) {
        // [AUTO-STOP TRACKING] Threshold reached - shutting down
        autoStopLogger.info(`Server empty for ${minutesEmpty.toFixed(1)} minutes (threshold: ${AUTO_STOP_MINUTES}). Initiating shutdown.`);
        try {
            await stopServer();
            await sendAutoStopShutdown();
            autoStopLogger.warn(`Server stopped due to inactivity. Shutdown notification sent.`);
        } catch (err) {
            autoStopLogger.error(`Failed to stop server: ${err.message}`);
        }
        emptySince  = null;
        warningSent = false;
    }

}, CHECK_INTERVAL);

// ================================================================
//  Ready
// ================================================================

client.on("clientReady", (c) => {
    discordLogger.info(`✅ ${c.user.username} is online.`);
});

client.once("clientReady", async () => {
    discordLogger.info(`Logged in as ${client.user.tag}`);
    systemdLogger.info(`Managing systemd service: ${MC_SERVICE}`);

    await updateBotPresence();
    setInterval(updateBotPresence, 60_000);
});

// ================================================================
//  Slash command handler
// ================================================================

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // ── PING ───────────────────────────────────────────────────
    if (interaction.commandName === "ping") {
        discordLogger.info(`Ping command from ${interaction.user.tag}`);
        const sent = await interaction.reply({ 
            embeds: [{
                title: "🏓 Pinging...",
                description: "Measuring latency...",
                color: 0x5865f2,
            }],
            fetchReply: true 
        });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        return interaction.editReply({
            embeds: [{
                title: "🏓 Pong!",
                description: `Bot latency: **${latency}ms**`,
                color: 0x5865f2,
            }],
        });
    }

    // ── START ──────────────────────────────────────────────────
    if (interaction.commandName === "start") {
        systemdLogger.info(`Start command from ${interaction.user.tag}`);
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
            return interaction.followUp({
                embeds: [{
                    title: "✅ Start Command Sent",
                    description: "Use `/status` to monitor startup.",
                    color: 0x00ff66,
                }],
            });
        } catch (err) {
            systemdLogger.error(`Start command failed: ${err.message}`);
            return interaction.followUp({
                embeds: [{
                    title: "❌ Start Failed",
                    description: "Failed to start the server. Check bot sudo permissions.",
                    color: 0xff0000,
                }],
            });
        }
    }

    // ── STOP ───────────────────────────────────────────────────
    if (interaction.commandName === "stop") {
        systemdLogger.info(`Stop command from ${interaction.user.tag}`);
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
    }

    // ── RESTART ────────────────────────────────────────────────
    if (interaction.commandName === "restart") {
        systemdLogger.info(`Restart command from ${interaction.user.tag}`);
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
    }

    // ── ADDRESS ────────────────────────────────────────────────
    if (interaction.commandName === "address") {
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
    }

    // ── STATUS ─────────────────────────────────────────────────
    if (interaction.commandName === "status") {
        systemdLogger.info(`Status command from ${interaction.user.tag}`);
        await interaction.deferReply();

        const state = await getServiceState();

        // Offline / failed
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

        // Still starting up
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

        // Active — gather stats
        // [STATUS QUERY] Starting stat collection
        const statsStartTime = Date.now();
        const uptimeText = await getServiceUptime();

        let tps = null, players = null, ping = null, rconOk = false;

        const [tpsRes, playersRes, pingRes] = await Promise.allSettled([
            getTps(),
            getPlayerList(),
            measureRconPing(),
        ]);

        if (tpsRes.status     === "fulfilled") tps     = tpsRes.value;
        if (playersRes.status === "fulfilled") players = playersRes.value;
        if (pingRes.status    === "fulfilled") ping    = pingRes.value;

        if (tpsRes.status === "rejected") rconLogger.warn(`TPS query failed: ${tpsRes.reason.message}`);
        if (playersRes.status === "rejected") rconLogger.warn(`Player list query failed: ${playersRes.reason.message}`);
        if (pingRes.status === "rejected") rconLogger.warn(`Ping measurement failed: ${pingRes.reason.message}`);        
        rconOk = !!(tps || players);
        
        // [STATUS QUERY] Log completed stats with query time
        const statsEndTime = Date.now();
        const queryTime = statsEndTime - statsStartTime;
        systemdLogger.debug(`Status query completed in ${queryTime}ms | TPS: ${tps || "N/A"} | Players Online: ${players ? players.split(":").pop().trim().substring(0, 40) : "N/A"} | RCON RTT: ${ping || "N/A"}ms`);

        // Parse player line
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
            embed.fields.push({ name: "TPS",             value: `📉 ${tps}`,                                    inline: false });
            embed.fields.push({ name: "Players",         value: `👥 ${playersLine}`,                            inline: false });
            embed.fields.push({ name: "Ping (RCON RTT)", value: ping !== null ? `📡 ${ping} ms` : "N/A",        inline: false });
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
    }
});

// ================================================================

client.login(process.env.TOKEN);