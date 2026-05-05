//  RBAC permission configuration

// This file defines the role-based access control (RBAC) configuration for the bot's commands.
// It specifies which users and roles have permission to execute each command, allowing for fine-grained control over who can do what with the bot.
// The configuration is structured to allow for easy reference and maintenance, with descriptive keys for roles and commands. User-specific overrides take precedence over role-based permissions, enabling exceptions without modifying role assignments.

module.exports = {
  owner: ["123456789012345678"], // Replace with your Discord user ID(s) who should have owner-level access to all commands

  // List your role IDs here with descriptive keys for easier reference in command permissions (You can add as many roles as needed)
  roles: {
    ADMIN: "111111111111111111",
    MOD: "222222222222222222",
    // Add more...
  },
  // Define command permissions by referencing the role keys above
  commands: {
    
    // Default CraftDaemon commands (adjust as desired)
    "server.start": ["ADMIN", "MOD"],
    "server.stop": ["ADMIN", "MOD"],
    "server.status": ["ADMIN", "MOD"],
    "server.address": ["ADMIN", "MOD"],
    "server.restart": ["ADMIN"],
    "bot.checkUpdate": ["ADMIN", "MOD"],
    // Adjust key mappings..
  },

  // User-specific overrides (takes precedence over role-based permissions)
  // Use case: If you want to add yourself or another user as an exception to the role-based permissions without giving them a specific role
  users: {
    "444444444444444444": ["logs.delete"] // user-specific override
    // Add more...
  }
};

