"use strict"
/*
 * Starts ReForgeGiveaways with a given set of database extensions in its own
 * process (ForgeDB and ReForgeDB keep one configuration per process), starts
 * and ends one giveaway, and prints what happened as JSON on the last line.
 *
 * Usage: node extension.js <folder> <extensions: reforge.db,forge.db or none> <options JSON>
 */
const { ForgeClient, Logger } = require("@tryforge/forgescript")
const { ReForgeGiveaways, Database, remindToSwitch } = require("../..")

const [folder, which, optionsJson] = process.argv.slice(2)
const logs = []
Logger.log = (_p, _t, ...a) => logs.push(a.map(String).join(" "))
for (const level of ["info", "warn", "error"]) Logger[level] = (...a) => logs.push(a.map(String).join(" "))

const extensions = []
for (const name of which === "none" ? [] : which.split(",")) {
    if (name === "reforge.db") extensions.push(new (require("@tryforge/reforge.db").ReForgeDB)({ type: "better-sqlite3", folder, logLevel: "warn", cooldownSweepInterval: 0 }))
    if (name === "forge.db") extensions.push(new (require("@tryforge/forge.db").ForgeDB)({ type: "better-sqlite3", folder }))
}

;(async () => {
    const keepAlive = setInterval(() => {}, 1000)
    const result = { logs }
    try {
        const giveaways = new ReForgeGiveaways({ handleSignals: false, ...JSON.parse(optionsJson || "{}") })
        const client = new ForgeClient({ intents: ["Guilds"], extensions: [giveaways, ...extensions] })
        client.isReady = () => true
        const manager = giveaways.giveawaysManager
        await manager.whenReady()
        manager.getChannel = async () => ({ id: "200000000000000000", isTextBased: () => true, send: async () => ({ id: "500000000000000001", edit: async () => {} }) })
        manager.guildStatus = async () => "ok"
        manager.getGuild = async () => ({ id: "300000000000000000", members: { cache: new Map(), fetch: async () => new Map() } })
        manager.fetchMessage = async () => ({ id: "500000000000000001", edit: async () => {}, reactions: { cache: [] } })
        const g = await manager.start({ prize: "Prize", duration: 86_400_000, winnersCount: 1, hostID: "100000000000000001", guildID: "300000000000000000", channelID: "200000000000000000" })
        const ended = await manager.end(g.id)
        result.extension = giveaways.databaseExtension
        result.stored = (await Database.get(g.id))?.hasEnded === true && ended.hasEnded === true
        // A second ReForge extension asking again (only when ForgeDB is used): never shown twice.
        if (giveaways.databaseExtension === "forge.db") result.remindAgain = remindToSwitch()
        await manager.destroy()
    } catch (err) {
        result.error = String(err?.message ?? err)
    }
    clearInterval(keepAlive)
    console.log(JSON.stringify(result))
    process.exit(0)
})()
