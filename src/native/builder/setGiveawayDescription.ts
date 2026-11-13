import { ArgType, NativeFunction } from "@tryforge/forgescript"
import builder from "../../functions/builder"
import { GiveawayLimits } from "../../structures"

export default new NativeFunction({
    name: "$setGiveawayDescription",
    version: "2.0.0",
    description: "Sets extra text shown in the default giveaway message",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "text",
            description: "The value to set",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    execute(ctx, [text]) {
        const error = text.length > GiveawayLimits.description ? `Description must be at most ${GiveawayLimits.description} characters` : null
        if (error) return this.customError(error)
        const b = builder(ctx)
        b.display = { ...b.display, description: text }
        return this.success()
    }
})
