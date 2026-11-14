"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GiveawaysDatabaseManager = void 0;
/** The `DataBaseManager` of ReForgeDB, else of ForgeDB, else a stand-in that explains what is missing. */
function installedManager() {
    for (const pkg of ["@tryforge/reforge.db", "@tryforge/forge.db"]) {
        try {
            const manager = require(pkg).DataBaseManager;
            if (typeof manager === "function")
                return manager;
        }
        catch {
            // Not installed: try the next one.
        }
    }
    class MissingDataBaseManager {
        getDB() {
            throw new Error("[ReForgeGiveaways] GiveawaysDatabaseManager needs @tryforge/reforge.db or @tryforge/forge.db installed");
        }
    }
    return MissingDataBaseManager;
}
/**
 * @deprecated Kept so existing imports keep working; giveaways no longer use
 * it. It extends the `DataBaseManager` of the installed package
 * (`@tryforge/reforge.db` first, then `@tryforge/forge.db`), resolved when
 * this module loads. The giveaway database itself uses the extension the bot
 * actually loaded.
 */
class GiveawaysDatabaseManager extends installedManager() {
    constructor() {
        super();
    }
}
exports.GiveawaysDatabaseManager = GiveawaysDatabaseManager;
//# sourceMappingURL=GiveawaysDatabaseManager.js.map