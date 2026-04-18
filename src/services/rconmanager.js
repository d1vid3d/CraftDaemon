// ============================================================
//  RconManager.js  |  Persistent RCON Connection Manager
//  Part of CraftDaemon v1.2.0
//
//  Replaces the old stateless "connect → run → disconnect" pattern
//  with a long-lived socket connection that:
//    - Sends periodic keepalive "list" commands to maintain the link
//      and feed live player-count data to the presence system
//    - Detects disconnection and automatically reconnects on a fixed
//      5-second interval without leaking timers or event listeners
//    - Exposes a clean async sendCommand() API so the rest of the bot
//      never has to think about connection state
//
//  Why a class instead of a plain module?
//    A class gives us a single, explicit owner of the socket reference,
//    all timers, and all state flags. This makes it trivial to destroy
//    and recreate the manager in tests, or to have future per-server
//    instances without any global-variable collisions.
// ============================================================

"use strict";

const Rcon = require("rcon");
const { createLogger } = require("./logger");

const rconLogger = createLogger("RCON");

// ── Tuneable constants ───────────────────────────────────────
//  These are intentionally module-level rather than constructor
//  arguments so they can be overridden in unit tests via jest.mock
//  or by simply editing this one place.

/** Default: how often (ms) to send a keepalive "list" command while connected. */
const DEFAULT_KEEPALIVE_INTERVAL_MS = 45_000; // 45 s — sits comfortably between 30 and 60 s

/** Default: how long (ms) to wait between reconnect attempts when offline. */
const DEFAULT_RECONNECT_INTERVAL_MS = 5_000;

/**
 * How long (ms) to hold the "Server Starting…" presence after a
 * successful reconnect before switching to the live player count.
 * Gives the Minecraft server time to finish loading world data even
 * though RCON has already accepted the socket.
 */
const DEFAULT_STARTING_GRACE_PERIOD_MS = 10_000;

/** Default per-command timeout (ms). */
const DEFAULT_COMMAND_TIMEOUT_MS = 8_000;

/**
 * Consecutive keepalive failures before forcing a reconnect.
 * A single timeout can happen under transient load and should not tear down
 * an otherwise healthy persistent socket.
 */
const DEFAULT_MAX_KEEPALIVE_FAILURES = 2;
/** Default cadence for ECONNREFUSED warning logs while retrying. */
const DEFAULT_REFUSED_LOG_INTERVAL_MS = 60_000;

// ── Connection states ────────────────────────────────────────
//  Using a string enum rather than bare booleans so log messages and
//  external consumers can describe state unambiguously.

/** @enum {string} */
const State = Object.freeze({
    DISCONNECTED: "DISCONNECTED",
    CONNECTING:   "CONNECTING",
    CONNECTED:    "CONNECTED",
    RECONNECTING: "RECONNECTING",
});

// ============================================================

/**
 * @typedef {Object} RconManagerState
 * @property {boolean}    connected       - True only when the socket is authenticated and healthy.
 * @property {Date|null}  lastSeenOnline  - Wall-clock time of the most recent successful command.
 * @property {boolean}    reconnecting    - True while a reconnect attempt is in-flight.
 * @property {number|null} playerCount    - Most recently observed player count, or null if unknown.
 */

// ============================================================

/**
 * Manages a persistent, auto-reconnecting RCON connection to a
 * Minecraft server.
 *
 * Usage
 * -----
 * ```js
 * const manager = new RconManager({ host, port, password });
 * manager.on("playerCount", (count) => updatePresence(count));
 * manager.on("offline",     ()      => setPresenceOffline());
 * manager.start();                  // begin connection lifecycle
 *
 * // Later, to send an arbitrary command:
 * const response = await manager.sendCommand("say Hello!");
 * ```
 *
 * Events
 * ------
 * | Event          | Payload          | Description                                      |
 * |----------------|------------------|--------------------------------------------------|
 * | `connected`    | –                | Socket authenticated for the first time / after reconnect |
 * | `reconnected`  | –                | Specifically a *re*connect (was previously offline) |
 * | `disconnected` | –                | Socket lost; reconnect loop has started          |
 * | `offline`      | –                | Alias for `disconnected`, convenience for callers |
 * | `playerCount`  | `number`         | Fresh player count from each keepalive "list"    |
 * | `starting`     | –                | Fired for configured starting grace period after reconnect |
 *
 * @extends {require("events").EventEmitter}
 */
