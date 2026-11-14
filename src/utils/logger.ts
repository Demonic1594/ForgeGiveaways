import { Logger, LogPriority, LogType } from "@tryforge/forgescript"

/**
 * How much ReForgeGiveaways writes to the console.
 *
 * - `silent`: nothing
 * - `error`: failures (a database that cannot be reached, a giveaway that could not be saved)
 * - `warn`: also misconfiguration and giveaways that have to wait (a guild that is unavailable)
 * - `info` (default): also start-up messages (restored giveaways, the database in use)
 * - `debug`: also every giveaway started, ended, rerolled, paused, resumed or cancelled, and every entry write
 * - `trace`: also every timer scheduled and every message refresh
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace"

const LEVELS: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 }
export const LOG_PREFIX = "[ReForgeGiveaways]"
export const LOG_LEVELS = Object.keys(LEVELS) as LogLevel[]

export function isLogLevel(value: unknown): value is LogLevel {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(LEVELS, value)
}

/** A message with the extension's prefix, for errors meant for the bot developer. */
export function prefixed(message: string): string {
    return message.startsWith(`${LOG_PREFIX} `) ? message : `${LOG_PREFIX} ${message}`
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
export class ReForgeGiveawaysLogger {
    static level: LogLevel = isLogLevel(process.env.REFORGEGIVEAWAYS_LOG_LEVEL) ? process.env.REFORGEGIVEAWAYS_LOG_LEVEL : "info"

    static enabled(level: LogLevel) {
        return level !== "silent" && LEVELS[this.level] >= LEVELS[level]
    }

    private static write(level: LogLevel, type: LogType, message: string, extra: unknown[]) {
        if (!this.enabled(level)) return
        try {
            // Logger.log is private in ForgeScript's typings but public at run
            // time. LogPriority.None is always printed: the level gate is ours.
            const raw = Logger as unknown as { log?: (priority: LogPriority, type: LogType, ...a: unknown[]) => void }
            const text = prefixed(message)
            if (typeof raw.log === "function") raw.log(LogPriority.None, type, text, ...extra)
            else if (type === LogType.Error) Logger.error(text, ...extra)
            else if (type === LogType.Warn) Logger.warn(text, ...extra)
            else Logger.info(text, ...extra)
        } catch {
            // Logging never breaks a giveaway.
        }
    }

    static error(message: string, ...extra: unknown[]) {
        this.write("error", LogType.Error, message, extra)
    }

    static warn(message: string, ...extra: unknown[]) {
        this.write("warn", LogType.Warn, message, extra)
    }

    static info(message: string, ...extra: unknown[]) {
        this.write("info", LogType.Info, message, extra)
    }

    static debug(message: string, ...extra: unknown[]) {
        this.write("debug", LogType.Debug, message, extra)
    }

    static trace(message: string, ...extra: unknown[]) {
        this.write("trace", LogType.Debug, message, extra)
    }
}
