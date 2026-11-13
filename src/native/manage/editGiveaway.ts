import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { ReForgeGiveaways } from "../.."
import { GiveawayLimits } from "../../structures"
import { scopedGiveaway } from "../../functions/scope"

export default new NativeFunction({
    name: "$editGiveaway",
    version: "1.1.0",
    description: "Edits a running giveaway, returns bool. Requirements, bonus entries and display options set before this call are applied too",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "giveaway ID",
            description: "The giveaway to edit",
            rest: false,
            required: true,
            type: ArgType.String,
        },
        {
            name: "guild ID",
            description: "The guild this giveaway is hosted on",
            rest: false,
            required: true,
            type: ArgType.Guild,
        },
        {
            name: "host ID",
            description: "The new member hosting this giveaway",
            rest: false,
            type: ArgType.Member,
            pointer: 1,
        },
        {
            name: "prize",
            description: "The new prize for this giveaway",
            rest: false,
            type: ArgType.String
        },
        {
            name: "winners",
            description: "The new winners count for this giveaway",
            rest: false,
            type: ArgType.Number
        }
    ],
    output: ArgType.Boolean,
    async execute(ctx, [id, guild, host, prize, winners]) {
        if (winners != null && !(Number.isInteger(winners) && winners >= 1 && winners <= GiveawayLimits.count)) return this.customError(`Winners must be a whole number from 1 to ${GiveawayLimits.count}`)
        if (prize && prize.trim().length > GiveawayLimits.prize) return this.customError(`Prize must be at most ${GiveawayLimits.prize} characters`)
        // The guild argument used to only resolve the host; it now also has
        // to match the giveaway, so one guild can't edit another's giveaway.
        if (!(await scopedGiveaway(ctx, id, guild))) return this.success(false)

        const client = ctx.client.getExtension(ReForgeGiveaways, true)
        const b = ctx.giveawayBuilder

        const giveaway = await client.giveawaysManager.edit(id, {
            hostID: host?.id,
            prize: prize || undefined,
            winnersCount: winners ?? undefined,
            requirements: ctx.requirements,
            bonusEntries: b?.bonusEntries,
            maxEntries: b?.maxEntries,
            display: b?.display,
        }).catch(ctx.noop)

        return this.success(!!giveaway)
    }
})