class RconManager extends require("events").EventEmitter {

    // ── Constructor ──────────────────────────────────────────

    /**
     * @param {Object} options
     * @param {string} options.host       - RCON host (e.g. "127.0.0.1")
     * @param {number} options.port       - RCON port (e.g. 25575)
     * @param {string} options.password   - RCON password
     * @param {number} [options.keepaliveIntervalMs]
     * @param {number} [options.reconnectIntervalMs]
     * @param {number} [options.startingGracePeriodMs]
     * @param {number} [options.commandTimeoutMs]
     * @param {number} [options.maxKeepaliveFailures]
     * @param {number} [options.refusedLogIntervalMs]
     */
    constructor({
        host,
        port,
        password,
        keepaliveIntervalMs = DEFAULT_KEEPALIVE_INTERVAL_MS,
        reconnectIntervalMs = DEFAULT_RECONNECT_INTERVAL_MS,
        startingGracePeriodMs = DEFAULT_STARTING_GRACE_PERIOD_MS,
        commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
        maxKeepaliveFailures = DEFAULT_MAX_KEEPALIVE_FAILURES,
        refusedLogIntervalMs = DEFAULT_REFUSED_LOG_INTERVAL_MS,
    }) {
        super();

        if (!password) {
            throw new Error("RconManager: RCON_PASSWORD must be set before constructing the manager.");
        }

        /** @private */
        this._host     = host;
        /** @private */
        this._port     = port;
        /** @private */
        this._password = password;
        /** @private */
        this._keepaliveIntervalMs = keepaliveIntervalMs;
        /** @private */
        this._reconnectIntervalMs = reconnectIntervalMs;
        /** @private */
        this._startingGracePeriodMs = startingGracePeriodMs;
        /** @private */
        this._commandTimeoutMs = commandTimeoutMs;
        /** @private */
        this._maxKeepaliveFailures = maxKeepaliveFailures;
        /** @private */
        this._refusedLogIntervalMs = refusedLogIntervalMs;

        // ── Internal state ───────────────────────────────────

        /** @private @type {string} One of the State enum values. */
        this._state = State.DISCONNECTED;

        /** @private @type {Rcon|null} Active socket, or null when disconnected. */
        this._conn = null;

        /**
         * @private
         * Whether this manager has ever successfully connected.
         * Used to distinguish a first-connect from a re-connect so
         * we only emit "starting" grace-period behaviour on reconnects.
         */
        this._hasConnectedBefore = false;

        /**
         * @private
         * Queue of pending command callbacks waiting on a `response` event.
         * We use a FIFO queue because the rcon library serialises commands
         * and fires response events in the same order they were sent.
         *
         * Each entry: { resolve: Function, reject: Function, timer: NodeJS.Timeout }
         */
        this._pendingCommands = [];

        /**
         * @private
         * setInterval handle for the keepalive loop.
         * Stored so we can clearInterval on destroy() without leaking.
         */
        this._keepaliveTimer = null;

        /**
         * @private
         * Number of consecutive keepalive failures since the last successful
         * keepalive response.
         */
        this._keepaliveFailureStreak = 0;

        /**
         * @private
         * setTimeout handle for the reconnect delay.
         * Stored so we can clearTimeout on destroy() without leaking.
         */
        this._reconnectTimer = null;

        /**
         * @private
         * setTimeout handle for the "starting" grace period after reconnect.
         */
        this._startingGraceTimer = null;

        /**
         * @private
         * Whether we are currently inside the configured starting grace window.
         * Consumers can read this via the public getter isStarting.
         */
        this._isStarting = false;

        /** @private */
        this._hasAttemptedInitialConnection = false;
        /** @private */
        this._lastRefusedLogAtMs = 0;
        /** @private */
        this._suppressedRefusedCount = 0;

        // ── Public state surface (read-only via getters) ─────

        /** @type {Date|null} */
        this.lastSeenOnline = null;

        /** @type {number|null} */
        this.playerCount = null;

        rconLogger.info(`RconManager initialised — target: ${this._host}:${this._port}`);
    }

