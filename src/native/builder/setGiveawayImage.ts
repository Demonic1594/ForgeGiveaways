import { ArgType, NativeFunction } from "@tryforge/forgescript"
import builder from "../../functions/builder"
import { isEmbedURL } from "../../utils"

export default new NativeFunction({
    name: "$setGiveawayImage",
    version: "2.0.0",
    description: "Sets the large image of the default giveaway message",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "url",
            description: "The value to set",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    execute(ctx, [text]) {
        // Discord refuses the whole message for any other link, and the
        // giveaway would then be dropped for lack of a message.
        if (!isEmbedURL(text)) return this.customError(`The ${"image"} must be an http(s) link of at most 2048 characters`)
        const b = builder(ctx)
        b.display = { ...b.display, image: text }
        return this.success()
    }
})
