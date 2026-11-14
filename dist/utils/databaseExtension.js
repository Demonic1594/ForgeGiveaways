"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MISSING_DATABASE = exports.DATABASE_EXTENSIONS = void 0;
exports.loadedDatabaseExtensions = loadedDatabaseExtensions;
exports.resolveDatabaseManager = resolveDatabaseManager;
/**
 * The database extensions giveaways can be stored with, in order of
 * preference. ReForgeGiveaways imports neither package: it uses the one the
 * bot loaded, so it never pulls in a second copy of TypeORM or of a database
 * extension.
 */
exports.DATABASE_EXTENSIONS = ["reforge.db", "forge.db"];
const LABELS = { "reforge.db": "ReForgeDB", "forge.db": "ForgeDB" };
/** The database extensions the bot loaded, preferred one first. */
function loadedDatabaseExtensions(client) {
    const extensions = client.options.extensions ?? [];
    const out = [];
    for (const name of exports.DATABASE_EXTENSIONS) {
        const extension = extensions.find((x) => x.name === name);
        if (extension)
            out.push({ name, label: LABELS[name], extension });
    }
    return out;
}
exports.MISSING_DATABASE = "[ReForgeGiveaways] Needs a database extension: add new ReForgeDB() (npm i github:Demonic1594/ReForgeDB) or new ForgeDB() (npm i @tryforge/forge.db) to your extensions.";
function isManagerClass(value) {
    return typeof value === "function" && typeof value.prototype?.getDB === "function";
}
/**
 * The `DataBaseManager` a loaded extension's package exports, found through
 * the module cache so it is the very copy the bot loaded. Undefined when the
 * module is not in the cache (a bundled bot, for example).
 */
function exportedManager(extension) {
    const ctor = extension.constructor;
    for (const mod of Object.values(require.cache)) {
        try {
            const exports = mod?.exports;
            if (exports && typeof exports === "object" && exports[ctor.name] === ctor && isManagerClass(exports.DataBaseManager))
                return exports.DataBaseManager;
        }
        catch {
            // A module with odd exports (a throwing getter or proxy): not ours.
        }
    }
    return undefined;
}
/**
 * Finds the `DataBaseManager` class of the database extension to store
 * giveaways with. Call it once the client finished loading its extensions.
 * Both packages set `client.db` to their `DataBase` class, which extends
 * their `DataBaseManager`. With both loaded, `client.db` is whichever loaded
 * last, so ReForgeDB's own exports are used instead.
 */
function resolveDatabaseManager(client) {
    const loaded = loadedDatabaseExtensions(client);
    if (!loaded.length)
        throw new Error(exports.MISSING_DATABASE);
    const [preferred, other] = loaded;
    const db = client.db;
    const fromClient = typeof db === "function" ? Object.getPrototypeOf(db) : undefined;
    const manager = (other && exportedManager(preferred.extension)) || (isManagerClass(fromClient) ? fromClient : undefined) || exportedManager(preferred.extension);
    if (!manager) {
        throw new Error(`[ReForgeGiveaways] ${preferred.label} is in your extensions but did not set up its database (client.db is ${db === undefined ? "missing" : "not its DataBase class"}). Check the errors ${preferred.label} logged at start-up.`);
    }
    return { name: preferred.name, label: preferred.label, manager, alsoLoaded: other?.label };
}
//# sourceMappingURL=databaseExtension.js.map