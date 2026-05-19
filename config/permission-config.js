// [RBAC COMMANDS PERMISSION CONFIG]

// Be careful when editing this file! Incorrect permissions can lead to security risks or unintended access.
// Always double-check role keys and command mappings, and consider testing changes in a safe environment before deploying to production.

// This file defines the role-based access control (RBAC) configuration for the bot's commands.
// It specifies which users and roles have permission to execute each command, allowing for fine-grained control over who can do what with the bot.
// The configuration is structured to allow for easy reference and maintenance, with descriptive keys for roles and commands. User-specific overrides take precedence over role-based permissions, enabling exceptions without modifying role assignments.

module.exports = {
  owner: ["123456789012345678"], // Replace with your Discord user ID(s) who should have owner-level access to all commands

  // List your role IDs here with descriptive keys for easier reference in command permissions (You can add as many roles as needed)
  // For consistency and maintainability, use uppercase keys that clearly indicate the role's purpose (e.g., ADMIN, MODERATOR, HELPER).
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
    "server.restart": ["ADMIN", "MOD"],
    "bot.checkUpdate": ["ADMIN", "MOD"],
    "admin.logs": ["ADMIN", "MOD"],
    "admin.exec": ["ADMIN", "MOD"],
    // Adjust key mappings..
  },

  // User-specific overrides (takes precedence over role-based permissions)
  // Use case: If you want to add yourself or another user as an exception to the role-based permissions without giving them a specific role
  users: {
    "444444444444444444": ["server.start"] // user-specific override
    // Add more...
  },


  // [EXEC-SPECIFIC CONFIG]

  // These settings extend the existing RBAC system with exec-specific
  // allowlists and safety lists for the /exec command.

  // Extremely configurable, works with non-vanilla commands, but be very careful when modifying these!
  // Incorrect settings can lead to security risks or unintended command access.
  // Always double-check command lists and test changes in a safe environment before deploying to production.

  // Role Priority
  // Defines the order of role precedence for exec permission resolution.
  // Checked from left to right; the first matching role is returned.
  // Should contain all role keys defined above (except OWNER).

  rolePriority: ["ADMIN", "MOD"],

  // Exec Command Allowlist
  // Maps role keys to arrays of allowed Minecraft commands.
  // Use '*' for unrestricted access to all non-blocked commands.

  exec: {
    allowlist: {
      MOD: ["say", "kick", "time", "weather", "list", "tell", "msg", "w", "me"],
      ADMIN: ["*"],
      // Add more roles and their allowed commands as needed
      // Owner gets '*' via the RBAC owner override — no entry needed.
    },

    // Dangerous Commands
    // Commands that require confirmation before execution.
    // Anyone with exec permission can run these, but they get a
    // confirmation prompt first.

    // [IMPORTANT] 
    dangerousCommands: [
      "stop",
      "op",
      "deop",
      "whitelist off",
      "ban",
      "pardon",
      "reload",
      "ban-ip",
      "clear",
      "summon",
      "give",
      "tp",
      "kill",
      // Add more as needed...
    ],

    // Blocked Commands
    // Completely blocked, no one can execute these through /exec,
    // regardless of role. Hard safety net.
    // If a command appears in both lists, blockedCommands takes precedence.

    // [IMPORTANT]
    blockedCommands: [
      "stop",
      "reload",
      // Add more as needed...
    ],

    // Silent Mode Roles
    // Defines which roles are allowed to use the silent flag for /exec commands.
    // OWNER is always allowed silently and doesn't need to be listed here.
    silentRoles: ["ADMIN", "MOD"] // Map more roles as needed..
  }
};