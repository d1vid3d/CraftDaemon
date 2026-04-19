// ================================================================
//  permissions middleware
// ================================================================
// This middleware function checks if the user has the required permissions to execute a command.
// It should be used in the command handling logic before executing any command-specific code. If the user does not have permission, it sends an ephemeral reply and prevents further execution of the command.

const { hasPermission } = require("./resolver");
const config = require("../../config/permission-config");

async function permissionMiddleware(interaction, command) {
  if (!hasPermission(interaction, command.permission, config)) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true
    });
    return false;
  }
  return true;
}

module.exports = { permissionMiddleware };

