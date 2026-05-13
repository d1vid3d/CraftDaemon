//  /exec command,  Remote Minecraft command execution v1.3.0
//  Sends Minecraft console commands through RCON with:
//    - Exec-specific permission allowlist
//    - Blocked / dangerous command checks
//    - Confirmation prompts for dangerous commands
//    - Tellraw in-game visibility
//    - JSONL execution logging
//    - Autocomplete for Minecraft commands
//    - Silent mode (Admin/Owner only)

const { SlashCommandBuilder } = require("discord.js");
const { createLogger } = require("../services/logger");
const { checkExecPermission, resolveExecRole } = require("../services/execServices/permissions");
const { isBlocked, isDangerous } = require("../services/execServices/blacklist");
const { requestConfirmation } = require("../services/execServices/confirmations");
const { executeCommand } = require("../services/execServices/executeCommand");
const { getAutocompleteResults } = require("../services/execServices/commandAutocomplete");

const execLogger = createLogger("Exec");

module.exports = {
    permission: "admin.exec",
    data: new SlashCommandBuilder()
        .setName("exec")
        .setDescription("Execute a Minecraft server command via RCON")
        .addStringOption((option) =>
            option
                .setName("command")
                .setDescription("The Minecraft command to execute")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addBooleanOption((option) =>
            option
                .setName("silent")
                .setDescription("Execute without in-game announcement (Admin/Owner only)")
                .setRequired(false)
        ),

    /**
     * Autocomplete handler for the `command` option.
     *
     * @param {import("discord.js").AutocompleteInteraction} interaction
     */
    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        const results = getAutocompleteResults(focused);
        await interaction.respond(results);
    },

    /**
     * Main execution handler.
     *
     * @param {import("discord.js").ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        const command = interaction.options.getString("command", true).trim();
        const silent = interaction.options.getBoolean("silent") || false;

        execLogger.info(`/exec from ${interaction.user.tag}: ${command}${silent ? " (silent)" : ""}`);

        // Step 1: Exec-specific permission check
        const permResult = checkExecPermission(interaction, command);
        if (!permResult.allowed) {
            return interaction.reply({
                embeds: [{
                    title: "🔒 Permission Denied",
                    description: permResult.reason,
                    color: 0xff0000,
                }],
                ephemeral: true,
            });
        }

        // Step 2: Silent mode restriction
        // Only ADMIN and OWNER may use silent mode.
        if (silent && !["ADMIN", "OWNER"].includes(permResult.role)) {
            return interaction.reply({
                content: "❌ Silent execution requires **Admin** or higher.",
                ephemeral: true,
            });
        }

        // Step 3: Blocked command check
        if (isBlocked(command)) {
            return interaction.reply({
                embeds: [{
                    title: "🚫 Blocked Command",
                    description: [
                        `The command \`${command}\` is **blocked** and cannot be executed through the bot.`,
                        "",
                        "This restriction is set in `permission-config.js` (exec section).",
                    ].join("\n"),
                    color: 0xff0000,
                }],
                ephemeral: true,
            });
        }

        // Step 4: Dangerous command confirmation
        if (isDangerous(command)) {
            const confirmed = await requestConfirmation(interaction, command);
            if (!confirmed) return;

            // After confirmation, the interaction has already been replied to.
            // We need to follow up with the execution result.
            const result = await executeCommand({
                user: interaction.user,
                command,
                silent,
                requiresConfirmation: true,
            });

            return interaction.followUp({ embeds: [buildResultEmbed(interaction, command, result, silent)] });
        }

        // Step 5: Normal execution
        await interaction.deferReply();

        const result = await executeCommand({
            user: interaction.user,
            command,
            silent,
            requiresConfirmation: false,
        });

        return interaction.editReply({ embeds: [buildResultEmbed(interaction, command, result, silent)] });
    },
};

/**
 * Builds the execution result embed.
 *
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {string} command
 * @param {{ success: boolean, response?: string, error?: string }} result
 * @param {boolean} silent
 * @returns {Object} Discord embed object.
 */
function buildResultEmbed(interaction, command, result, silent) {
    if (result.success) {
        return {
            title: "✅ Executed Successfully",
            fields: [
                { name: "Executor", value: interaction.user.tag, inline: true },
                { name: "Silent", value: silent ? "Yes" : "No", inline: true },
                { name: "Command", value: `\`${command}\`` },
                { name: "Response", value: `\`\`\`\n${result.response}\n\`\`\`` },
            ],
            color: 0x0042A3,
            timestamp: new Date().toISOString(),
        };
    }

    return {
        title: "❌ Execution Failed",
        fields: [
            { name: "Executor", value: interaction.user.tag, inline: true },
            { name: "Command", value: `\`${command}\`` },
            { name: "Error", value: result.error || "Unknown error" },
        ],
        color: 0xff0000,
        timestamp: new Date().toISOString(),
    };
}
