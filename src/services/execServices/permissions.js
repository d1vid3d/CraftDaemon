//  permissions.js  -  Exec-specific permission resolver - v1.3.0
//
//  Resolves whether a user's RBAC role allows them to execute a
//  specific Minecraft command via /exec.
//
//  This does NOT replace the existing RBAC middleware - it layers
//  on top. The RBAC middleware gates access to /exec itself;
//  this module gates which Minecraft commands are allowed per role.

"use strict";

const permissionConfig = require("../../../config/permission-config");
const { createLogger } = require("../logger");

const execLogger = createLogger("Exec");

/**
 * Resolves the user's effective exec role based on the existing RBAC system.
 * Checks: owner override → role membership.
 * Returns the highest-privilege matching role key, or null.
 *
 * @param {import("discord.js").GuildMember} member
 * @param {string} userId
 * @returns {string|null} Role key (e.g. "ADMIN", "MOD") or "OWNER", or null.
 */
function resolveExecRole(member, userId) {
    // Owner override — always highest privilege.
    if (permissionConfig.owner.includes(userId)) {
        return "OWNER";
    }

    // Check roles from highest to lowest privilege.
    // The order is defined in permissionConfig.rolePriority.
    const rolePriority = permissionConfig.rolePriority || [];

    for (const roleKey of rolePriority) {
        const roleId = permissionConfig.roles[roleKey];
        if (roleId && member.roles?.cache?.has(roleId)) {
            return roleKey;
        }
    }

    return null;
}

/**
 * Checks whether a user with a given exec role is allowed to execute
 * a specific Minecraft command.
 *
 * @param {string} execRole       - The resolved role key ("OWNER", "ADMIN", "MOD").
 * @param {string} minecraftCommand - The full Minecraft command string.
 * @returns {boolean}
 */
function isCommandAllowed(execRole, minecraftCommand) {
    if (!execRole) return false;

    // Owners can run everything (not blocked by this layer — blocked commands
    // are checked separately in blacklist.js).
    if (execRole === "OWNER") return true;

    const allowedCommands = permissionConfig.exec.allowlist[execRole];
    if (!allowedCommands) return false;

    // Wildcard: unrestricted access.
    if (allowedCommands.includes("*")) return true;

    // Check base command match.
    const baseCommand = minecraftCommand.trim().split(/\s+/)[0].toLowerCase();
    return allowedCommands.some((cmd) => cmd.toLowerCase() === baseCommand);
}

/**
 * Full permission check for /exec — combines role resolution + command allowlist.
 *
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {string} minecraftCommand
 * @returns {{ allowed: boolean, role: string|null, reason?: string }}
 */
function checkExecPermission(interaction, minecraftCommand) {
    const userId = interaction.user.id;
    const member = interaction.member;

    const role = resolveExecRole(member, userId);

    if (!role) {
        execLogger.debug(`Exec denied for ${interaction.user.tag}: no exec role.`);
        return { allowed: false, role: null, reason: "You do not have a role with exec permissions." };
    }

    if (!isCommandAllowed(role, minecraftCommand)) {
        execLogger.debug(`Exec denied for ${interaction.user.tag} (role: ${role}): command "${minecraftCommand}" not in allowlist.`);
        return {
            allowed: false,
            role,
            reason: `Your role (${role}) does not have permission to execute \`${minecraftCommand.split(/\s+/)[0]}\`.`,
        };
    }

    return { allowed: true, role };
}

function resolveExecPermissions(command, userId, member, permConfig) {
    const role = resolveExecRole(member, userId);
    if (!role) return false;
    if (role === "OWNER") return true;
    const allowedCommands = permConfig.exec.allowlist[role];
    if (!allowedCommands) return false;
    if (allowedCommands.includes("*")) return true;
    return allowedCommands.some(cmd => cmd.toLowerCase() === command.toLowerCase());
}

module.exports = { resolveExecRole, isCommandAllowed, checkExecPermission, resolveExecPermissions };
