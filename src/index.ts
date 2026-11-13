import { EventManager, ForgeClient, ForgeExtension, Logger } from "@tryforge/forgescript"
import { ButtonStyle, ColorResolvable } from "discord.js"
import { GiveawaysCommandManager, GiveawaysManager } from "./managers"
import { GiveawaysInteractionHandler, GiveawaysReactionHandler, IGiveawayEvents } from "./handlers"
import { TypedEmitter } from "tiny-typed-emitter"
import { TransformEvents } from "@tryforge/forge.db"
import { Database, DEFAULT_MESSAGES, GiveawayMessages } from "./structures"
import { GiveawaysErrorType } from "./functions/error"
import noop from "./functions/noop"
import { shardIdFor } from "./utils"
import { description, version } from "../package.json"

/** Longest the shutdown handler waits for pending writes before letting the process stop. */
const SHUTDOWN_TIMEOUT = 5000

/** The shards this process runs, if the bot is split over several processes. */
function ownedShards(client: ForgeClient): { ids: number[], count: number } | null {
    if (client.shard) return { ids: client.shard.ids, count: client.shard.count }
    const { shards, shardCount } = client.options
    if (Array.isArray(shards) && typeof shardCount === "number" && shards.length < shardCount) return { ids: shards, count: shardCount }
    return null
}

export interface IReForgeGiveawaysOptions {
    /** The giveaway events to use. */
    events?: Array<keyof IGiveawayEvents>

    /** Whether to use the default giveaway messages. Defaults to `true`. */
    useDefault?: boolean

    /** Whether to use reactions for entering the giveaways. Defaults to `false`. */
    useReactions?: boolean

    /** Emoji on the entry button, or the reaction used for entering. Defaults to `🎉`. */
    emoji?: string

    /** Label of the entry button. Defaults to `Join`. */
    buttonLabel?: string

    /** Style of the entry button. Defaults to `ButtonStyle.Success`. */
    buttonStyle?: ButtonStyle

    /** Whether the entry button shows a live entry count, e.g. "Join (42)". Defaults to `true`. */
    showEntryCount?: boolean

    /** Show an "ℹ️" button that tells members their status, tickets and win chance. Defaults to `true`. */
    showInfoButton?: boolean

    /**
     * Minimum ms between two join/leave clicks of the same member on the same
     * giveaway, against spam. `0` disables it. Defaults to `3000`.
     */
    entryCooldown?: number

    /** Whether winners get a direct message. Defaults to `false`. */
    dmWinners?: boolean

    /** Embed colors of the default messages. */
    colors?: { active?: ColorResolvable, paused?: ColorResolvable, ended?: ColorResolvable, cancelled?: ColorResolvable }

    /** Override any text of the default messages. See `DEFAULT_MESSAGES`. */
    messages?: Partial<GiveawayMessages>

    /**
     * Entry changes are written to the database at most once per this many ms
     * per giveaway, so a rush of clicks costs one write instead of hundreds.
     * `0` writes on every click. Defaults to `1000`.
     */
    entryFlushDelay?: number

    /** Minimum ms between refreshes of the live entry count. Defaults to `5000`. */
    messageUpdateDelay?: number

    /** Delete ended giveaways from the database this many ms after they ended. Off by default. */
    deleteEndedAfter?: number | null

    /** Flush pending writes on SIGINT/SIGTERM before the process exits. Defaults to `true`. */
    handleSignals?: boolean
}

export class ReForgeGiveaways extends ForgeExtension {
    name = "reforge.giveaways"
    description = description
    version = version
    requireExtensions = ["forge.db"]

    public emitter = new TypedEmitter<TransformEvents<IGiveawayEvents>>()

    public giveawaysManager!: GiveawaysManager
    public commands!: GiveawaysCommandManager

    public constructor(public readonly options: IReForgeGiveawaysOptions = {}) {
        super()
        const o = this.options
        o.useDefault ??= true
        o.useReactions ??= false
        o.emoji ||= "🎉"
        o.buttonLabel ||= "Join"
        o.buttonStyle ??= ButtonStyle.Success
        o.showEntryCount ??= true
        o.showInfoButton ??= true
        o.entryCooldown = Math.max(0, o.entryCooldown ?? 3000)
        o.dmWinners ??= false
        o.entryFlushDelay = Math.max(0, o.entryFlushDelay ?? 1000)
        o.messageUpdateDelay = Math.max(1000, o.messageUpdateDelay ?? 5000)
        o.handleSignals ??= true
        o.colors = { active: "Green", paused: "Yellow", ended: "Red", cancelled: "Grey", ...o.colors }
        // Only real texts override a default: `{ joined: undefined }` must not blank it.
        const texts = Object.entries(o.messages ?? {}).filter(([key, text]) => key in DEFAULT_MESSAGES && typeof text === "string")
        o.messages = { ...DEFAULT_MESSAGES, ...Object.fromEntries(texts) }
    }

    public async init(client: ForgeClient) {
        this.commands = new GiveawaysCommandManager(client)

        EventManager.load("ReForgeGiveawaysEvents", __dirname + "/events")
        this.load(__dirname + "/native")

        if (this.options.useReactions) {
            new GiveawaysReactionHandler(client)
            if (!client.options.intents.has("GuildMessageReactions")) {
                Logger.warn(`[ReForgeGiveaways] Intent "GuildMessageReactions" must be defined for reactions to function`)
            }
        } else {
            new GiveawaysInteractionHandler(client)
        }

        if (this.options.events?.length) client.events.load("ReForgeGiveawaysEvents", this.options.events)
        if (!this.options.useDefault && !this.options.events?.includes("giveawayStart")) {
            throw new Error(GiveawaysErrorType.MissingStartEvent)
        }

        // With several processes (sharding), each one only looks after the
        // giveaways of its own guilds; otherwise every process would draw
        // and announce every giveaway.
        const shards = ownedShards(client)
        if (shards) Database.owns = (guildID) => shards.ids.includes(shardIdFor(guildID, shards.count))

        // The manager exists right away; its methods wait for the database.
        this.giveawaysManager = new GiveawaysManager(client, this)
        if (this.options.handleSignals) this.#handleSignals()

        await this.#connect()
        this.giveawaysManager._onDatabaseReady()
    }

    /**
     * Connects to the database, retrying with backoff (1 s up to 60 s) if it is
     * unreachable at boot, instead of failing once and leaving every giveaway
     * function waiting forever.
     */
    async #connect() {
        for (let attempt = 0; ; attempt++) {
            try {
                await new Database(this.emitter).init()
                if (attempt) Logger.info(`[ReForgeGiveaways] Database connected after ${attempt + 1} attempts`)
                return
            } catch (e) {
                const wait = Math.min(1000 * 2 ** attempt, 60_000)
                Logger.error(`[ReForgeGiveaways] Could not connect to the database (attempt ${attempt + 1}), retrying in ${wait / 1000}s:`, e)
                await new Promise((r) => setTimeout(r, wait))
            }
        }
    }

    #handleSignals() {
        for (const signal of ["SIGINT", "SIGTERM"] as const) {
            process.once(signal, () => {
                // Don't let a hanging database keep the process from stopping.
                const limit = new Promise<void>((r) => setTimeout(r, SHUTDOWN_TIMEOUT))
                Promise.race([this.giveawaysManager.destroy().catch(noop), limit]).finally(() => {
                    // Re-raise with the default handler unless someone else handles it.
                    if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
                })
            })
        }
    }
}

export * from "./handlers"
export * from "./managers"
export * from "./structures"
export * from "./types"
export * from "./utils"
