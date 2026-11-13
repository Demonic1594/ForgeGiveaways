import { Context } from "@tryforge/forgescript"
import { Guild } from "discord.js"
import { Database, Giveaway } from "../structures"
import { GiveawaysErrorType, throwGiveawaysError } from "./error"

/**
 * The guild a context is allowed to manage giveaways of.
 * - a guild id: commands, buttons and reactions used in that guild,
 * - `null`: contexts nobody outside the bot can trigger (giveaway events,
 *   `ready`, intervals), which are unrestricted,
 * - `false`: somebody is behind this context but there is no guild, i.e. a
 *   direct message. Unrestricted there would let anyone manage any server's
 *   giveaway by DMing the bot a command, so nothing is allowed.
 */
function contextScope(ctx: Context): string | null | false {
    const guildID = ctx.guild?.id
        ?? (ctx.interaction as { guildId?: string | null } | null)?.guildId
        ?? (ctx.message as { guildId?: string | null } | null)?.guildId
    if (guildID) return guildID
    return ctx.interaction || ctx.message || ctx.channel || ctx.user ? false : null
}

/**
 * Which giveaways `$wipeGiveaways` may delete: those of one guild (an id),
 * every giveaway (`null`, only from contexts nobody outside the bot can
 * trigger), or none (`false`, a direct message without a guild argument).
 * A command running in a guild only ever wipes that guild: 2.1.0 deleted
 * the giveaways of every server when the argument was left out.
 */
export function wipeScope(ctx: Context, guild?: Guild | null): string | null | false {
    return guild?.id ?? contextScope(ctx)
}

/**
 * Whether a context may start a giveaway in a channel of `channelGuildID`.
 * A command running in one guild can't post a giveaway into another guild's
 * channel. Contexts without a guild (giveaway events, `ready`, direct
 * messages) pick the channel themselves and are not restricted: starting a
 * giveaway changes nothing that already exists.
 */
export function canStartIn(ctx: Context, channelGuildID: string) {
    const scope = contextScope(ctx)
    return !scope || scope === channelGuildID
}

/**
 * Loads a giveaway for a mutating function and enforces guild scoping:
 * a command running in guild A can't end, edit or delete a giveaway of
 * guild B just by knowing (or guessing) its ID. The explicit guild argument
 * wins; otherwise the guild of the current context is used. Contexts without
 * a guild are unrestricted only if no user is behind them (giveaway events,
 * ready events); in direct messages the guild argument is required.
 */
export async function scopedGiveaway(ctx: Context, id: string, guild?: Guild | null): Promise<Giveaway | null> {
    const g = await Database.get(id)
    if (!g) return null
    const scope = guild?.id ?? contextScope(ctx)
    if (scope === false) {
        throwGiveawaysError(GiveawaysErrorType.NoGuildScope, id)
        return null
    }
    if (scope && g.guildID !== scope) {
        throwGiveawaysError(GiveawaysErrorType.WrongGuild, id)
        return null
    }
    return g
}
