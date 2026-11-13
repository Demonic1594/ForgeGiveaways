import { Context } from "@tryforge/forgescript";
import { Guild } from "discord.js";
import { Giveaway } from "../structures";
/**
 * Whether a context may start a giveaway in a channel of `channelGuildID`.
 * A command running in one guild can't post a giveaway into another guild's
 * channel. Contexts without a guild (giveaway events, `ready`, direct
 * messages) pick the channel themselves and are not restricted: starting a
 * giveaway changes nothing that already exists.
 */
export declare function canStartIn(ctx: Context, channelGuildID: string): boolean;
/**
 * Loads a giveaway for a mutating function and enforces guild scoping:
 * a command running in guild A can't end, edit or delete a giveaway of
 * guild B just by knowing (or guessing) its ID. The explicit guild argument
 * wins; otherwise the guild of the current context is used. Contexts without
 * a guild are unrestricted only if no user is behind them (giveaway events,
 * ready events); in direct messages the guild argument is required.
 */
export declare function scopedGiveaway(ctx: Context, id: string, guild?: Guild | null): Promise<Giveaway | null>;
//# sourceMappingURL=scope.d.ts.map