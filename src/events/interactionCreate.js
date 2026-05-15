//  interactionCreate event handler

// This event handler listens for interactions (e.g. slash commands) and processes them according to the defined command handlers and permissions system.
// It uses the permission middleware to check if the user has the necessary permissions before executing any command logic.

const { MessageFlags } = require("discord.js");
const { permissionMiddleware } = require("../permissions/middleware");

// Assuming standard Discord.js event setup
const { createLogger } = require("../services/logger");
const discordLogger = createLogger("Discord");

module.exports = (client) => {
  client.on("interactionCreate", async (interaction) => {
    // Autocomplete interactions
    // Handled separately because they don't support reply/defer
    // and should not go through the permission middleware.
    if (interaction.isAutocomplete()) {
      const command = client.commands?.get(interaction.commandName);
      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        discordLogger.error(`Autocomplete error for ${interaction.commandName}:`, error);
      }
      return;
    }

    // Slash command interactions
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands?.get(interaction.commandName);
    if (!command) return;

    try {
      const allowed = await permissionMiddleware(interaction, command);
      if (!allowed) return;

      await command.execute(interaction);
    } catch (error) {
      discordLogger.error(`Error executing command ${interaction.commandName}:`, error);
      const message = { content: "An error occurred while executing the command.", flags: MessageFlags.Ephemeral };
      if (interaction.replied) {
        await interaction.followUp(message);
      } else if (interaction.deferred) {
        await interaction.editReply(message);
      } else {
        await interaction.reply(message);
      }
    }
  });
};

