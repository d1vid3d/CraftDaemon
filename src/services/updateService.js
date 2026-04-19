// Service responsible for checking GitHub releases and notifying guilds about updates.
// It periodically polls the GitHub API for the latest release and compares it with the currently running version.
// If a new release is detected, it sends a notification message to a suitable channel in each guild (if permissions allow) and records that the guild has been notified about that version.

const fs = require("fs");
const path = require("path");
const semver = require("semver");
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const { createLogger } = require("./logger");
const { getLastNotifiedVersion, setLastNotifiedVersion } = require("../utils/storage");

const updateLogger = createLogger("Updates");

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_JITTER_MAX_MS = 5 * 60 * 1000;

const STORAGE_PATH = path.join(__dirname, "../../data/guild-update-notifications.json");

/** @type {{ repo: { owner: string, repo: string }, debug: boolean, FORCE_LATEST?: string, updateNotifyChannelId: string|null }} */
const CONFIG = {
    repo: { owner: "d1vid3d", repo: "CraftDaemon" },
    debug: String(process.env.UPDATE_SERVICE_DEBUG || "").toLowerCase() === "true",
    FORCE_LATEST: process.env.UPDATE_SERVICE_FORCE_LATEST?.trim() || undefined,
    updateNotifyChannelId: process.env.UPDATE_NOTIFY_CHANNEL_ID?.trim() || null,
};

const PACKAGE_JSON_PATH = path.join(__dirname, "../../package.json");

let cachedEtag = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let jitterTimer = null;
/** @type {ReturnType<typeof setInterval>|null} */
let pollInterval = null;
function readLocalPackageVersion() {
    const raw = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
    const pkg = JSON.parse(raw);
    const v = pkg?.version;
    if (typeof v !== "string" || !semver.valid(v)) {
        throw new Error(`Invalid or missing semver in package.json: ${String(v)}`);
    }
    return v;
}

function normalizeGithubTag(tagName) {
    const t = String(tagName || "").trim();
    if (t.startsWith("v") || t.startsWith("V")) return t.slice(1);
    return t;
}

function releasesLatestUrl() {
    const { owner, repo } = CONFIG.repo;
    return `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
}

/**
 * @returns {Promise<{ kind: "not-modified" } | { kind: "release", latestVersion: string, htmlUrl: string, etag: string | null } | { kind: "error", message: string }>}
 */
async function fetchLatestReleaseFromGithub() {
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CraftDaemon-UpdateService",
    };
    if (cachedEtag) headers["If-None-Match"] = cachedEtag;

    const res = await fetch(releasesLatestUrl(), { headers });

    if (res.status === 304) {
        return { kind: "not-modified" };
    }

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
            kind: "error",
            message: `GitHub API ${res.status}: ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
        };
    }

    const newEtag = res.headers.get("etag");
    if (newEtag) cachedEtag = newEtag;

    let data;
    try {
        data = await res.json();
    } catch {
        return { kind: "error", message: "Failed to parse GitHub release JSON" };
    }

    const tagName = data?.tag_name;
    const fallbackUrl = `https://github.com/${CONFIG.repo.owner}/${CONFIG.repo.repo}/releases/latest`;
    const htmlUrl = typeof data?.html_url === "string" ? data.html_url : fallbackUrl;

    const normalized = normalizeGithubTag(tagName);
    if (!semver.valid(normalized)) {
        return { kind: "error", message: `Latest release tag is not valid semver after normalization: ${String(tagName)}` };
    }

    return {
        kind: "release",
        latestVersion: normalized,
        htmlUrl,
        etag: newEtag,
    };
}

const NOTIFY_PERMS =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.SendMessages |
    PermissionFlagsBits.EmbedLinks;

/**
 * @param {import("discord.js").GuildChannel|import("discord.js").ThreadChannel} ch
 * @param {import("discord.js").User} me
 * @returns {boolean}
 */
function channelCanPostUpdateEmbed(ch, me) {
    const p = ch.permissionsFor?.(me);
    if (!p) return false;
    return p.has(NOTIFY_PERMS);
}

/**
 * Picks where to post update embeds for this guild.
 * If `UPDATE_NOTIFY_CHANNEL_ID` is set and that channel exists in this guild and the bot can post embeds there, it is used.
 * Otherwise: system channel, then first text/announcement channel (by position) with the same permission set.
 *
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").Client} client
 * @returns {Promise<import("discord.js").GuildTextBasedChannel|null>}
 */
async function resolveNotifyChannel(guild, client) {
    const me = client.user;
    if (!me) return null;

    const configuredId = CONFIG.updateNotifyChannelId;
    if (configuredId) {
        try {
            const configured = await guild.channels.fetch(configuredId).catch(() => null);
            if (
                configured &&
                configured.isTextBased() &&
                (configured.type === ChannelType.GuildText || configured.type === ChannelType.GuildAnnouncement)
            ) {
                if (channelCanPostUpdateEmbed(configured, me)) {
                    return /** @type {import("discord.js").GuildTextBasedChannel} */ (configured);
                }
            }
        } catch {
            // Fall through to automatic resolution.
        }
    }

    const system = guild.systemChannel;
    if (system && system.isTextBased() && channelCanPostUpdateEmbed(system, me)) {
        return /** @type {import("discord.js").GuildTextBasedChannel} */ (system);
    }

    const candidates = guild.channels.cache
        .filter(
            (ch) =>
                ch &&
                (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) &&
                ch.isTextBased()
        )
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

    for (const ch of candidates.values()) {
        if (channelCanPostUpdateEmbed(ch, me)) {
            return /** @type {import("discord.js").GuildTextBasedChannel} */ (ch);
        }
    }

    return null;
}