    // ── Public getters ───────────────────────────────────────

    /** True when the socket is authenticated and healthy. */
    get connected()    { return this._state === State.CONNECTED; }

    /** True while a reconnect attempt is actively in-flight. */
    get reconnecting() { return this._state === State.RECONNECTING; }

    /**
     * True for the configured starting grace period after each successful reconnect.
     * Presence logic should show "Server starting…" during this window
     * even if RCON is technically ready, because the Minecraft world may
     * still be loading.
     */
    get isStarting()   { return this._isStarting; }

    /**
     * Returns a snapshot of current manager state suitable for logging
     * or embedding in a `/status` response.
     *
     * @returns {RconManagerState}
     */
    get snapshot() {
        return {
            connected:      this.connected,
            lastSeenOnline: this.lastSeenOnline,
            reconnecting:   this.reconnecting,
            playerCount:    this.playerCount,
        };
    }

    // ── Lifecycle ────────────────────────────────────────────

    /**
     * Starts the connection lifecycle. Call this once after the Discord
     * client has logged in.  Safe to call multiple times — subsequent
     * calls are no-ops if already running.
     */
    start() {
        if (this._state !== State.DISCONNECTED) {
            rconLogger.warn("RconManager.start() called but manager is already running — ignoring.");
            return;
        }
        rconLogger.info("RconManager starting — initiating first connection attempt.");
        this._connect();
    }

    /**
     * Gracefully tears down the manager:  clears all timers, rejects
     * any in-flight commands, and destroys the socket.
     *
     * After calling destroy() the manager should not be reused; create
     * a new instance if a fresh connection is needed.
     */
    destroy() {
        rconLogger.info("RconManager.destroy() called — shutting down.");

        // Stop all scheduled work first so nothing tries to reconnect
        // or send keepalives while we're tearing down.
        this._clearKeepaliveTimer();
        this._clearReconnectTimer();
        this._clearStartingGraceTimer();

        // Reject any callers waiting on sendCommand() so they don't hang.
        this._drainPendingCommands(new Error("RconManager destroyed."));

        this._destroySocket();
        this._state = State.DISCONNECTED;
    }

    // ── Command API ──────────────────────────────────────────

    /**
     * Sends a Minecraft console command over the persistent connection
     * and resolves with the cleaned (formatting-code-stripped) response.
     *
     * If the socket is not currently connected, the promise rejects
     * immediately — callers should check `manager.connected` first, or
     * handle the rejection, rather than buffering commands here.  (A
     * command buffer is a separate concern and can be layered on top.)
     *
     * @param {string} cmd              - The command to send (without leading slash).
     * @param {number} [timeout=this._commandTimeoutMs] - Per-call timeout override (ms).
     * @returns {Promise<string>}       - Cleaned RCON response string.
     * @throws {Error}                  - If not connected, or if the command times out.
     */
    sendCommand(cmd, timeout = this._commandTimeoutMs) {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this._conn) {
                return reject(new Error(`RconManager: cannot send command "${cmd}" — not connected.`));
            }

            let settled = false;

