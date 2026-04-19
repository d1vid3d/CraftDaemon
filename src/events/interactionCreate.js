// ================================================================
//  interactionCreate event handler
// ================================================================
// This event handler listens for interactions (e.g. slash commands) and processes them according to the defined command handlers and permissions system.
// It uses the permission middleware to check if the user has the necessary permissions before executing any command logic.

const { permissionMiddleware } = require("../permissions/middleware");

// Assuming standard Discord.js event setup
module.exports = (client) => {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands?.get(interaction.commandName);
    if (!command) return;

    const allowed = await permissionMiddleware(interaction, command);
    if (!allowed) return;

    await command.execute(interaction);
  });
};

