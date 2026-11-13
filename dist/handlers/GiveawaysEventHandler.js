"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GiveawaysEventHandler = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("..");
const noop_1 = __importDefault(require("../functions/noop"));
class GiveawaysEventHandler extends forgescript_1.BaseEventHandler {
    register(client) {
        const listener = this.listener;
        // Listeners are async and nobody awaits an emitter: without this, one
        // that throws becomes an unhandled rejection, which ends the process.
        const safe = (...args) => {
            try {
                Promise.resolve(listener.apply(client, args)).catch(noop_1.default);
            }
            catch (e) {
                (0, noop_1.default)(e);
            }
        };
        // @ts-ignore
        client.getExtension(__1.ReForgeGiveaways, true).emitter.on(this.name, safe);
    }
}
exports.GiveawaysEventHandler = GiveawaysEventHandler;
//# sourceMappingURL=GiveawaysEventHandler.js.map