            // Safety timeout: if the rcon lib never fires a response event
            // (e.g. server hangs mid-auth), we must reject rather than leak.
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                // Remove this entry from the queue so the next response
                // isn't mistakenly delivered to the wrong caller.
                this._pendingCommands = this._pendingCommands.filter(e => e.timer !== timer);
                rconLogger.warn(`sendCommand("${cmd}") timed out after ${timeout}ms.`);
                reject(new Error(`RCON command timed out after ${timeout}ms.`));
            }, timeout);

            this._pendingCommands.push({
                resolve: (str) => { if (!settled) { settled = true; clearTimeout(timer); resolve(str); } },
                reject:  (err) => { if (!settled) { settled = true; clearTimeout(timer); reject(err);  } },
                timer,
                cmd,    // kept for debug logging only
            });

            try {
                rconLogger.debug(`Sending command: ${cmd}`);
                this._conn.send(cmd);
            } catch (err) {
                // send() can throw synchronously if the socket is in a bad
                // state even though _state says CONNECTED.  Clean up and let
                // the error event / end event handle the reconnect.
                rconLogger.error(`sendCommand: synchronous send() error: ${err.message}`);
                this._pendingCommands.pop();
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    // ── Private: connection setup ────────────────────────────

    /**
     * Creates a fresh Rcon socket, wires up all event listeners, and
     * calls connect().  Any previous socket must have already been
     * destroyed before calling this.
     *
     * @private
     */
    _connect() {
        // Guard: never overlap two sockets.
        if (this._conn) {
            rconLogger.warn("_connect() called while a socket already exists — destroying old one first.");
            this._destroySocket();
        }

        this._state = this._hasConnectedBefore ? State.RECONNECTING : State.CONNECTING;
        const isFirstAttempt = !this._hasAttemptedInitialConnection;
        this._hasAttemptedInitialConnection = true;
        if (isFirstAttempt) {
            rconLogger.info(`Attempting RCON connection to ${this._host}:${this._port} (state: ${this._state})`);
        } else {
            rconLogger.debug(`Attempting RCON reconnect to ${this._host}:${this._port} (state: ${this._state})`);
        }

        const conn = new Rcon(this._host, this._port, this._password);
        this._conn = conn;

        // ── Socket event handlers ────────────────────────────
        //
        //  We use named arrow functions assigned to `conn` rather than
        //  anonymous lambdas so each handler has a meaningful name in
        //  stack traces.  We also reference `conn` (the local variable)
        //  rather than `this._conn` inside handlers, because by the time
        //  a stale handler fires, `this._conn` may already point to a
        //  newer socket.  Comparing `conn === this._conn` lets us safely
        //  ignore events from decommissioned sockets.

        conn.on("auth", () => {
            if (conn !== this._conn) return; // stale socket event — ignore
            this._onAuth();
        });

        conn.on("response", (str) => {
            if (conn !== this._conn) return;
            this._onResponse(str);
        });

        conn.on("error", (err) => {
            if (conn !== this._conn) return;
            this._onError(err);
        });

        conn.on("end", () => {
            if (conn !== this._conn) return;
            this._onEnd();
        });

        try {
            conn.connect();
        } catch (err) {
            // connect() itself can throw on some platforms before the error
            // event fires.  Treat it the same as an error event.
            rconLogger.error(`connect() threw synchronously: ${err.message}`);
            this._handleDisconnect(err);
        }
    }

    // ── Private: socket event handlers ──────────────────────

    /**
     * Called when the RCON socket has successfully authenticated.
     * Transitions state to CONNECTED and starts the keepalive loop.
     *
     * @private
     */
    _onAuth() {
        const wasReconnect = this._hasConnectedBefore;
        this._hasConnectedBefore = true;
        this._state = State.CONNECTED;
        this.lastSeenOnline = new Date();
        this._keepaliveFailureStreak = 0;
        if (this._lastRefusedLogAtMs !== 0 || this._suppressedRefusedCount > 0) {
            rconLogger.info("RCON connection recovered after refusal retries.");
        }
        this._lastRefusedLogAtMs = 0;
        this._suppressedRefusedCount = 0;

        rconLogger.info(`RCON authenticated successfully${wasReconnect ? " (reconnect)" : " (initial connection)"}.`);

        if (wasReconnect) {
            // Emit generic "connected" for all callers, plus the specific
            // "reconnected" event so presence logic can apply the grace period.
            this._startStartingGracePeriod();
            this.emit("reconnected");
        }

        this.emit("connected");
        this._startKeepalive();
    }

    /**
     * Called for every RCON response packet.  Delivers the response to
     * the oldest pending command in the FIFO queue, then cleans up.
     *
     * @private
     * @param {string} raw - Raw response string from the RCON library.
     */
    _onResponse(raw) {
        this.lastSeenOnline = new Date();

        const cleaned = _cleanMinecraftFormatting(raw);
        rconLogger.debug(`RCON response received: ${cleaned.substring(0, 80)}${cleaned.length > 80 ? "…" : ""}`);

        const pending = this._pendingCommands.shift();
        if (pending) {
            pending.resolve(cleaned);
        } else {
            // This can happen if the keepalive response arrives after a
            // reconnect wiped the queue, or if the server sends an
            // unsolicited message.  Safe to discard.
            rconLogger.debug("Received a response with no pending command to deliver it to — discarding.");
        }
    }

    /**
     * Called when the RCON socket emits an error.
     *
     * @private
     * @param {Error} err
     */
    _onError(err) {
        if (err.code === "ECONNREFUSED") {
            this._logConnectionRefused(err);
        } else {
            rconLogger.error(`RCON socket error: ${err.message}`);
        }
        // The "end" event will fire immediately after on most platforms,
        // but _handleDisconnect() is idempotent so calling it here as
        // well guarantees we always transition away from CONNECTED.
        this._handleDisconnect(err);
    }

    /**
     * Called when the RCON socket closes (either cleanly or after an error).
     *
     * @private
     */
    _onEnd() {
        rconLogger.info("RCON socket closed.");
        this._handleDisconnect();
    }

    // ── Private: disconnection & reconnect loop ──────────────

    /**
     * Central handler for any loss-of-connection event.
     * Idempotent — safe to call from both _onError and _onEnd.
     *
     * Responsibilities:
     *  1. Stop the keepalive loop so we don't fire "list" into a dead socket.
     *  2. Reject any in-flight command promises so callers don't hang.
     *  3. Transition state to RECONNECTING and notify listeners.
     *  4. Schedule the first reconnect attempt.
     *
     * @private
     */
    _handleDisconnect(reason = null) {
        // Guard: only act once per disconnect event cycle.
        //
        // IMPORTANT: CONNECTING must NOT be included in this bail-out.
        // On the very first connection attempt (e.g. bot starts before
        // the Minecraft server is up), state is CONNECTING when ECONNREFUSED
        // fires via _onError. If we returned early here, _scheduleReconnect()
        // would never be called and the manager would silently freeze — no
        // retries, no presence update, no recovery. Ever.
        //
        // RECONNECTING is correctly excluded: a reconnect timer is already
        // scheduled; stacking a second one would cause exponential timer drift.
        //
        // DISCONNECTED means destroy() was called — no reconnect desired.
        if (this._state === State.DISCONNECTED || this._state === State.RECONNECTING) {
            return;
        }

        // ECONNREFUSED during startup is expected and already logged (throttled)
        // by _logConnectionRefused(). Avoid a second warn line each retry.
        if (!reason || reason.code !== "ECONNREFUSED") {
            rconLogger.warn("RCON connection lost — beginning reconnect loop.");
        }

        this._clearKeepaliveTimer();
        this._clearStartingGraceTimer();
        this._isStarting = false;

        // Reject pending commands immediately so callers get a timely error
        // rather than waiting for their individual timeouts to fire.
        this._drainPendingCommands(new Error("RCON connection lost."));

        this._destroySocket();

        this._state    = State.RECONNECTING;
        this.playerCount = null;

        this.emit("disconnected");
        this.emit("offline"); // convenience alias

        this._scheduleReconnect();
    }

    /**
     * Logs ECONNREFUSED in a throttled way to avoid reconnect spam while the
     * server is offline/starting.
     *
     * @private
     * @param {Error} err
     */
    _logConnectionRefused(err) {
        const now = Date.now();
        if (this._refusedLogIntervalMs <= 0) {
            if (this._lastRefusedLogAtMs !== 0) {
                this._suppressedRefusedCount += 1;
                return;
            }
            rconLogger.warn(
                `RCON connection refused (server may be offline/starting). Retrying every ${Math.round(this._reconnectIntervalMs / 1000)}s. [${err.message}]`
            );
            this._lastRefusedLogAtMs = now;
            return;
        }

        const shouldLog =
            this._lastRefusedLogAtMs === 0 ||
            now - this._lastRefusedLogAtMs >= this._refusedLogIntervalMs;

        if (!shouldLog) {
            this._suppressedRefusedCount += 1;
            return;
        }

        const suppressedNote = this._suppressedRefusedCount > 0
            ? ` (+${this._suppressedRefusedCount} similar refusals suppressed)`
            : "";
        rconLogger.warn(
            `RCON connection refused (server may be offline/starting). Retrying every ${Math.round(this._reconnectIntervalMs / 1000)}s.${suppressedNote} [${err.message}]`
        );
        this._lastRefusedLogAtMs = now;
        this._suppressedRefusedCount = 0;
    }

    /**
     * Schedules a single reconnect attempt after the configured reconnect interval.
     * The timer handle is stored in `_reconnectTimer` so destroy() can
     * cancel it and prevent a reconnect firing after intentional teardown.
     *
     * @private
     */
    _scheduleReconnect() {
        this._clearReconnectTimer();
        // rconLogger.info(`Reconnect scheduled in ${this._reconnectIntervalMs / 1000}s.`);

        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;

            // Don't attempt if destroy() was called between scheduling and firing.
            if (this._state === State.DISCONNECTED) {
                rconLogger.debug("Reconnect timer fired but manager was destroyed — aborting.");
                return;
            }

            this._connect();
        }, this._reconnectIntervalMs);
    }

    // ── Private: keepalive loop ──────────────────────────────

    /**
     * Starts the periodic keepalive interval.  Each tick sends a "list"
     * command and uses the response to:
     *   - Confirm the socket is still alive (avoids half-open TCP connections)
     *   - Emit the current player count for presence and auto-stop logic
     *
     * @private
     */
    _startKeepalive() {
        this._clearKeepaliveTimer(); // Defensive: don't stack intervals

        this._keepaliveTimer = setInterval(async () => {
            if (!this.connected) {
                // Should never happen because we clear this timer on disconnect,
                // but guard anyway to avoid spurious log noise.
                return;
            }

            try {
                const response = await this.sendCommand("list", this._commandTimeoutMs);
                const count = _parsePlayerCount(response);
                this._keepaliveFailureStreak = 0;

                if (count !== null) {
                    this.playerCount = count;
                    rconLogger.debug(`Keepalive OK — ${count} player(s) online.`);
                    this.emit("playerCount", count);
                } else {
                    rconLogger.warn(`Keepalive: could not parse player count from response: "${response}"`);
                }
            } catch (err) {
                this._keepaliveFailureStreak += 1;
                rconLogger.warn(
                    `Keepalive command failed (${this._keepaliveFailureStreak}/${this._maxKeepaliveFailures}): ${err.message}`
                );

                // Do not immediately tear down a connection on the first failed
                // keepalive, because status commands can temporarily back up the
                // queue. Only reconnect after repeated failures.
                if (this._keepaliveFailureStreak >= this._maxKeepaliveFailures) {
                    rconLogger.warn("Keepalive failure threshold reached — treating as disconnect.");
                    this._handleDisconnect();
                }
            }
        }, this._keepaliveIntervalMs);
    }

    // ── Private: "starting" grace period ────────────────────

    /**
     * Enters the "starting" grace period immediately after a successful
     * reconnect. During this window, presence logic should display
     * "Server starting…" rather than jumping straight to the player count,
     * because the Minecraft world may still be loading even though RCON
     * has accepted the connection.
     *
     * @private
     */
    _startStartingGracePeriod() {
        this._clearStartingGraceTimer();
        this._isStarting = true;
        rconLogger.info(`Entering "starting" grace period (${this._startingGracePeriodMs / 1000}s).`);
        this.emit("starting");

        this._startingGraceTimer = setTimeout(() => {
            this._startingGraceTimer = null;
            this._isStarting = false;
            rconLogger.info("\"Starting\" grace period ended — switching to live player count.");

            // Trigger an immediate presence refresh so callers don't have
            // to wait for the next keepalive tick.
            if (this.playerCount !== null) {
                this.emit("playerCount", this.playerCount);
            }
        }, this._startingGracePeriodMs);
    }

    // ── Private: cleanup helpers ─────────────────────────────

    /**
     * Destroys and nullifies the current Rcon socket.
     * Silently ignores errors from disconnect() since we're tearing down anyway.
     *
     * @private
     */
    _destroySocket() {
        if (!this._conn) return;
        const conn = this._conn;
        this._conn = null; // nullify first so stale event handlers bail out

        try {
            conn.disconnect();
        } catch (_) {
            // Intentionally swallowed — the socket may already be dead.
        }

        // Remove all listeners to guarantee no GC-preventing references remain.
        conn.removeAllListeners();
    }

    /**
     * Rejects all pending command promises and empties the queue.
     * Called when the connection drops so callers get an immediate error
     * rather than hanging until their individual timeouts fire.
     *
     * @private
     * @param {Error} reason
     */
    _drainPendingCommands(reason) {
        if (this._pendingCommands.length === 0) return;
        rconLogger.debug(`Draining ${this._pendingCommands.length} pending command(s) with error: ${reason.message}`);

        for (const entry of this._pendingCommands) {
            clearTimeout(entry.timer);
            entry.reject(reason);
        }
        this._pendingCommands = [];
    }

    /** @private */
    _clearKeepaliveTimer() {
        if (this._keepaliveTimer) {
            clearInterval(this._keepaliveTimer);
            this._keepaliveTimer = null;
        }
    }

    /** @private */
    _clearReconnectTimer() {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    /** @private */
    _clearStartingGraceTimer() {
        if (this._startingGraceTimer) {
            clearTimeout(this._startingGraceTimer);
            this._startingGraceTimer = null;
        }
    }
}

