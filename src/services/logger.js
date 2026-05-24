//  Logger Utility - Structured logging with prefixes and timestamps
//  Provides category-based loggers with color coding and log levels

// Import the createLogger function (Like the default export) in your other modules to create loggers for different categories (e.g., Bot, Discord, RCON, etc.).

const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

const LogColors = {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    DIM: '\x1b[2m',
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    WHITE: '\x1b[37m',
};

class Logger {
    constructor(category = 'Bot', minLevel = LogLevel.INFO) {
        this.category = category;
        this.minLevel = minLevel;
        this.colorMap = {
            Bot: LogColors.CYAN,
            Discord: LogColors.BLUE,
            Node: LogColors.GREEN,
            Minecraft: LogColors.RED,
            RCON: LogColors.MAGENTA,
            AutoStop: LogColors.YELLOW,
            SystemD: LogColors.WHITE,
            Permissions: LogColors.GREEN,
        };
    }

    //Get the category prefix with color
    getPrefix() {
        const color = this.colorMap[this.category] || LogColors.WHITE;
        return `${color}[${this.category}]${LogColors.RESET}`;
    }

    // Get current timestamp
    getTimestamp() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // Format log message with timestamp and category
    formatMessage(level, message) {
        const timestamp = this.getTimestamp();
        const prefix = this.getPrefix();
        const levelStr = level === LogLevel.DEBUG ? `${LogColors.DIM}[DEBUG]${LogColors.RESET}` :
                        level === LogLevel.INFO ? `${LogColors.GREEN}[INFO]${LogColors.RESET}` :
                        level === LogLevel.WARN ? `${LogColors.YELLOW}[WARN]${LogColors.RESET}` :
                        `${LogColors.RED}[ERROR]${LogColors.RESET}`;
        
        return `${LogColors.DIM}${timestamp}${LogColors.RESET} ${prefix} ${levelStr} ${message}`;
    }

    //Log debug message
    debug(message, ...args) {
        if (this.minLevel <= LogLevel.DEBUG) {
            console.log(this.formatMessage(LogLevel.DEBUG, message), ...args);
        }
    }

    // Log info message
    info(message, ...args) {
        if (this.minLevel <= LogLevel.INFO) {
            console.log(this.formatMessage(LogLevel.INFO, message), ...args);
        }
    }

    // Log warning message
    warn(message, ...args) {
        if (this.minLevel <= LogLevel.WARN) {
            console.warn(this.formatMessage(LogLevel.WARN, message), ...args);
        }
    }

    // Log error message
    error(message, ...args) {
        if (this.minLevel <= LogLevel.ERROR) {
            console.error(this.formatMessage(LogLevel.ERROR, message), ...args);
        }
    }

    // Create a child logger with a different category
    createChild(category) {
        return new Logger(category, this.minLevel);
    }

    //Set minimum log level globally
    setMinLevel(level) {
        this.minLevel = level;
    }
}

/**
 * Parses LOG_LEVEL from env and maps it to the internal numeric enum.
 * Accepted values: DEBUG, INFO, WARN, ERROR (case-insensitive).
 *
 * @returns {number}
 */
function getInitialLogLevel() {
    const raw = String(process.env.LOG_LEVEL || "INFO").trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(LogLevel, raw)) {
        return LogLevel[raw];
    }
    return LogLevel.INFO;
}

// Create main logger instance using env-configured level.
const mainLogger = new Logger('Bot', getInitialLogLevel());

/** @type {Set<Logger>} */
const loggerRegistry = new Set([mainLogger]);

/**
 * Sets minimum log level globally for all existing and future loggers.
 * Accepts either enum number or string level name.
 *
 * @param {number|string} level
 */
function setGlobalLogLevel(level) {
    const resolved = typeof level === "string"
        ? LogLevel[String(level).trim().toUpperCase()]
        : level;
    if (resolved === undefined) return;
    mainLogger.setMinLevel(resolved);
    for (const logger of loggerRegistry) {
        logger.setMinLevel(resolved);
    }
}

function createLogger(category) {
    const logger = new Logger(category, mainLogger.minLevel);
    loggerRegistry.add(logger);
    return logger;
}

// Export for use in other modules
module.exports = {
    Logger,
    LogLevel,
    mainLogger,
    createLogger,
    setGlobalLogLevel,
};
