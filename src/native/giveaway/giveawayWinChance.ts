import { ArgType, NativeFunction } from "@tryforge/forgescript"
import pullGiveaway from "../../functions/pullGiveaway"

export default new NativeFunction({
    name: "$giveawayWinChance",
    version: "2.0.0",
    description: "Returns the estimated chance in percent (0-100) that a user wins, given the current entries",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "giveaway ID",
            description: "The giveaway to check",
            rest: false,
            required: true,
            type: ArgType.String,
        },
        {
            name: "user ID",
            description: "The user to check for",
            rest: false,
            required: true,
            type: ArgType.User,
        },
    ],
    output: ArgType.Number,
    async execute(ctx, [id, user]) {
        const giveaway = await pullGiveaway(ctx, id)
        return this.success(giveaway ? Math.round(giveaway.winChance(user.id) * 10000) / 100 : undefined)
    }
})
