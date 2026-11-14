"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SWITCH_GUIDE = exports.DATABASE_EXTENSIONS = void 0;
exports.findDatabaseExtension = findDatabaseExtension;
exports.loadDataBaseManager = loadDataBaseManager;
exports.connectThrough = connectThrough;
exports.remindToSwitch = remindToSwitch;
const logger_1 = require("./logger");
/** The database extensions ReForgeGiveaways can store its giveaways with. ReForgeDB first. */
exports.DATABASE_EXTENSIONS = ["reforge.db", "forge.db"];
const PACKAGES = {
    "reforge.db": "@tryforge/reforge.db",
    "forge.db": "@tryforge/forge.db",
};
exports.SWITCH_GUIDE = "https://github.com/Demonic1594/ReForgeDB#switching-from-forgedb";
/**
 * The database extension the bot loaded: ReForgeDB (`reforge.db`) or ForgeDB
 * (`forge.db`), ReForgeDB when both are there, `null` when neither is.
 */
function findDatabaseExtension(client) {
    const names = new Set((client.options.extensions ?? []).map((x) => x.name));
    return exports.DATABASE_EXTENSIONS.find((name) => names.has(name)) ?? null;
}
/** The `DataBaseManager` class of the package that belongs to a database extension. */
function loadDataBaseManager(name) {
    const pkg = PACKAGES[name];
    let mod;
    try {
        mod = require(pkg);
    }
    catch (err) {
        throw new Error(`[ReForgeGiveaways] The ${name} extension is loaded, but its package ${pkg} could not be required: ${err.message}`);
    }
    if (typeof mod.DataBaseManager !== "function")
        throw new Error(`[ReForgeGiveaways] ${pkg} has no DataBaseManager export`);
    return mod.DataBaseManager;
}
/**
 * Connects a database named `database` with `entities` through the extension's
 * `DataBaseManager`, using the settings given to `new ReForgeDB()` or
 * `new ForgeDB()`.
 */
function connectThrough(Base, database, entities) {
    class GiveawaysConnection extends Base {
        database = database;
        entityManager = entities;
        connect() {
            // getDB is protected in ForgeDB's typings and public in ReForgeDB's.
            return this.getDB();
        }
    }
    return new GiveawaysConnection().connect();
}
/**
 * Shared by every ReForge extension in the process: the reminder to switch
 * from ForgeDB to ReForgeDB is shown once, however many of them notice.
 */
const REMINDED = Symbol.for("reforge.forgeDBReminder");
/** Shows the reminder to switch to ReForgeDB once per process. Returns whether it was shown now. */
function remindToSwitch() {
    const store = globalThis;
    if (store[REMINDED])
        return false;
    store[REMINDED] = true;
    logger_1.ReForgeGiveawaysLogger.info("This bot uses ForgeDB (forge.db). Consider switching to ReForgeDB (reforge.db): it keeps using your existing data as it is, " +
        `and with other ReForge extensions it means fewer complications, better compatibility and a better experience. How to switch: ${exports.SWITCH_GUIDE}`);
    return true;
}
//# sourceMappingURL=databaseExtension.js.map