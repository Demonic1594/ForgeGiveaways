"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
/** Logs an error from a fire-and-forget promise instead of crashing. */
exports.default = (...args) => {
    forgescript_1.Logger.error("[ReForgeGiveaways]", ...args);
};
//# sourceMappingURL=noop.js.map