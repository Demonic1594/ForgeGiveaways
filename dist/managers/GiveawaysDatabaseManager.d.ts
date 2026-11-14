import type { DataBaseManagerClass } from "../utils/databaseExtension";
declare const GiveawaysDatabaseManager_base: DataBaseManagerClass;
/**
 * @deprecated Kept so existing imports keep working; giveaways no longer use
 * it. It extends the `DataBaseManager` of the installed package
 * (`@tryforge/reforge.db` first, then `@tryforge/forge.db`), resolved when
 * this module loads. The giveaway database itself uses the extension the bot
 * actually loaded.
 */
export declare abstract class GiveawaysDatabaseManager extends GiveawaysDatabaseManager_base {
    constructor();
}
export {};
//# sourceMappingURL=GiveawaysDatabaseManager.d.ts.map