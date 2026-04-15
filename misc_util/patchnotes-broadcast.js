// This script is a standalone utility to broadcast patch notes or announcements to a specific Discord channel using the bot's credentials.
// It uses the same token and channel ID as the main bot, so you can keep it in sync with your .env configuration. You can customize the embed content to fit your announcement style.

// Do a node command on this file to post the patch notes to your channel. Make sure to update the TOKEN and CHANNEL_ID variables before running.
// Example usage: `node misc_util/patchnotes-broadcast.js`

// Usefull for: Posting something through the bot, announcements, update to your friends, trolling your players, etc.

require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.STATUS_CHANNEL_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID);

  //  Build your embeds, content, messages, formatting, etc. here. This is just an example template to get you started.

  const embed = new EmbedBuilder()
    .setTitle('📦 PATCH NOTES — CraftDaemon v2.0.1a')
    .setDescription(
      '🗓️ 14-04-2026\n\n' +
      "This is a near-complete rewrite of the bot's server management internals.\n" +
      'The user-facing commands remain the same, but everything under the hood has changed.'
    )
    .addFields(
      {
        name: '🔁 REWORKED',
        value: [
          '- Server management fully migrated from `child_process` → `systemd` service control',
          '- `/start` → `systemctl start` | `/stop` → `systemctl stop` | `/restart` → `systemctl restart`',
          '- The bot no longer owns or tracks the server process — **systemd handles everything**',
          '- State detection now sourced from systemd',
          '  → Bot stays accurate even if server is controlled outside Discord',
          '- Uptime sourced from `ActiveEnterTimestamp` instead of `Date.now()`',
          '  → Persists across bot restarts and reflects true service uptime',
        ].join('\n'),
      },
      {
        name: '✨ ADDED',
        value: [
          '- New `/address` command',
          '  → Displays the Minecraft server address directly in Discord',
          '- `/status` now includes a **server address section**',
          '  → Makes it easier for users to quickly connect',
          '- `/start` now detects the **activating** state',
          '  → Prevents duplicate start attempts while the server is already booting',
          '- `/status` now includes a 🟡 **Starting...** state',
          '  → Triggered when systemd is active but RCON is not yet reachable',
          '- Bot presence now shows 🟡 *Server Starting...* during the startup window',
          '- Control commands (`/start`, `/stop`, `/restart`) now surface errors from `systemctl`',
          '- `MC_SERVICE` and `STATUS_CHANNEL_ID` fully sourced from `.env`',
          '  → No more hardcoded values',
        ].join('\n'),
      },
      {
        name: '🗑️ REMOVED',
        value: [
          '- All `child_process` dependencies (`spawn`, `execFile`)',
          '- `serverProcess` and `serverStartTime` globals',
          '- `/startgateway` command (deprecated since v1.1)',
          '- SIGINT handler that wrote to process stdin',
          '- `SERVER_FOLDER_PATH` and `SERVER_JAR_NAME` from `.env`',
        ].join('\n'),
      },
      {
        name: '⚡ IMPROVED',
        value: [
          '- Auto-shutdown now uses `systemctl stop`',
          '  → More reliable than stdin control',
          '- Presence system now tracks **three states**: offline • starting • online',
          '- `/status` embed is more precise',
          '  → systemd state is shown for easier debugging',
          '- Player list formatting improved',
          '  → Names now appear cleanly below the player count',
          '- Codebase is significantly cleaner',
          '  → Server control logic moved into dedicated async functions',
        ].join('\n'),
      },
      {
        name: '🔒 STABILITY',
        value: [
          '- Bot no longer breaks if server is stopped externally',
          '- Server state always queried live from systemd',
          '  → No stale in-memory data',
          '- Uptime calculation is now fully reliable',
          '  → No negative or incorrect values after restarts',
          '- Bot now runs as a systemd service',
          '  → Auto-restarts on failure',
          '  → Persists across system reboots',
        ].join('\n'),
      }
    )
    .setColor(0x5865F2) // Discord blurple, change if you want
    .setFooter({ text: 'Super Sigma Footer' }) // Footer information, change as needed
    .setTimestamp(); // Adds a timestamp to the embed, you can customize or remove this if you want

  await channel.send({ embeds: [embed] });
  console.log('Patch notes posted!');

  client.destroy(); // Cleanly shut down the bot after posting once
});

client.login(TOKEN);