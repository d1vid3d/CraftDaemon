//  confirmations.js  -  Dangerous command confirmation flow - v1.3.0
//  When a dangerous command is detected, this module sends a
//  confirmation prompt with Confirm/Cancel buttons and waits
//  for user interaction (up to 60 seconds).

"use strict";

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require("discord.js");
const { createLogger } = require("../logger");

const execLogger = createLogger("Exec");

const CONFIRMATION_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Sends a confirmation prompt for a dangerous command and waits for the
 * user's response (Confirm or Cancel).
 *
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {string} command - The dangerous Minecraft command.
 * @returns {Promise<boolean>} true if confirmed, false if cancelled/timed out.
 */
async function requestConfirmation(interaction, command) {
    const confirmButton = new ButtonBuilder()
        .setCustomId("exec_confirm")
        .setLabel("Confirm")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("✅");

    const cancelButton = new ButtonBuilder()
        .setCustomId("exec_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌");

    const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

    const confirmMsg = await interaction.reply({
        embeds: [{
            title: "⚠️ Dangerous Command",
            description: [
                "This command is marked as **dangerous** and requires confirmation.",
                "",
                `**Command:** \`${command}\``,
                "",
                "Press **Confirm** to execute or **Cancel** to abort.",
            ].join("\n"),
            color: 0xffcc00,
            footer: { text: `Expires in ${CONFIRMATION_TIMEOUT_MS / 1000}s` },
            timestamp: new Date().toISOString(),
        }],
        components: [row],
        fetchReply: true,
    });

    try {
        // Only the original user can confirm/cancel.
        const collected = await confirmMsg.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id,
            time: CONFIRMATION_TIMEOUT_MS,
        });

        // Disable buttons after interaction.
        const disabledRow = new ActionRowBuilder().addComponents(
            confirmButton.setDisabled(true),
            cancelButton.setDisabled(true)
        );

        if (collected.customId === "exec_confirm") {
            await collected.update({
                embeds: [{
                    title: "✅ Confirmed",
                    description: `Executing \`${command}\`...`,
                    color: 0x00ff66,
                }],
                components: [disabledRow],
            });
            execLogger.info(`Dangerous command confirmed by ${interaction.user.tag}: ${command}`);
            return true;
        }

        // Cancel
        await collected.update({
            embeds: [{
                title: "❌ Cancelled",
                description: `Command \`${command}\` was cancelled.`,
                color: 0xff0000,
            }],
            components: [disabledRow],
        });
        execLogger.info(`Dangerous command cancelled by ${interaction.user.tag}: ${command}`);
        return false;

    } catch (err) {
        // Timeout - no interaction received within 60s.
        execLogger.info(`Confirmation timed out for command: ${command}`);

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("exec_confirm")
                .setLabel("Confirm")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("✅")
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId("exec_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("❌")
                .setDisabled(true)
        );

        try {
            await interaction.editReply({
                embeds: [{
                    title: "⏰ Confirmation Expired",
                    description: `Command \`${command}\` was not confirmed in time.`,
                    color: 0x808080,
                }],
                components: [disabledRow],
            });
        } catch (_) {
            // Message may have been deleted - ignore.
        }

        return false;
    }
}

module.exports = { requestConfirmation, CONFIRMATION_TIMEOUT_MS };
