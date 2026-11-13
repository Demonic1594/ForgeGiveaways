"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const builder_1 = require("../../functions/builder");
exports.default = new forgescript_1.NativeFunction({
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
            type: forgescript_1.ArgType.Boolean,
        },
    ],
    execute(ctx, [exclude]) {
        (0, builder_1.requirements)(ctx).excludeHost = exclude ?? true;
        return this.success();
    }
});
//# sourceMappingURL=excludeGiveawayHost.js.map