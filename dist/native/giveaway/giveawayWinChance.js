"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const pullGiveaway_1 = __importDefault(require("../../functions/pullGiveaway"));
exports.default = new forgescript_1.NativeFunction({
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
            type: forgescript_1.ArgType.String,
        },
        {
            name: "user ID",
            description: "The user to check for",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.User,
        },
    ],
    output: forgescript_1.ArgType.Number,
    async execute(ctx, [id, user]) {
        const giveaway = await (0, pullGiveaway_1.default)(ctx, id);
        return this.success(giveaway ? Math.round(giveaway.winChance(user.id) * 10000) / 100 : undefined);
    }
});
//# sourceMappingURL=giveawayWinChance.js.map