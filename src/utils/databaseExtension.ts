import type { ForgeClient } from "@tryforge/forgescript"
import type { DataSource, EntitySchema, MixedList } from "typeorm"
import { ReForgeGiveawaysLogger as log } from "./logger"

/** The database extensions ReForgeGiveaways can store its giveaways with. ReForgeDB first. */
export const DATABASE_EXTENSIONS = ["reforge.db", "forge.db"] as const
export type DatabaseExtensionName = (typeof DATABASE_EXTENSIONS)[number]

const PACKAGES: Record<DatabaseExtensionName, string> = {
    "reforge.db": "@tryforge/reforge.db",
    "forge.db": "@tryforge/forge.db",
}

export const SWITCH_GUIDE = "https://github.com/Demonic1594/ReForgeDB#switching-from-forgedb"

type Entities = MixedList<Function | string | EntitySchema>

/** What ReForgeGiveaways needs from ForgeDB's and ReForgeDB's `DataBaseManager`: the same in both. */
export interface DataBaseManagerLike {
    database: string
    entityManager: { sqlite: Entities; mongodb: Entities; mysql: Entities; postgres: Entities }
}
export type DataBaseManagerClass = abstract new () => DataBaseManagerLike

/**
 * The database extension the bot loaded: ReForgeDB (`reforge.db`) or ForgeDB
 * (`forge.db`), ReForgeDB when both are there, `null` when neither is.
 */
export function findDatabaseExtension(client: ForgeClient): DatabaseExtensionName | null {
    const names = new Set((client.options.extensions ?? []).map((x) => x.name))
    return DATABASE_EXTENSIONS.find((name) => names.has(name)) ?? null
}

/** The `DataBaseManager` class of the package that belongs to a database extension. */
export function loadDataBaseManager(name: DatabaseExtensionName): DataBaseManagerClass {
    const pkg = PACKAGES[name]
    let mod: { DataBaseManager?: DataBaseManagerClass }
    try {
        mod = require(pkg)
    } catch (err) {
        throw new Error(`[ReForgeGiveaways] The ${name} extension is loaded, but its package ${pkg} could not be required: ${(err as Error).message}`)
    }
    if (typeof mod.DataBaseManager !== "function") throw new Error(`[ReForgeGiveaways] ${pkg} has no DataBaseManager export`)
    return mod.DataBaseManager
}

/**
 * Connects a database named `database` with `entities` through the extension's
 * `DataBaseManager`, using the settings given to `new ReForgeDB()` or
 * `new ForgeDB()`.
 */
export function connectThrough(Base: DataBaseManagerClass, database: string, entities: DataBaseManagerLike["entityManager"]): Promise<DataSource> {
    class GiveawaysConnection extends Base {
        database = database
        entityManager = entities
        connect(): Promise<DataSource> {
            // getDB is protected in ForgeDB's typings and public in ReForgeDB's.
            return (this as unknown as { getDB(): Promise<DataSource> }).getDB()
        }
    }
    return new GiveawaysConnection().connect()
}

/**
 * Shared by every ReForge extension in the process: the reminder to switch
 * from ForgeDB to ReForgeDB is shown once, however many of them notice.
 */
const REMINDED = Symbol.for("reforge.forgeDBReminder")

/** Shows the reminder to switch to ReForgeDB once per process. Returns whether it was shown now. */
export function remindToSwitch(): boolean {
    const store = globalThis as unknown as Record<symbol, boolean>
    if (store[REMINDED]) return false
    store[REMINDED] = true
    log.info(
        "This bot uses ForgeDB (forge.db). Consider switching to ReForgeDB (reforge.db): it keeps using your existing data as it is, " +
            `and with other ReForge extensions it means fewer complications, better compatibility and a better experience. How to switch: ${SWITCH_GUIDE}`
    )
    return true
}
