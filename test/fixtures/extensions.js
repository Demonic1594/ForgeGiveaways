"use strict"
// Boots giveaways with a given list of database extensions in its own process
// (ReForgeDB and ForgeDB keep their configuration in module state) and reports
// where the giveaway was stored and what was logged.
const fs = require("fs")
const path = require("path")
const { Logger, LogType } = require("@tryforge/forgescript")
const { boot, snow, DAY } = require("./harness")
const { Database } = require("../..")

const [, , dir, scenario] = process.argv
const logs = []
const record = (level) => (...args) => logs.push({ level, text: args.map(String).join(" ") })
for (const level of ["info", "warn", "error"]) Logger[level] = record(level)
// ReForgeGiveaways writes through Logger.log (with its own level gate).
Logger.log = (_priority, type, ...args) => record(String(LogType[type] ?? type).toLowerCase())(...args)

const reforge = (folder) => new (require("@tryforge/reforge.db").ReForgeDB)({ type: "better-sqlite3", folder, logLevel: "warn" })
const forge = (folder) => new (require("@tryforge/forge.db").ForgeDB)({ type: "better-sqlite3", folder })
const a = path.join(dir, "a")
const b = path.join(dir, "b")
fs.mkdirSync(a)
fs.mkdirSync(b)

const scenarios = {
    reforgeFirst: (g) => [reforge(a), g],
    forgeFirst: (g) => [forge(a), g],
    bothReForgeLast: (g) => [g, forge(b), reforge(a)],
    bothForgeLast: (g) => [reforge(a), g, forge(b)],
}

;(async () => {
    setInterval(() => {}, 1000)
    const h = await boot(dir, { autoMembers: true, extensions: scenarios[scenario] })
    const g = await h.manager.start({ prize: "Prize", winnersCount: 1, hostID: snow(), guildID: h.guild.id, channelID: h.channel.id, duration: DAY })
    const stored = await Database.get(g.id)
    await h.manager.destroy()
    process.stdout.write(
        JSON.stringify({
            stored: stored?.id === g.id,
            files: { a: fs.readdirSync(a).filter((f) => f.endsWith(".db")).sort(), b: fs.readdirSync(b).filter((f) => f.endsWith(".db")).sort() },
            logs: logs.filter((l) => l.text.includes("[ReForgeGiveaways]")),
        }) + "\n"
    )
    process.exit(0)
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
