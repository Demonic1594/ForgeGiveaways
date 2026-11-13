"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const builder_1 = __importDefault(require("../../functions/builder"));
exports.default = new forgescript_1.NativeFunction({
    name: "$clearBonusEntries",
    version: "2.1.0",
    description: "Removes every bonus entry role from the giveaway being edited; $addBonusEntries used after it starts from scratch",
    unwrap: false,
    execute(ctx) {
        (0, builder_1.default)(ctx).bonusEntries = [];
        return this.success();
    }
});
//# sourceMappingURL=clearBonusEntries.js.map