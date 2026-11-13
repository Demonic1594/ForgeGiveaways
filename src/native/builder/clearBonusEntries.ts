import { NativeFunction } from "@tryforge/forgescript"
import builder from "../../functions/builder"

export default new NativeFunction({
    name: "$clearBonusEntries",
    version: "2.1.0",
    description: "Removes every bonus entry role from the giveaway being edited; $addBonusEntries used after it starts from scratch",
    unwrap: false,
    execute(ctx) {
        builder(ctx).bonusEntries = []
        return this.success()
    }
})
