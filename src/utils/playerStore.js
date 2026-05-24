"use strict";

const fs = require("fs");
const path = require("path");

const STORE_PATH = path.resolve(process.cwd(), "logs", "players.json");

let store = {};
store = load();
let pendingSave = Promise.resolve();

function load() {
    let nextStore = {};

    try {
        const raw = fs.readFileSync(STORE_PATH, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            store = {};
            return store;
        }
        nextStore = parsed;
    } catch {
        nextStore = {};
    }

    store = nextStore;
    return store;
}

function save(nextStore = store) {
    const snapshot = `${JSON.stringify(nextStore, null, 2)}\n`;
    const dir = path.dirname(STORE_PATH);

    pendingSave = pendingSave
        .catch(() => {})
        .then(async () => {
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(STORE_PATH, snapshot, "utf8");
        });

    return pendingSave;
}

function updatePlayers(onlinePlayers) {
    const now = new Date().toISOString();
    const onlineSet = new Set(
        Array.isArray(onlinePlayers)
            ? onlinePlayers.filter((name) => typeof name === "string" && name.trim())
            : []
    );

    for (const name of onlineSet) {
        const existing = store[name];
        if (!existing || typeof existing !== "object") {
            store[name] = {
                firstSeen: now,
                lastSeen: now,
                online: true,
            };
            continue;
        }

        if (!existing.firstSeen) existing.firstSeen = now;
        existing.lastSeen = now;
        existing.online = true;
    }

    for (const [name, data] of Object.entries(store)) {
        if (!onlineSet.has(name)) {
            data.online = false;
        }
    }

    return save(store);
}

function getPlayer(name) {
    if (!Object.prototype.hasOwnProperty.call(store, name)) {
        return null;
    }

    return { ...store[name] };
}

function getAllPlayers() {
    return Object.fromEntries(
        Object.entries(store).map(([name, data]) => [name, { ...data }])
    );
}

module.exports = {
    STORE_PATH,
    load,
    save,
    updatePlayers,
    getPlayer,
    getAllPlayers,
};
