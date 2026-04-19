// ================================================================
//  permissions resolver
// ================================================================
// This module contains the core logic for resolving whether a user has permission to execute a given command based on the RBAC configuration.
// It evaluates the permission checks in a specific order (owner override, user-specific override, command registration, role checks) and includes detailed debug logging to help trace permission
// decisions during development and troubleshooting. The resolver is designed to be used by the permissions middleware, which integrates it into the command handling flow.

const { createLogger } = require("../services/logger");

const permissionLogger = createLogger("Permissions");

function shouldDebugPerms() {
  return String(process.env.DEBUG_PERMS).toLowerCase() === "true";
}

function debugPerms(interaction, payload) {
  if (!shouldDebugPerms()) return;
  // Required debug payload: { user: userId, command: permission, allowed: result }
  const line = JSON.stringify({
    allowed: payload.allowed,
    command: payload.command ?? null,
    guild: interaction.guildId ?? null,
    user: payload.user ?? null,
  });
  // Use INFO so DEBUG_PERMS is visible even when LOG_LEVEL=INFO (common in production).
  permissionLogger.info(`RBAC ${line}`);
}

function hasPermission(interaction, permission, config) {
  // Edge Case: DM Usage
  if (!interaction.inGuild()) {
    debugPerms(interaction, { user: interaction.user?.id, command: permission, allowed: false });
    return false;
  }

  const userId = interaction.user.id;
  const member = interaction.member;

  // 1. OWNER OVERRIDE
  if (config.owner.includes(userId)) {
    debugPerms(interaction, { user: userId, command: permission, allowed: true });
    return true;
  }

  // 2. NO PERMISSION REQUIRED
  if (!permission) {
    debugPerms(interaction, { user: userId, command: permission, allowed: true });
    return true;
  }

  // 3. USER-SPECIFIC OVERRIDE
  if (config.users[userId]?.includes(permission)) {
    debugPerms(interaction, { user: userId, command: permission, allowed: true });
    return true;
  }

  // 4. COMMAND NOT REGISTERED (Strict Fail)
  const allowedGroups = config.commands[permission];
  if (!allowedGroups) {
    debugPerms(interaction, { user: userId, command: permission, allowed: false });
    return false;
  }

  // 5. ROLE CHECK
  for (const group of allowedGroups) {
    const roleId = config.roles[group];
    if (!roleId) continue; // Edge Case: Role deleted/missing from config

    if (member.roles?.cache?.has(roleId)) {
      debugPerms(interaction, { user: userId, command: permission, allowed: true });
      return true;
    }
  }

  debugPerms(interaction, { user: userId, command: permission, allowed: false });
  return false;
}

module.exports = { hasPermission };

