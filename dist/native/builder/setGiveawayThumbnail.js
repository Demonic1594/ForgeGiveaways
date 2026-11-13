"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const builder_1 = __importDefault(require("../../functions/builder"));
const utils_1 = require("../../utils");
exports.default = new forgescript_1.NativeFunction({
    name: "$setGiveawayThumbnail",
    version: "2.0.0",
    description: "Sets the thumbnail of the default giveaway message",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "url",
            description: "The value to set",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
    ],
    execute(ctx, [text]) {
        // Discord refuses the whole message for any other link, and the
        // giveaway would then be dropped for lack of a message.
        if (!(0, utils_1.isEmbedURL)(text))
            return this.customError(`The ${"thumbnail"} must be an http(s) link of at most 2048 characters`);
        const b = (0, builder_1.default)(ctx);
        b.display = { ...b.display, thumbnail: text };
        return this.success();
    }
});
//# sourceMappingURL=setGiveawayThumbnail.js.map