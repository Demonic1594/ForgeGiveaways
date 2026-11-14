import type { ForgeClient } from "@tryforge/forgescript";
import type { DataSource, EntitySchema, MixedList } from "typeorm";
/** The database extensions ReForgeGiveaways can store its giveaways with. ReForgeDB first. */
export declare const DATABASE_EXTENSIONS: readonly ["reforge.db", "forge.db"];
export type DatabaseExtensionName = (typeof DATABASE_EXTENSIONS)[number];
export declare const SWITCH_GUIDE = "https://github.com/Demonic1594/ReForgeDB#switching-from-forgedb";
type Entities = MixedList<Function | string | EntitySchema>;
/** What ReForgeGiveaways needs from ForgeDB's and ReForgeDB's `DataBaseManager`: the same in both. */
export interface DataBaseManagerLike {
    database: string;
    entityManager: {
        sqlite: Entities;
        mongodb: Entities;
        mysql: Entities;
        postgres: Entities;
    };
}
export type DataBaseManagerClass = abstract new () => DataBaseManagerLike;
/**
 * The database extension the bot loaded: ReForgeDB (`reforge.db`) or ForgeDB
 * (`forge.db`), ReForgeDB when both are there, `null` when neither is.
 */
export declare function findDatabaseExtension(client: ForgeClient): DatabaseExtensionName | null;
/** The `DataBaseManager` class of the package that belongs to a database extension. */
export declare function loadDataBaseManager(name: DatabaseExtensionName): DataBaseManagerClass;
/**
 * Connects a database named `database` with `entities` through the extension's
 * `DataBaseManager`, using the settings given to `new ReForgeDB()` or
 * `new ForgeDB()`.
 */
export declare function connectThrough(Base: DataBaseManagerClass, database: string, entities: DataBaseManagerLike["entityManager"]): Promise<DataSource>;
/** Shows the reminder to switch to ReForgeDB once per process. Returns whether it was shown now. */
export declare function remindToSwitch(): boolean;
export {};
//# sourceMappingURL=databaseExtension.d.ts.map