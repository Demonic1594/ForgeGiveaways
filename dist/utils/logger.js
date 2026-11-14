"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReForgeGiveawaysLogger = exports.LOG_LEVELS = exports.LOG_PREFIX = void 0;
exports.isLogLevel = isLogLevel;
exports.prefixed = prefixed;
const forgescript_1 = require("@tryforge/forgescript");
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
exports.LOG_PREFIX = "[ReForgeGiveaways]";
exports.LOG_LEVELS = Object.keys(LEVELS);
function isLogLevel(value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(LEVELS, value);
}
/** A message with the extension's prefix, for errors meant for the bot developer. */
function prefixed(message) {
    return message.startsWith(`${exports.LOG_PREFIX} `) ? message : `${exports.LOG_PREFIX} ${message}`;
}
/**
 * ReForgeGiveaways' logger. Writes through ForgeScript's `Logger`, so output
 * looks like the rest of the bot, with its own level: `debug` and `trace`
 * lines are shown when ReForgeGiveaways' level allows them, whatever
 * ForgeScript's own priority is.
 *
 * The level comes from the `logLevel` option, or the
 * `REFORGEGIVEAWAYS_LOG_LEVEL` environment variable when the option is not set.
 */
class ReForgeGiveawaysLogger {
    static level = isLogLevel(process.env.REFORGEGIVEAWAYS_LOG_LEVEL) ? process.env.REFORGEGIVEAWAYS_LOG_LEVEL : "info";
    static enabled(level) {
        return level !== "silent" && LEVELS[this.level] >= LEVELS[level];
    }
    static write(level, type, message, extra) {
        if (!this.enabled(level))
            return;
        try {
            // Logger.log is private in ForgeScript's typings but public at run
            // time. LogPriority.None is always printed: the level gate is ours.
            const raw = forgescript_1.Logger;
            const text = prefixed(message);
            if (typeof raw.log === "function")
                raw.log(forgescript_1.LogPriority.None, type, text, ...extra);
            else if (type === forgescript_1.LogType.Error)
                forgescript_1.Logger.error(text, ...extra);
            else if (type === forgescript_1.LogType.Warn)
                forgescript_1.Logger.warn(text, ...extra);
            else
                forgescript_1.Logger.info(text, ...extra);
        }
        catch {
            // Logging never breaks a giveaway.
        }
    }
    static error(message, ...extra) {
        this.write("error", forgescript_1.LogType.Error, message, extra);
    }
    static warn(message, ...extra) {
        this.write("warn", forgescript_1.LogType.Warn, message, extra);
    }
    static info(message, ...extra) {
        this.write("info", forgescript_1.LogType.Info, message, extra);
    }
    static debug(message, ...extra) {
        this.write("debug", forgescript_1.LogType.Debug, message, extra);
    }
    static trace(message, ...extra) {
        this.write("trace", forgescript_1.LogType.Debug, message, extra);
    }
}
exports.ReForgeGiveawaysLogger = ReForgeGiveawaysLogger;
//# sourceMappingURL=logger.js.map