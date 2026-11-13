"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const builder_1 = __importDefault(require("../../functions/builder"));
const structures_1 = require("../../structures");
exports.default = new forgescript_1.NativeFunction({
    name: "$setMaxEntries",
    version: "2.0.0",
    description: "Caps how many members can enter; 0 removes the cap",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "amount",
            description: "The maximum number of entries",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.Number,
        },
    ],
    execute(ctx, [amount]) {
        if (!Number.isInteger(amount) || amount < 0 || amount > structures_1.GiveawayLimits.count)
            return this.customError(`Amount must be a whole number from 0 to ${structures_1.GiveawayLimits.count}`);
        (0, builder_1.default)(ctx).maxEntries = amount || null;
        return this.success();
    }
});
//# sourceMappingURL=setMaxEntries.js.map