// ── Module-level pure helpers ────────────────────────────────
//  These are free functions rather than methods because they have no
//  dependency on instance state and are easier to unit-test in isolation.

/**
 * Strips Minecraft colour/formatting codes (e.g. §a, §r) from a string.
 * The `gi` flags catch both lower- and upper-case format characters.
 *
 * @param {string} str
 * @returns {string}
 */
function _cleanMinecraftFormatting(str) {
    if (!str || typeof str !== "string") return "";
    return str.replace(/§[0-9A-FK-OR]/gi, "");
}

/**
 * Parses the numeric online player count from a vanilla "list" response.
 *
 * Example response:
 *   "There are 3 of a max of 20 players online: Alice, Bob, Carol"
 *
 * @param {string} response - Cleaned RCON response from "list".
 * @returns {number|null}   - Player count, or null if the response could not be parsed.
 */
function _parsePlayerCount(response) {
    const match = response.match(/There are (\d+) of a max of \d+/i);
    return match ? parseInt(match[1], 10) : null;
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
    RconManager,
    // Export defaults so index.js (or tests) can inherit/override them.
    DEFAULT_KEEPALIVE_INTERVAL_MS,
    DEFAULT_RECONNECT_INTERVAL_MS,
    DEFAULT_STARTING_GRACE_PERIOD_MS,
    DEFAULT_COMMAND_TIMEOUT_MS,
    DEFAULT_MAX_KEEPALIVE_FAILURES,
    DEFAULT_REFUSED_LOG_INTERVAL_MS,
    // Export pure helpers for unit testing.
    _cleanMinecraftFormatting,
    _parsePlayerCount,
};