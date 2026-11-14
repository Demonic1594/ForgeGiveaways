import type { DataBaseManagerClass, EntitiesByDriver } from "../utils/databaseExtension"

/** The `DataBaseManager` of ReForgeDB, else of ForgeDB, else a stand-in that explains what is missing. */
function installedManager(): DataBaseManagerClass {
    for (const pkg of ["@tryforge/reforge.db", "@tryforge/forge.db"]) {
        try {
            const manager = require(pkg).DataBaseManager
            if (typeof manager === "function") return manager
        } catch {
            // Not installed: try the next one.
        }
    }
    abstract class MissingDataBaseManager {
        abstract database: string
        abstract entityManager: EntitiesByDriver
        getDB(): never {
            throw new Error("[ReForgeGiveaways] GiveawaysDatabaseManager needs @tryforge/reforge.db or @tryforge/forge.db installed")
        }
    }
    return MissingDataBaseManager as unknown as DataBaseManagerClass
}

/**
 * @deprecated Kept so existing imports keep working; giveaways no longer use
 * it. It extends the `DataBaseManager` of the installed package
 * (`@tryforge/reforge.db` first, then `@tryforge/forge.db`), resolved when
 * this module loads. The giveaway database itself uses the extension the bot
 * actually loaded.
 */
export abstract class GiveawaysDatabaseManager extends installedManager() {
    constructor() {
        super()
    }
}
