"use strict"
/*
 * Boots a real ForgeClient (never logs in) with ReForgeDB (or ForgeDB) on
 * better-sqlite3 and ReForgeGiveaways, and swaps the three Discord lookups the manager makes for
 * in-memory fakes. Everything else (scheduler, locking, persistence, the
 * renderer, winner drawing) is the real code.
 */
const path = require("path")
const { SnowflakeUtil } = require("discord.js")
const { ForgeClient } = require("@tryforge/forgescript")
const { ReForgeGiveaways } = require("../..")

const DAY = 864e5
const snow = (agoMs = 2 * 365 * DAY) => SnowflakeUtil.generate({ timestamp: Date.now() - agoMs }).toString()

/*
 * SQLite in `dir` by default. To run the single-process test files against
 * another database, put its database options in GIVEAWAYS_TEST_DB, e.g.
 * GIVEAWAYS_TEST_DB='{"type":"postgres","host":"127.0.0.1","username":"postgres","database":"giveaways_test"}'
 * (use an empty database; the driver, e.g. `pg`, must be installed).
 */
const database = (dir) => (process.env.GIVEAWAYS_TEST_DB ? JSON.parse(process.env.GIVEAWAYS_TEST_DB) : { type: "better-sqlite3", folder: dir })

/*
 * The database extension: ReForgeDB by default, the original ForgeDB with
 * GIVEAWAYS_TEST_DB_EXTENSION=forge.db.
 */
const DB_EXTENSION = process.env.GIVEAWAYS_TEST_DB_EXTENSION || "reforge.db"
const databaseExtensions = {
    "reforge.db": (options) => new (require("@tryforge/reforge.db").ReForgeDB)({ logLevel: "warn", ...options }),
    "forge.db": (options) => new (require("@tryforge/forge.db").ForgeDB)(options),
}
if (!databaseExtensions[DB_EXTENSION]) throw new Error(`GIVEAWAYS_TEST_DB_EXTENSION must be ${Object.keys(databaseExtensions).join(" or ")}`)
const databaseExtension = (dir, name = DB_EXTENSION) => databaseExtensions[name](database(dir))

async function boot(dir, options = {}) {
    // `extensions(giveaways, dir)` replaces the extension list (default: giveaways, then the database).
    const { autoMembers, extensions, ...extOptions } = options
    const giveaways = new ReForgeGiveaways({ handleSignals: false, entryFlushDelay: 50, messageUpdateDelay: 1000, ...extOptions })
    // Record every event from the very start (restore runs during boot).
    const emitted = []
    const realEmit = giveaways.emitter.emit.bind(giveaways.emitter)
    giveaways.emitter.emit = (name, ...args) => { emitted.push({ name, args }); return realEmit(name, ...args) }
    const client = new ForgeClient({
        intents: ["Guilds"],
        extensions: extensions ? extensions(giveaways, dir) : [giveaways, databaseExtension(dir)],
    })
    const manager = giveaways.giveawaysManager
    // Never logs in; pretend to be connected so deadlines are not postponed.
    client.isReady = () => true
    await manager.whenReady()

    const sent = []
    const deleted = []
    let nextMsg = 0
    const messages = new Map()
    const makeMessage = (payload) => {
        const id = snow(0).slice(0, -3) + String(100 + nextMsg++)
        const msg = {
            id,
            payloads: [payload],
            channel: channel,
            edit: async (p) => { msg.payloads.push(p); return msg },
            reply: async (p) => { sent.push({ replyTo: id, ...p }); return makeMessage(p) },
            react: async () => {},
            delete: async () => { messages.delete(id); deleted.push(id) },
            reactions: { cache: [] },
        }
        messages.set(id, msg)
        return msg
    }
    const channel = {
        id: "200000000000000000",
        isTextBased: () => true,
        send: async (p) => { sent.push(p); return makeMessage(p) },
    }

    const members = new Map()
    const guild = {
        id: "300000000000000000",
        name: "Test Guild",
        members: {
            cache: new Map(),
            fetch: async (arg) => {
                if (typeof arg === "string") {
                    const m = members.get(arg) ?? (autoMembers ? addMember(arg) : undefined)
                    // What Discord answers for somebody who is not in the guild.
                    if (!m) throw Object.assign(new Error("Unknown Member"), { code: 10007 })
                    return m
                }
                const out = new Map()
                for (const id of arg.user) {
                    if (!members.has(id) && autoMembers) addMember(id)
                    if (members.has(id)) out.set(id, members.get(id))
                }
                return out
            },
        },
    }
    // Plain objects are accepted by requirementDenyReason (API member shape).
    const addMember = (id, roles = []) => {
        const m = { id, user: { id }, roles, joined_at: new Date(Date.now() - 365 * DAY).toISOString() }
        members.set(id, m)
        return m
    }

    manager.getChannel = async () => channel
    let guildState = "ok"
    manager.guildStatus = async () => guildState
    manager.getGuild = async () => guild
    manager.fetchMessage = async (_c, id) => messages.get(id)

    return { emitted, client, giveaways, manager, sent, deleted, messages, addMember, members, guild, channel, dir, setGuildState: (v) => { guildState = v } }
}

module.exports = { boot, snow, DAY, DB_EXTENSION, databaseExtension, database, dbFile: (dir) => path.join(dir, "giveaways.db") }
