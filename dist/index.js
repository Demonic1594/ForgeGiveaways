"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReForgeGiveaways = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const discord_js_1 = require("discord.js");
const managers_1 = require("./managers");
const handlers_1 = require("./handlers");
const tiny_typed_emitter_1 = require("tiny-typed-emitter");
const structures_1 = require("./structures");
const error_1 = require("./functions/error");
const noop_1 = __importDefault(require("./functions/noop"));
const utils_1 = require("./utils");
const logger_1 = require("./utils/logger");
const package_json_1 = require("../package.json");
/** Longest the shutdown handler waits for pending writes before letting the process stop. */
const SHUTDOWN_TIMEOUT = 5000;
/** The shards this process runs, if the bot is split over several processes. */
function ownedShards(client) {
    if (client.shard)
        return { ids: client.shard.ids, count: client.shard.count };
    const { shards, shardCount } = client.options;
    if (Array.isArray(shards) && typeof shardCount === "number" && shards.length < shardCount)
        return { ids: shards, count: shardCount };
    return null;
}
class ReForgeGiveaways extends forgescript_1.ForgeExtension {
    options;
    name = "reforge.giveaways";
    description = package_json_1.description;
    version = package_json_1.version;
    /** The database extension the giveaways are stored with, once connected: `reforge.db` or `forge.db`. */
    databaseExtension = null;
    emitter = new tiny_typed_emitter_1.TypedEmitter();
    giveawaysManager;
    commands;
    constructor(options = {}) {
        super();
        this.options = options;
        const o = this.options;
        if (o.logLevel !== undefined) {
            if (!(0, logger_1.isLogLevel)(o.logLevel))
                throw new Error(`[ReForgeGiveaways] "logLevel" must be one of ${logger_1.LOG_LEVELS.join(", ")}, got ${JSON.stringify(o.logLevel)}`);
            logger_1.ReForgeGiveawaysLogger.level = o.logLevel;
        }
        o.useDefault ??= true;
        o.useReactions ??= false;
        o.emoji ||= "🎉";
        o.buttonLabel ||= "Join";
        o.buttonStyle ??= discord_js_1.ButtonStyle.Success;
        o.showEntryCount ??= true;
        o.showInfoButton ??= true;
        o.entryCooldown = Math.max(0, o.entryCooldown ?? 3000);
        o.dmWinners ??= false;
        o.entryFlushDelay = Math.max(0, o.entryFlushDelay ?? 1000);
        o.messageUpdateDelay = Math.max(1000, o.messageUpdateDelay ?? 5000);
        o.handleSignals ??= true;
        o.colors = { active: "Green", paused: "Yellow", ended: "Red", cancelled: "Grey", ...o.colors };
        // Fail at start-up with a clear message instead of on every giveaway.
        for (const [name, color] of Object.entries(o.colors)) {
            try {
                (0, discord_js_1.resolveColor)(color);
            }
            catch {
                throw new Error(`[ReForgeGiveaways] Invalid color for "${name}": ${String(color)}`);
            }
        }
        // Only real texts override a default: `{ joined: undefined }` must not blank it.
        const texts = Object.entries(o.messages ?? {}).filter(([key, text]) => key in structures_1.DEFAULT_MESSAGES && typeof text === "string");
        o.messages = { ...structures_1.DEFAULT_MESSAGES, ...Object.fromEntries(texts) };
    }
    /**
     * Giveaways are stored with ReForgeDB or ForgeDB, whichever the bot
     * loaded (ReForgeDB when both are). `requireExtensions` can only name one
     * extension, so this checks for either one the same way: before loading.
     */
    validateAndInit(client) {
        const loaded = (0, utils_1.loadedDatabaseExtensions)(client);
        if (!loaded.length)
            throw new Error(utils_1.MISSING_DATABASE);
        // ForgeDB alone: remind once that ReForgeDB is the better fit.
        if (loaded[0].name === "forge.db")
            (0, utils_1.remindToSwitch)();
        super.validateAndInit(client);
    }
    async init(client) {
        this.commands = new managers_1.GiveawaysCommandManager(client);
        forgescript_1.EventManager.load("ReForgeGiveawaysEvents", __dirname + "/events");
        this.load(__dirname + "/native");
        if (this.options.useReactions) {
            new handlers_1.GiveawaysReactionHandler(client);
            if (!client.options.intents.has("GuildMessageReactions")) {
                logger_1.ReForgeGiveawaysLogger.warn(`Intent "GuildMessageReactions" must be defined for reactions to function`);
            }
        }
        else {
            new handlers_1.GiveawaysInteractionHandler(client);
        }
        if (this.options.events?.length)
            client.events.load("ReForgeGiveawaysEvents", this.options.events);
        if (!this.options.useDefault && !this.options.events?.includes("giveawayStart")) {
            throw new Error(error_1.GiveawaysErrorType.MissingStartEvent);
        }
        // With several processes (sharding), each one only looks after the
        // giveaways of its own guilds; otherwise every process would draw
        // and announce every giveaway.
        const shards = ownedShards(client);
        if (shards)
            structures_1.Database.owns = (guildID) => shards.ids.includes((0, utils_1.shardIdFor)(guildID, shards.count));
        // The manager exists right away; its methods wait for the database.
        this.giveawaysManager = new managers_1.GiveawaysManager(client, this);
        if (this.options.handleSignals)
            this.#handleSignals();
        await this.#connect(client);
        this.giveawaysManager._onDatabaseReady();
    }
    /**
     * Connects to the database, retrying with backoff (1 s up to 60 s) if it is
     * unreachable at boot, instead of failing once and leaving every giveaway
     * function waiting forever.
     */
    async #connect(client) {
        // Extensions listed after this one have not loaded yet: wait until the
        // client finished loading all of them, so the database extension can
        // be anywhere in the list.
        await new Promise((r) => setImmediate(r));
        for (let attempt = 0;; attempt++) {
            try {
                const { name, label, manager, alsoLoaded } = (0, utils_1.resolveDatabaseManager)(client);
                if (!attempt) {
                    logger_1.ReForgeGiveawaysLogger.info(`Storing giveaways with ${label}`);
                    if (alsoLoaded)
                        logger_1.ReForgeGiveawaysLogger.warn(`Both ${label} and ${alsoLoaded} are loaded. They add the same functions, so keep only one (giveaways use ${label}).`);
                }
                await new structures_1.Database(this.emitter, manager).init();
                this.databaseExtension = name;
                logger_1.ReForgeGiveawaysLogger.debug(`database connected through ${name} (${structures_1.Database.driverName})`);
                if (attempt)
                    logger_1.ReForgeGiveawaysLogger.info(`Database connected after ${attempt + 1} attempts`);
                return;
            }
            catch (e) {
                const wait = Math.min(1000 * 2 ** attempt, 60_000);
                logger_1.ReForgeGiveawaysLogger.error(`Could not connect to the database (attempt ${attempt + 1}), retrying in ${wait / 1000}s:`, e);
                await new Promise((r) => setTimeout(r, wait));
            }
        }
    }
    #handleSignals() {
        for (const signal of ["SIGINT", "SIGTERM"]) {
            process.once(signal, () => {
                // Don't let a hanging database keep the process from stopping.
                const limit = new Promise((r) => setTimeout(r, SHUTDOWN_TIMEOUT));
                Promise.race([this.giveawaysManager.destroy().catch(noop_1.default), limit]).finally(() => {
                    // Re-raise with the default handler unless someone else handles it.
                    if (process.listenerCount(signal) === 0)
                        process.kill(process.pid, signal);
                });
            });
        }
    }
}
exports.ReForgeGiveaways = ReForgeGiveaways;
__exportStar(require("./handlers"), exports);
__exportStar(require("./managers"), exports);
__exportStar(require("./structures"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./utils"), exports);
//# sourceMappingURL=index.js.map