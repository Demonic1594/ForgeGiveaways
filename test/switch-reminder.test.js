"use strict"
/*
 * ReForgeGiveaways stores its giveaways with ReForgeDB (reforge.db) or ForgeDB
 * (forge.db), whichever the bot loaded, and reminds ForgeDB users once to
 * switch. Every case runs in its own process (see fixtures/extension.js).
 */
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const { ReForgeGiveaways, ReForgeGiveawaysLogger } = require("..")

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gw-db-"))
function run(which, options = {}, env = {}) {
    const out = execFileSync(process.execPath, [path.join(__dirname, "fixtures", "extension.js"), tmp(), which, JSON.stringify(options)], {
        encoding: "utf8",
        env: { ...process.env, ...env },
    })
    return JSON.parse(out.trim().split("\n").filter((l) => l.startsWith("{")).pop())
}
const reminders = (r) => r.logs.filter((l) => l.includes("Consider switching to ReForgeDB"))

test("with ReForgeDB only, giveaways are stored through it and no reminder is shown", () => {
    const r = run("reforge.db")
    assert.equal(r.error, undefined)
    assert.equal(r.extension, "reforge.db")
    assert.equal(r.stored, true)
    assert.deepEqual(reminders(r), [])
})

test("with ForgeDB only, giveaways work and the reminder to switch is shown once per process", () => {
    const r = run("forge.db")
    assert.equal(r.error, undefined)
    assert.equal(r.extension, "forge.db")
    assert.equal(r.stored, true)
    assert.equal(reminders(r).length, 1)
    assert.match(reminders(r)[0], /^\[ReForgeGiveaways\] .*existing data.*fewer complications, better compatibility and a better experience.*#switching-from-forgedb/)
    assert.equal(r.remindAgain, false, "another ReForge extension asking again does not show it twice")
})

test("the reminder follows logLevel: warn hides it", () => {
    assert.deepEqual(reminders(run("forge.db", { logLevel: "warn" })), [])
    assert.deepEqual(reminders(run("forge.db", {}, { REFORGEGIVEAWAYS_LOG_LEVEL: "warn" })), [])
})

test("with both, ReForgeDB is used, a warning says so, and no reminder is shown", () => {
    const r = run("reforge.db,forge.db")
    assert.equal(r.error, undefined)
    assert.equal(r.extension, "reforge.db")
    assert.equal(r.stored, true)
    assert.ok(r.logs.some((l) => /Both ReForgeDB and ForgeDB are loaded.*giveaways use ReForgeDB/.test(l)))
    assert.deepEqual(reminders(r), [])
})

test("with neither, the bot stops at start-up with a message naming both", () => {
    const r = run("none")
    assert.match(r.error, /^\[ReForgeGiveaways\] Needs a database extension.*new ReForgeDB\(\).*new ForgeDB\(\)/)
})

test("logLevel: an invalid value is refused; debug shows each giveaway action", () => {
    assert.throws(() => new ReForgeGiveaways({ logLevel: "verbose" }), /"logLevel" must be one of/)
    const r = run("reforge.db", { logLevel: "debug" })
    assert.ok(r.logs.some((l) => /^\[ReForgeGiveaways\] database connected through reforge\.db \(better-sqlite3\)/.test(l)), r.logs.join("\n"))
    assert.ok(r.logs.some((l) => /^\[ReForgeGiveaways\] giveawayStart giveaway \d+ \(Prize\)/.test(l)))
    assert.ok(r.logs.some((l) => /^\[ReForgeGiveaways\] giveawayEnd giveaway \d+ \(Prize\)/.test(l)))
    assert.equal(ReForgeGiveawaysLogger.level, "info", "a bot's option in another process does not leak here")
})