/**
 * @param {import("discord.js").Client} client
 * @param {{ manual?: boolean }} [options]
 * @returns {Promise<{ notified: boolean, summary: string }>}
 */
async function runUpdateCheck(client, options = {}) {
    const manual = Boolean(options.manual);
    try {
        let currentVersion;
        try {
            currentVersion = readLocalPackageVersion();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            updateLogger.error(`Update check failed reading package.json: ${msg}`);
            return { notified: false, summary: `Error reading package.json: ${msg}` };
        }

        let fetchResult;
        if (CONFIG.debug && CONFIG.FORCE_LATEST) {
            const forced = normalizeGithubTag(CONFIG.FORCE_LATEST);
            if (!semver.valid(forced)) {
                updateLogger.error(`FORCE_LATEST is not valid semver: ${CONFIG.FORCE_LATEST}`);
                return { notified: false, summary: `Invalid FORCE_LATEST semver: ${CONFIG.FORCE_LATEST}` };
            }
            const mockUrl = `https://github.com/${CONFIG.repo.owner}/${CONFIG.repo.repo}/releases/latest`;
            fetchResult = { kind: "release", latestVersion: forced, htmlUrl: mockUrl, etag: null };
        } else {
            try {
                fetchResult = await fetchLatestReleaseFromGithub();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                updateLogger.error(`Update check GitHub request failed: ${msg}`);
                return { notified: false, summary: `GitHub request failed: ${msg}` };
            }
        }

        if (fetchResult.kind === "not-modified") {
            if (manual) {
                return { notified: false, summary: "Release metadata unchanged since last successful fetch (304)." };
            }
            return { notified: false, summary: "" };
        }

        if (fetchResult.kind === "error") {
            updateLogger.error(fetchResult.message);
            return { notified: false, summary: fetchResult.message };
        }

        const latestVersion = fetchResult.latestVersion;

        if (!semver.gt(latestVersion, currentVersion)) {
            if (manual) {
                return {
                    notified: false,
                    summary: `GitHub latest is \`${latestVersion}\`; this instance runs \`${currentVersion}\` (no newer published release).`,
                };
            }
            return { notified: false, summary: "" };
        }

        updateLogger.info(`New GitHub release detected: ${currentVersion} → ${latestVersion}`);

        let notifiedAny = false;
        for (const guild of client.guilds.cache.values()) {
            try {
                const last = getLastNotifiedVersion(STORAGE_PATH, guild.id);
                if (last === latestVersion) continue;

                const channel = await resolveNotifyChannel(guild, client);
                if (!channel) continue;

                const embed = new EmbedBuilder()
                    .setTitle("CraftDaemon update available")
                    .setColor(0x5865f2)
                    .setDescription(
                        `A newer release is published on GitHub.\n\n**Current (running) version:** \`${currentVersion}\`\n**Latest release:** \`${latestVersion}\`\n\n[View release](${fetchResult.htmlUrl})`
                    )
                    .setTimestamp(new Date());

                await channel.send({ embeds: [embed] });
                setLastNotifiedVersion(STORAGE_PATH, guild.id, latestVersion);
                notifiedAny = true;
            } catch {
                // Isolated per guild; do not interrupt other guilds or crash the bot.
            }
        }

        if (manual) {
            return {
                notified: notifiedAny,
                summary: notifiedAny
                    ? `Notified guilds where needed: **${latestVersion}** is newer than **${currentVersion}**.`
                    : `Update **${latestVersion}** is newer than running **${currentVersion}**, but no guilds were notified (missing channel or permissions, or already notified).`,
            };
        }

        return { notified: notifiedAny, summary: "" };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateLogger.error(`Update check failed unexpectedly: ${msg}`);
        return { notified: false, summary: manual ? msg : "" };
    }
}

function schedulePolling(client) {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
        void runUpdateCheck(client, { manual: false }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            updateLogger.error(`Scheduled update check crashed: ${msg}`);
        });
    }, POLL_INTERVAL_MS);
}

/**
 * @param {import("discord.js").Client} client
 */
function init(client) {
    const jitterMs = Math.floor(Math.random() * (STARTUP_JITTER_MAX_MS + 1));
    const channelHint = CONFIG.updateNotifyChannelId
        ? `notify channel id ${CONFIG.updateNotifyChannelId} (per guild when present; else automatic)`
        : "notify channel automatic (system channel or first suitable text channel)";
    updateLogger.info(
        `Update notification service initialized (repo ${CONFIG.repo.owner}/${CONFIG.repo.repo}, poll every ${POLL_INTERVAL_MS / 60_000} min, startup jitter ${Math.round(jitterMs / 1000)}s, ${channelHint})`
    );

    if (jitterTimer) clearTimeout(jitterTimer);
    jitterTimer = setTimeout(() => {
        void runUpdateCheck(client, { manual: false }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            updateLogger.error(`Initial update check crashed: ${msg}`);
        });
        schedulePolling(client);
    }, jitterMs);
}

function destroy() {
    if (jitterTimer) clearTimeout(jitterTimer);
    jitterTimer = null;
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = null;
}

module.exports = {
    init,
    destroy,
    runUpdateCheck,
    CONFIG,
    STORAGE_PATH,
};
