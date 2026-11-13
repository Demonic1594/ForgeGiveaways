"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const structures_1 = require("../../structures");
const scope_1 = require("../../functions/scope");
exports.default = new forgescript_1.NativeFunction({
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
            type: forgescript_1.ArgType.Guild,
        },
    ],
    output: forgescript_1.ArgType.Number,
    async execute(ctx, [guild]) {
        const manager = ctx.client.getExtension(__1.ReForgeGiveaways, true).giveawaysManager;
        const scope = (0, scope_1.wipeScope)(ctx, guild);
        if (scope === false)
            return this.customError("Pass the guild ID to wipe giveaways from a direct message");
        if (scope) {
            const ids = (await structures_1.Database.find({ guildID: scope })).map((g) => g.id);
            let n = 0;
            for (const id of ids)
                n += (await manager.discard(id)).affected ?? 0;
            return this.success(n);
        }
        const all = await structures_1.Database.getAll();
        for (const g of all)
            manager.scheduler.cancel(g.id);
        await structures_1.Database.wipe();
        return this.success(all.length);
    }
});
//# sourceMappingURL=wipeGiveaways.js.map