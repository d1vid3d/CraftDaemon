// This script registers the slash commands for the Discord bot. It should be run once to set up the commands in the specified guild.
// Make sure to fill in the .env file with the appropriate values before running this script.
// Example Usage: node src/register-commands.js

require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
    {
        name: 'ping',
        description: '"Pong!"',
    },
    {
        name: 'start',
        description: 'Start the Minecraft server',
    },
    {
        name: 'stop',
        description: 'Stop the Minecraft server',
    },
    {
        name: 'status',
        description: 'Get the status of the Minecraft server',
    },
    {
        name: 'restart',
        description: 'Restart the Minecraft server',
    },
    {
        name: 'address',
        description: 'Get the IP address of the Minecraft server',
    }
    
];

const rest = new REST({version: '10'}).setToken(process.env.TOKEN);

(async () => {
    try{
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
    console.log('slash command were registered succesfully ✅');
    } catch(error) {
        console.log(`❌ There was an error: ${error}`);
    }
})();







