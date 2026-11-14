import type { IGiveawayEvents } from "../handlers/GiveawaysEventHandler";
import type { DataBaseManagerClass, EntitiesByDriver, TransformEvents } from "../utils/databaseExtension";
import { TypedEmitter } from "tiny-typed-emitter";
import { Snowflake } from "discord.js";
import { Giveaway, IGiveaway, MongoGiveaway } from "./Giveaway";
import { DriverKind } from "./schema";
export type AnyGiveaway = typeof Giveaway | typeof MongoGiveaway;
export type IGiveawayFindOptions = Partial<Omit<IGiveaway, "entries" | "winners" | "previousWinners" | "requirements" | "bonusEntries" | "display">>;
/**
 * Giveaway storage.
 *
 * Active (not yet ended) giveaways are kept in memory after start-up, so
 * looking one up when somebody clicks "Join" costs no database query. Every
 * write still goes to the database. This assumes one bot process owns the
 * giveaway table, which is how ForgeScript bots normally run.
 */
export declare class Database {
    private readonly emitter;
    /** The database (SQLite: the file) giveaways are stored in. */
    readonly database = "giveaways.db";
    readonly entityManager: EntitiesByDriver;
    static entities: {
        Giveaway: AnyGiveaway;
    };
    static driver: DriverKind;
    private db;
    private static db;
    private static schema;
    private static emitter;
    /** Active giveaways by id. */
    private static readonly active;
    /** Message id to giveaway id, for active giveaways. */
    private static readonly byMessage;
    /**
     * @param manager The `DataBaseManager` class of the database extension the
     * bot loaded (ReForgeDB or ForgeDB; see `resolveDatabaseManager`). Its
     * connection settings are used, with a database of its own for giveaways.
     */
    constructor(emitter: TypedEmitter<TransformEvents<IGiveawayEvents>>, manager: DataBaseManagerClass);
    init(): Promise<void>;
    /** The TypeORM driver in use (`sqlite`, `better-sqlite3`, `postgres`, ...), or undefined before connecting. */
    static get driverName(): string | undefined;
    /** Whether the database finished connecting. */
    static get ready(): boolean;
    private static repo;
    /** Creates a new, unsaved giveaway instance of the right class for the driver. */
    static create(options: ConstructorParameters<typeof Giveaway>[0]): Giveaway;
    /**
     * Whether this process is responsible for a guild's giveaways. Always true
     * unless the bot is split over several processes (sharding), where each
     * process only times, draws and caches the giveaways of its own guilds.
     */
    static owns: (guildID: Snowflake) => boolean;
    private static track;
    private static untrack;
    /** Loads every active giveaway into memory. */
    static loadActive(): Promise<Giveaway[]>;
    /** Active giveaways currently held in memory. */
    static activeGiveaways(): Giveaway[];
    /** Whether a giveaway is active and held in memory. */
    static isActive(id: Snowflake): boolean;
    /** The in-memory copy of an active giveaway, without touching the database. */
    static peek(id: Snowflake): Giveaway | null;
    /**
     * Swaps database rows of active giveaways for their in-memory copies,
     * which also hold entry changes that are still waiting to be written.
     */
    static live<T extends Giveaway>(rows: T[]): T[];
    /**
     * Gets an existing giveaway.
     * @param id The id of the giveaway to get.
     */
    static get(id: Snowflake): Promise<Giveaway | null>;
    /**
     * Gets a giveaway by the message it is attached to.
     */
    static getByMessage(messageID: Snowflake, channelID?: Snowflake): Promise<Giveaway | null>;
    /** Ended giveaways whose result was never announced (the bot stopped mid-way). */
    static findPendingAnnouncements(): Promise<Giveaway[]>;
    /**
     * Ids of giveaways that ended before `cutoff` and are done being announced.
     * Only the columns needed to decide are loaded, not the entry lists.
     */
    static findEndedBefore(cutoff: number): Promise<string[]>;
    /** Gets all existing giveaways. */
    static getAll(): Promise<Giveaway[]>;
    /**
     * Finds existing giveaways matching the provided data.
     * @param data The data to use for searching.
     * @param amount The amount of results to return.
     */
    static find(data?: IGiveawayFindOptions, amount?: number): Promise<Giveaway[]>;
    /**
     * Saves a giveaway in the database.
     * @param data The giveaway data to save.
     */
    static set(data: Giveaway | MongoGiveaway): Promise<void>;
    /**
     * Deletes an existing giveaway from the database.
     * @param id The id of the giveaway to delete.
     */
    static delete(id: Snowflake): Promise<import("typeorm").DeleteResult>;
    /** Deletes several giveaways by id. */
    static deleteMany(ids: Snowflake[]): Promise<number>;
    /**
     * Wipes the entire database.
     */
    static wipe(): Promise<void>;
}
//# sourceMappingURL=Database.d.ts.map