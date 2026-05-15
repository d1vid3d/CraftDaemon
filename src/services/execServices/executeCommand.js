//  executeCommand.js  -  Centralized /exec execution layer - v1.3.0
//  Every /exec invocation flows through this function.
//  The pipeline:
//    1. Check RCON availability
//    2. Inject tellraw (if applicable)
//    3. Send command via RCON
//    4. Log execution
//    5. Return result
//
//  /exec should NEVER call RCON directly.
//  Always: /exec → executeCommand() → middleware → RconManager → RCON

"use strict";

const { rconSend } = require("../rconQuery");
const { injectTellraw } = require("./tellrawInjector");
const { logExecution } = require("./commandLogger");
const { createLogger } = require("../logger");

const execLogger = createLogger("Exec");

// We need a reference to rconManager to check connection state.
// This is wired at runtime from rconQuery's module-level reference.

/**
 * @param {Object} options
 * @param {import("discord.js").User} options.user          - The Discord user executing the command.
 * @param {string}                    options.command       - The Minecraft command to execute.
 * @param {boolean}                   [options.silent=false] - Whether to skip tellraw injection.
 * @param {boolean}                   [options.requiresConfirmation=false] - Whether this command went through confirmation.
 * @returns {Promise<{ success: boolean, response?: string, error?: string }>}
 */
async function executeCommand({ user, command, silent = false, requiresConfirmation = false }) {
    const username = user.tag || user.username;

    execLogger.info(`Executing command for ${username}: ${command}`);

    // Step 1: Inject tellraw
    await injectTellraw({
        username,
        command,
        silent,
        sendFn: rconSend,
    });

    // Step 2: Send command via RCON
    let response;
    let success;

    try {
        response = await rconSend(command);

        // rconSend returns null on failure (it catches internally).
        if (response === null) {
            success = false;
            response = undefined;
        } else {
            success = true;
        }
    } catch (err) {
        execLogger.error(`RCON command execution failed: ${err.message}`);
        success = false;
    }

    // Step 3: Log execution
    logExecution({
        userId: user.id,
        username,
        command,
        success,
        requiresConfirmation,
        silent,
    });

    // Step 4: Return result
    if (success) {
        execLogger.info(`Command executed successfully: ${command} → ${response}`);
        return { success: true, response: response || "(Responseless Command, Check Logs Instead.)" };
    }

    const errorMsg = "RCON is currently unavailable. The server may be offline or reconnecting.";
    execLogger.warn(`Command execution failed for "${command}": ${errorMsg}`);
    return { success: false, error: errorMsg };
}

module.exports = { executeCommand };
