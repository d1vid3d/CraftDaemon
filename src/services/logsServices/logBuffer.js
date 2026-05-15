//  logBuffer.js  -  Rotating line buffer for live log streaming - v1.3.0
//
//  Keeps the most recent MAX_LINES log lines in memory.
//  The Discord edit loop reads from this buffer every 2 seconds
//  and only edits the message if the content has changed.

"use strict";

const MAX_LINES = 50;

class LogBuffer {
    /**
     * @param {number} [maxLines=MAX_LINES] - Maximum lines to retain.
     */
    constructor(maxLines = MAX_LINES) {
        /** @private */
        this._maxLines = maxLines;
        /** @private @type {string[]} */
        this._lines = [];
        /** @private */
        this._lastSnapshot = "";
    }

    /**
     * Push one or more lines into the buffer.
     * Trims from the front if the buffer exceeds maxLines.
     *
     * @param  {...string} lines
     */
    push(...lines) {
        for (const line of lines) {
            this._lines.push(line);
        }
        if (this._lines.length > this._maxLines) {
            this._lines.splice(0, this._lines.length - this._maxLines);
        }
    }

    /**
     * Returns the current buffer content formatted as a Discord code block.
     * Returns an empty code block if the buffer is empty.
     *
     * @returns {string}
     */
    getContent() {
        if (this._lines.length === 0) {
            return "```\nWaiting for log output...\n```";
        }
        return "```\n" + this._lines.join("\n") + "\n```";
    }

    /**
     * Returns true if the buffer content has changed since the last
     * call to `markSent()`. Used by the edit interval to skip
     * redundant Discord message edits.
     *
     * @returns {boolean}
     */
    hasChanged() {
        return this.getContent() !== this._lastSnapshot;
    }

    /**
     * Marks the current content as "sent" so `hasChanged()` returns
     * false until new lines arrive.
     */
    markSent() {
        this._lastSnapshot = this.getContent();
    }

    /**
     * Returns the raw lines array (shallow copy).
     *
     * @returns {string[]}
     */
    getLines() {
        return [...this._lines];
    }

    /**
     * Clears all lines and resets the change tracker.
     */
    clear() {
        this._lines = [];
        this._lastSnapshot = "";
    }
}

module.exports = { LogBuffer, MAX_LINES };
