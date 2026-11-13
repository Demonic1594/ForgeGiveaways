import { GuildMember, Message, Snowflake, User } from "discord.js";
import { ForgeClient } from "@tryforge/forgescript";
import { Giveaway, GiveawayDenyReason, IGiveawayBonusEntry, IGiveawayDisplay, IGiveawayRequirements, IGiveawayStartOptions, Renderer } from "../structures";
import { Scheduler } from "../utils";
import type { ForgeGiveaways } from "..";
import type { EntryContext } from "../handlers/GiveawaysEventHandler";
export type { IGiveawayStartOptions } from "../structures/Giveaway";
export interface IGiveawayEditOptions {
    prize?: string;
    winnersCount?: number;
    hostID?: Snowflake;
    requirements?: IGiveawayRequirements;
    bonusEntries?: IGiveawayBonusEntry[];
    maxEntries?: number | null;
    display?: IGiveawayDisplay;
}
export interface IEntryResult {
    action: "added" | "removed" | "denied";
    reason?: GiveawayDenyReason;
    giveaway: Giveaway;
}
type GuildStatus = "ok" | "unavailable" | "gone";
/**
 * Owns the life cycle of every giveaway: start, end, reroll, edit, pause,
 * resume, extend, cancel and entries.
 *
 * - All state changes for a giveaway run through a per-giveaway lock, so
 *   concurrent clicks or a timer racing a manual end can't lose writes or
 *   announce winners twice.
 * - End times are tracked by a single {@link Scheduler}, which has no maximum
 *   duration (the original `setTimeout` per giveaway broke past ~24.8 days).
 * - Entry changes are batched into one database write per giveaway every
 *   `entryFlushDelay` ms, and the live entry counter on the message is
 *   refreshed at most every `messageUpdateDelay` ms.
 */
