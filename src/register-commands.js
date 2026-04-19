// This script registers the slash commands for the Discord bot. It should be run once to set up the commands in the specified guild.
// Make sure to fill in config/.env with the appropriate values before running this script.
// Example Usage: node src/register-commands.js

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../config/.env") });
const { REST, Routes } = require("discord.js");

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.existsSync(commandsPath)
    ? fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"))
    : [];

const commands = [];
for (const file of commandFiles) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const command = require(path.join(commandsPath, file));
    if (command?.data?.toJSON) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log("slash command were registered succesfully ✅");
    } catch (error) {
        console.log(`❌ There was an error: ${error}`);
    }
})();
