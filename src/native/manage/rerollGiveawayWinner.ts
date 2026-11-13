import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { ReForgeGiveaways } from "../.."
import { scopedGiveaway } from "../../functions/scope"

export default new NativeFunction({
    name: "$rerollGiveawayWinner",
    version: "2.1.0",
    description: "Replaces one winner of an ended giveaway with a newly drawn one, the other winners keep their win, returns bool",
    aliases: ["$replaceGiveawayWinner"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "giveaway ID",
            description: "The giveaway to reroll",
            rest: false,
            required: true,
            type: ArgType.String,
        },
        {
            name: "user ID",
            description: "The winner to replace",
            rest: false,
            required: true,
            type: ArgType.User,
        },
        {
            name: "guild ID",
            description: "The guild the giveaway must belong to, defaults to the current guild",
            rest: false,
            type: ArgType.Guild,
        },
    ],
    output: ArgType.Boolean,
    async execute(ctx, [id, user, guild]) {
        if (!(await scopedGiveaway(ctx, id, guild))) return this.success(false)
        const manager = ctx.client.getExtension(ReForgeGiveaways, true).giveawaysManager
        const giveaway = await manager.rerollWinner(id, user.id).catch(ctx.noop)
        return this.success(!!giveaway)
    }
})