export declare class GiveawaysManager {
    #private;
    private readonly client;
    private readonly giveaways;
    readonly scheduler: Scheduler;
    readonly renderer: Renderer;
    constructor(client: ForgeClient, giveaways: ForgeGiveaways);
    private get messages();
    /** Resolves once the database is connected. */
    whenReady(): Promise<void>;
    /** @internal Called by the extension once the database is connected. */
    _onDatabaseReady(): void;
    private emit;
    /** Whether anything listens to an event, so snapshots are only built when needed. */
    private wants;
    private getChannel;
    /**
     * Fetches the message of a giveaway.
     * @param channelID The id of the channel to pull message from.
     * @param messageID The id of the message to fetch.
     */
    fetchMessage(channelID: Snowflake, messageID?: Snowflake | null): Promise<Message | undefined>;
    private getGuild;
    private clearTimers;
    /** Persists a giveaway now (inside its lock). */
    private save;
    /** Queues a coalesced write of entry changes. */
    private queueFlush;
    /** Queues a refresh of the giveaway message (live entry count). */
    private queueRefresh;
    /** Writes every pending entry change to the database. */
    flushAll(): Promise<void>;
    /** Re-renders the default giveaway message. */
    private updateMessage;
    private schedule;
    /**
     * Starts a new giveaway on a guild. There is no upper limit on the duration.
     * @param options The start options for the giveaway.
     */
    start(options: IGiveawayStartOptions): Promise<Giveaway | null>;
    /** Sends the default giveaway message and saves its id. Returns false if it could not be sent. */
    private postMessage;
    /**
     * Links a custom start message to a giveaway (used by the `giveawayStart`
     * event when default messages are disabled).
     */
    attachMessage(id: Snowflake, messageID: Snowflake): Promise<Giveaway | null>;
    /** Removes a giveaway and its timers without announcing anything. */
    discard(id: Snowflake): Promise<import("typeorm").DeleteResult>;
    /**
     * Whether a guild can be used for a draw right now.
     * - `ok`: available.
     * - `unavailable`: Discord outage or a network error; worth retrying.
     * - `gone`: the bot was removed (Unknown Guild / Missing Access).
     */
    guildStatus(guildID: Snowflake): Promise<GuildStatus>;
    /**
     * Timer path for ending. Drawing while the bot is disconnected or the
     * guild is in an outage would find no members and end with no winners,
     * so it retries every minute instead (up to a day past the deadline).
     * Manual `end()` calls are never postponed.
     */
    _onDeadline(id: Snowflake): Promise<Giveaway | null>;
    /**
     * Ends an existing giveaway and draws the winners.
     * @param id The id of the giveaway to end.
     */
    end(id: Snowflake): Promise<Giveaway | null>;
    /**
     * Cancels a running giveaway: it ends without winners.
     */
    cancel(id: Snowflake): Promise<Giveaway | null>;
    /**
     * Rerolls an ended giveaway.
     * @param id The id of the giveaway to reroll.
     * @param unique Whether everyone who already won is excluded.
     * @param amount The amount of new winners (defaults to the winners count).
     */
    reroll(id: Snowflake, unique?: boolean, amount?: number): Promise<Giveaway | null>;
    /**
     * Edits a running giveaway.
     * @param id The id of the giveaway to edit.
     * @param options The options used to edit this giveaway.
     */
    edit(id: Snowflake, options: IGiveawayEditOptions): Promise<Giveaway | null>;
    /**
     * Adds (or with a negative value removes) time from a running giveaway.
     * Shortening never moves the end before "now"; the giveaway then ends immediately.
     */
    extend(id: Snowflake, ms: number): Promise<Giveaway | null>;
    /** Pauses a running giveaway: the timer stops and nobody can join or leave. */
    pause(id: Snowflake): Promise<Giveaway | null>;
    /** Resumes a paused giveaway with the time it had left. */
    resume(id: Snowflake): Promise<Giveaway | null>;
    /**
     * Toggles a member's entry: joins if not entered, leaves otherwise.
     * Used by the button handler.
     */
    toggleEntry(id: Snowflake, member: GuildMember | Parameters<Giveaway["canEnter"]>[0], source: EntryContext, user: User): Promise<IEntryResult | null>;
    /** Adds a member's entry (used by reactions). */
    join(id: Snowflake, member: GuildMember, source: EntryContext, user: User): Promise<IEntryResult | null>;
    /**
     * Removes an entry. Returns the giveaway, or null if it was not entered/active.
     * @param force Also remove entries while paused. Entries of an ended
     * giveaway are never changed: they are the record the winners were drawn
     * from (removing one used to leave a winner who "never entered").
     */
    leave(id: Snowflake, userID: Snowflake, source?: EntryContext, user?: User, force?: boolean): Promise<Giveaway | null>;
    /**
     * Adds an entry on someone's behalf.
     * @param bypassRequirements Skip requirement checks (still respects ended state).
     */
    addEntry(id: Snowflake, userID: Snowflake, bypassRequirements?: boolean): Promise<Giveaway | null>;
    /**
     * Draws up to `count` winners. Candidates are put in a random order
     * (weighted by bonus entries) using a cryptographically secure RNG and then
     * checked one by one, so only as many members are fetched as needed instead
     * of every entrant, and people who left the server or no longer meet the
     * requirements are skipped.
     */
    private drawWinners;
    private fetchMembers;
    private announce;
    private dmWinners;
    /**
     * @internal Recovers after a (re)start. Runs once, when both the database
     * and the gateway are ready:
     * 1. announces results that were drawn but never announced (crash mid-end),
     * 2. re-arms every active giveaway; ones that ended during downtime are
     *    processed right away, one by one,
     * 3. in the background: posts messages that were never sent (crash
     *    mid-start), refreshes the others (live entry count went stale while
     *    offline) and, in reaction mode, counts reactions made while offline.
     */
    _restore(): Promise<void>;
    /** @internal Resolves when the background message repair after a restart is done. */
    _whenRepaired(): Promise<void>;
    /** Deletes giveaways that ended more than `olderThan` ms ago. Returns how many. */
    sweep(olderThan: number): Promise<number>;
    /** Stops all timers and writes pending changes. */
    destroy(): Promise<void>;
}
//# sourceMappingURL=GiveawaysManager.d.ts.map