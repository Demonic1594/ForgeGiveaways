import { ArgType, NativeFunction } from "@tryforge/forgescript"
import pullGiveaway from "../../functions/pullGiveaway"

export default new NativeFunction({
    name: "$giveawayURL",
    version: "2.0.0",
    description: "Returns a link to the giveaway message",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "giveaway ID",
            description: "The giveaway to pull data from",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.URL,
    async execute(ctx, [id]) {
        const giveaway = await pullGiveaway(ctx, id)
        return this.success(giveaway?.url() ?? undefined)
    }
})
