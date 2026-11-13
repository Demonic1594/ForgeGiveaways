/**
 * Truncates text to a Discord limit, appending an ellipsis when cut.
 */
export declare function truncate(text: string, max: number): string;
/**
 * Joins items with a separator into as few chunks as possible, none longer
 * than `max` characters. Used to announce any number of winners without
 * hitting Discord's 2000 character message limit.
 */
export declare function chunkJoin(items: readonly string[], sep: string, max: number): string[];
/** Splits an array into slices of at most `size` items. */
export declare function chunk<T>(items: readonly T[], size: number): T[][];
/**
 * Extracts a role id from a raw id or a role mention (`<@&123>`). A user or
 * channel mention is not a role, so it is refused instead of being stored as
 * a requirement nobody can ever meet. Returns null for anything else.
 */
export declare function parseSnowflake(input: string | null | undefined): string | null;
/** Whether a URL can be shown in an embed (Discord only accepts http and https). */
export declare function isEmbedURL(input: string | null | undefined): boolean;
/**
 * Turns a millisecond duration into a compact human string, e.g. "1y 3d 4h".
 */
export declare function formatDuration(ms: number): string;
/**
 * The shard a guild belongs to, by Discord's formula `(guild_id >> 22) % shard_count`.
 */
export declare function shardIdFor(guildID: string, shardCount: number): number;
//# sourceMappingURL=text.d.ts.map