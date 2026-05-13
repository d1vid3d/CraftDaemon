//  logStream.js  -  Child-process log source for live & tail modes - v1.3.0
//
//  Spawns journalctl or tail to stream / fetch server logs.
//  Returns an EventEmitter (live) or a Promise<string[]> (tail).
//
//  Source priority:
//    1. journalctl -f -u ${MC_SERVICE}   (default, recommended)
//    2. tail -f ${LOG_FILE_PATH}         (fallback, requires LOG_FILE_PATH)

"use strict";

const { spawn, execSync } = require("child_process");
const EventEmitter = require("events");
const { createLogger } = require("../logger");

const logsLogger = createLogger("Logs");

// Env configuration.

const LOGS_SOURCE = (process.env.LOGS_SOURCE || "journalctl").toLowerCase().trim();
const MC_SERVICE = process.env.MC_SERVICE || "minecraft";
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || "./logs/latest.log";

/**
 * Creates a live log stream (for live mode).
 * Returns an EventEmitter that emits:
 *   - "line"  (string)  — each new log line
 *   - "error" (Error)   — if the child process errors
 *   - "close" (number)  — when the child process exits
 *
 * The returned object also has a `kill()` method to terminate the process.
 *
 * @returns {{ emitter: EventEmitter, kill: () => void }}
 */
function createLiveStream() {
    const emitter = new EventEmitter();
    let proc;

    if (LOGS_SOURCE === "file") {
        logsLogger.info(`Starting live log stream from file: ${LOG_FILE_PATH}`);
        proc = spawn("tail", ["-f", "-n", "0", LOG_FILE_PATH], {
            stdio: ["ignore", "pipe", "pipe"],
        });
    } else {
        // Default: journalctl
        logsLogger.info(`Starting live log stream from journalctl for service: ${MC_SERVICE}`);
        proc = spawn("journalctl", ["-f", "-u", MC_SERVICE, "--output=short", "--no-pager", "-n", "0"], {
            stdio: ["ignore", "pipe", "pipe"],
        });
    }

    // Buffer partial lines — child_process data events don't always
    // split cleanly on newline boundaries.
    let partial = "";

    proc.stdout.on("data", (chunk) => {
        const text = partial + chunk.toString();
        const lines = text.split("\n");
        // Last element may be an incomplete line — hold it back.
        partial = lines.pop() || "";

        for (const line of lines) {
            if (line.trim()) {
                emitter.emit("line", line);
            }
        }
    });

    proc.stderr.on("data", (chunk) => {
        logsLogger.warn(`Log stream stderr: ${chunk.toString().trim()}`);
    });

    proc.on("error", (err) => {
        logsLogger.error(`Log stream process error: ${err.message}`);
        emitter.emit("error", err);
    });

    proc.on("close", (code) => {
        // Flush any remaining partial line.
        if (partial.trim()) {
            emitter.emit("line", partial.trim());
            partial = "";
        }
        logsLogger.info(`Log stream process exited with code ${code}`);
        emitter.emit("close", code);
    });

    const kill = () => {
        try {
            if (!proc.killed) {
                proc.kill("SIGTERM");
                logsLogger.info("Log stream process terminated.");
            }
        } catch (err) {
            logsLogger.warn(`Failed to kill log stream process: ${err.message}`);
        }
    };

    return { emitter, kill };
}

/**
 * Fetches the last N lines from the log source (for tail mode).
 * This is a one-shot synchronous/async operation — no streaming.
 *
 * @param {number} [lines=20] - Number of lines to fetch.
 * @returns {string[]} Array of log lines.
 */
function fetchTailLines(lines = 20) {
    try {
        let output;

        if (LOGS_SOURCE === "file") {
            logsLogger.info(`Fetching last ${lines} lines from file: ${LOG_FILE_PATH}`);
            output = execSync(`tail -n ${lines} ${LOG_FILE_PATH}`, {
                encoding: "utf8",
                timeout: 5000,
            });
        } else {
            logsLogger.info(`Fetching last ${lines} lines from journalctl for service: ${MC_SERVICE}`);
            output = execSync(
                `journalctl -u ${MC_SERVICE} -n ${lines} --no-pager --output=short`,
                { encoding: "utf8", timeout: 5000 }
            );
        }

        return output
            .split("\n")
            .filter((line) => line.trim() !== "");
    } catch (err) {
        logsLogger.error(`Failed to fetch tail lines: ${err.message}`);
        return [`[Error fetching logs: ${err.message}]`];
    }
}

module.exports = { createLiveStream, fetchTailLines, LOGS_SOURCE };
