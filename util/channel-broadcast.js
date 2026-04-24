// This script is a standalone utility to broadcast patch notes or announcements to a specific Discord channel using the bot's credentials.
// You can customize the embed content to fit your announcement style.

// Do a node command on this file to post the patch notes to your channel. Make sure to update the TOKEN and CHANNEL_ID variables before running.
// Example usage: `node util/channel-broadcast.js`

// Usefull for: Posting something through the bot, announcements, update to your friends, trolling your players, etc.

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ===== CONFIGURATION =====
const TOKEN = 'YOUR_BOT_TOKEN';
const CHANNEL_ID = 'YOUR_CHANNEL_ID_HERE'; // Replace with your target channel ID

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID);

  //  Build your embeds, content, messages, formatting, etc. here. This is just an example template to get you started.

  const embed = new EmbedBuilder()
    .setTitle('NEW DOCUMENTATION WEBSITE')
    .setDescription(
      'We just deployed a brand new documentation website for CraftDaemon.\n\n' +
      'Check out comprehensive guides, command references, and setup instructions all in one place.'
    )
    .addFields(
      {
        name: '🌐 Visit the Docs',
        value: '[CraftDaemon Documentation](https://d1vid3d.github.io/CraftDaemon/)\n\n',
      },
      {
        name: '📖 What\'s Included',
        value: [
          '- Complete command reference',
          '- Setup and installation guide',
          '- Configuration documentation',
          '- Troubleshooting FAQ',
          '- Best practices for bot management',
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