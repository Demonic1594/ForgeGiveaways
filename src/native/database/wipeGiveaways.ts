import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { ReForgeGiveaways } from "../.."
import { Database } from "../../structures"
import { wipeScope } from "../../functions/scope"

export default new NativeFunction({
    name: "$wipeGiveaways",
    version: "1.0.0",
    description: "Deletes giveaways permanently, returns the number deleted: those of the given guild, otherwise those of the current guild. Only outside any guild (e.g. the ready event) does it delete all of them. Use with caution",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "guild ID",
            description: "The guild to wipe, defaults to the current guild",
            rest: false,
            type: ArgType.Guild,
        },
    ],
    output: ArgType.Number,
    async execute(ctx, [guild]) {
        const manager = ctx.client.getExtension(ReForgeGiveaways, true).giveawaysManager
        const scope = wipeScope(ctx, guild)
        if (scope === false) return this.customError("Pass the guild ID to wipe giveaways from a direct message")
        if (scope) {
            const ids = (await Database.find({ guildID: scope })).map((g) => g.id)
            let n = 0
            for (const id of ids) n += (await manager.discard(id)).affected ?? 0
            return this.success(n)
        }
        const all = await Database.getAll()
        for (const g of all) manager.scheduler.cancel(g.id)
        await Database.wipe()
        return this.success(all.length)
    }
})
