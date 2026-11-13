import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { requirements } from "../../functions/builder"

export default new NativeFunction({
    name: "$excludeGiveawayHost",
    version: "2.0.0",
    description: "Prevents the host from entering or winning the giveaway being started or edited",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "exclude",
            description: "Whether to exclude the host, defaults to true",
            rest: false,
            type: ArgType.Boolean,
        },
    ],
    execute(ctx, [exclude]) {
        requirements(ctx).excludeHost = exclude ?? true
        return this.success()
    }
})
