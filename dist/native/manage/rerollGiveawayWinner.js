"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const scope_1 = require("../../functions/scope");
exports.default = new forgescript_1.NativeFunction({
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
            type: forgescript_1.ArgType.String,
        },
        {
            name: "user ID",
            description: "The winner to replace",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.User,
        },
        {
            name: "guild ID",
            description: "The guild the giveaway must belong to, defaults to the current guild",
            rest: false,
            type: forgescript_1.ArgType.Guild,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [id, user, guild]) {
        if (!(await (0, scope_1.scopedGiveaway)(ctx, id, guild)))
            return this.success(false);
        const manager = ctx.client.getExtension(__1.ReForgeGiveaways, true).giveawaysManager;
        const giveaway = await manager.rerollWinner(id, user.id).catch(ctx.noop);
        return this.success(!!giveaway);
    }
});
//# sourceMappingURL=rerollGiveawayWinner.js.map