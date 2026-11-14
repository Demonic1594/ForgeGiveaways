import type { ForgeClient, ForgeExtension } from "@tryforge/forgescript";
import type { DataSource, EntitySchema } from "typeorm";
/**
 * The database extensions giveaways can be stored with, in order of
 * preference. ReForgeGiveaways imports neither package: it uses the one the
 * bot loaded, so it never pulls in a second copy of TypeORM or of a database
 * extension.
 */
export declare const DATABASE_EXTENSIONS: readonly ["reforge.db", "forge.db"];
export type DatabaseExtensionName = (typeof DATABASE_EXTENSIONS)[number];
/** Same as `TransformEvents` of ForgeDB and ReForgeDB. */
export type TransformEvents<T> = {
    [P in keyof T]: T[P] extends any[] ? (...args: T[P]) => any : never;
};
/** Entities per driver, as ForgeDB and ReForgeDB take them. */
export interface EntitiesByDriver {
    sqlite: EntitySchema<any>[];
    mongodb: EntitySchema<any>[];
    mysql: EntitySchema<any>[];
    postgres: EntitySchema<any>[];
}
/** The part of the `DataBaseManager` class of ForgeDB and ReForgeDB that giveaways use. */
export interface DataBaseManagerLike {
    database: string;
    entityManager: EntitiesByDriver;
    /** Opens the database named `database`, or returns the open one (protected in both packages). */
    getDB(): Promise<DataSource>;
}
export type DataBaseManagerClass = abstract new () => DataBaseManagerLike;
/** The database extensions the bot loaded, preferred one first. */
export declare function loadedDatabaseExtensions(client: ForgeClient): Array<{
    name: DatabaseExtensionName;
    label: string;
    extension: ForgeExtension;
}>;
export declare const MISSING_DATABASE = "[ReForgeGiveaways] Needs a database extension: add new ReForgeDB() (npm i github:Demonic1594/ReForgeDB) or new ForgeDB() (npm i @tryforge/forge.db) to your extensions.";
/**
 * Finds the `DataBaseManager` class of the database extension to store
 * giveaways with. Call it once the client finished loading its extensions.
 * Both packages set `client.db` to their `DataBase` class, which extends
 * their `DataBaseManager`. With both loaded, `client.db` is whichever loaded
 * last, so ReForgeDB's own exports are used instead.
 */
export declare function resolveDatabaseManager(client: ForgeClient): {
    name: DatabaseExtensionName;
    label: string;
    manager: DataBaseManagerClass;
    alsoLoaded?: string;
};
export declare const SWITCH_GUIDE = "https://github.com/Demonic1594/ReForgeDB#switching-from-forgedb";
/** Shows the reminder to switch to ReForgeDB once per process. Returns whether it was shown now. */
export declare function remindToSwitch(): boolean;
//# sourceMappingURL=databaseExtension.d.ts.map