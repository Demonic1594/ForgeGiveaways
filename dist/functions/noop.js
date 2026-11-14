"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
/** Logs an error from a fire-and-forget promise instead of crashing. */
exports.default = (...args) => {
    logger_1.ReForgeGiveawaysLogger.error("Unexpected error:", ...args);
};
//# sourceMappingURL=noop.js.map