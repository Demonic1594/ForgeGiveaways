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
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";
export declare const LOG_PREFIX = "[ReForgeGiveaways]";
export declare const LOG_LEVELS: LogLevel[];
export declare function isLogLevel(value: unknown): value is LogLevel;
/** A message with the extension's prefix, for errors meant for the bot developer. */
export declare function prefixed(message: string): string;
/**
 * ReForgeGiveaways' logger. Writes through ForgeScript's `Logger`, so output
 * looks like the rest of the bot, with its own level: `debug` and `trace`
 * lines are shown when ReForgeGiveaways' level allows them, whatever
 * ForgeScript's own priority is.
 *
 * The level comes from the `logLevel` option, or the
 * `REFORGEGIVEAWAYS_LOG_LEVEL` environment variable when the option is not set.
 */
export declare class ReForgeGiveawaysLogger {
    static level: LogLevel;
    static enabled(level: LogLevel): boolean;
    private static write;
    static error(message: string, ...extra: unknown[]): void;
    static warn(message: string, ...extra: unknown[]): void;
    static info(message: string, ...extra: unknown[]): void;
    static debug(message: string, ...extra: unknown[]): void;
    static trace(message: string, ...extra: unknown[]): void;
}
//# sourceMappingURL=logger.d.ts.map