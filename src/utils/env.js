"use strict";

function getEnvInt(name, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw.trim() === "") return fallback;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function getEnvString(name, fallback = "") {
    const raw = process.env[name];
    if (raw === undefined || raw === null) return fallback;
    const trimmed = raw.trim();
    return trimmed === "" ? fallback : trimmed;
}

function getEnvBool(name, fallback = false) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw.trim() === "") return fallback;
    return raw.trim().toLowerCase() === "true";
}

function getEnvFloat(name, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw.trim() === "") return fallback;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

module.exports = { getEnvInt, getEnvString, getEnvBool, getEnvFloat };