"use strict"
// Giveaways work with ReForgeDB or ForgeDB, wherever it is in the extension
// list, and prefer ReForgeDB when both are loaded.
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const { ForgeClient } = require("@tryforge/forgescript")
const { ReForgeGiveaways, MISSING_DATABASE, DATABASE_EXTENSIONS, GiveawaysDatabaseManager } = require("..")

const run = (scenario) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reforge-giveaways-ext-"))
    const stdout = execFileSync(process.execPath, [path.join(__dirname, "fixtures/extensions.js"), dir, scenario], { encoding: "utf8" })
    return JSON.parse(stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop())
}
const texts = (r, level) => r.logs.filter((l) => l.level === level).map((l) => l.text)

test("without a database extension the client refuses to start, naming both options", () => {
    assert.throws(() => new ForgeClient({ intents: ["Guilds"], extensions: [new ReForgeGiveaways({ handleSignals: false })] }), (e) => {
        assert.equal(e.message, MISSING_DATABASE)
        assert.match(e.message, /ReForgeDB/)
        assert.match(e.message, /ForgeDB\(\)/)
        return true
    })
})

test("ReForgeDB is preferred over ForgeDB", () => {
    assert.deepEqual([...DATABASE_EXTENSIONS], ["reforge.db", "forge.db"])
})

test("ReForgeDB listed before giveaways: stored in giveaways.db next to reforge.db", () => {
    const r = run("reforgeFirst")
    assert.ok(r.stored)
    assert.deepEqual(r.files.a, ["giveaways.db", "reforge.db"])
    assert.ok(texts(r, "info").some((t) => /Storing giveaways with ReForgeDB/.test(t)))
    assert.deepEqual(texts(r, "warn"), [])
})

test("ForgeDB listed before giveaways: stored in giveaways.db next to forge.db", () => {
    const r = run("forgeFirst")
    assert.ok(r.stored)
    assert.deepEqual(r.files.a, ["forge.db", "giveaways.db"])
    assert.ok(texts(r, "info").some((t) => /Storing giveaways with ForgeDB/.test(t)))
    assert.deepEqual(texts(r, "warn"), [])
})

for (const scenario of ["bothReForgeLast", "bothForgeLast"]) {
    test(`both loaded (${scenario}): giveaways use ReForgeDB and a warning says to keep one`, () => {
        const r = run(scenario)
        assert.ok(r.stored)
        // ReForgeDB's folder is `a`, ForgeDB's is `b`: client.db belongs to
        // whichever loaded last, but the giveaways follow ReForgeDB either way.
        assert.ok(r.files.a.includes("giveaways.db"), JSON.stringify(r.files))
        assert.ok(!r.files.b.includes("giveaways.db"), JSON.stringify(r.files))
        assert.ok(texts(r, "warn").some((t) => /Both ReForgeDB and ForgeDB are loaded/.test(t)))
    })
}

test("the deprecated GiveawaysDatabaseManager still extends a DataBaseManager", () => {
    const { DataBaseManager } = require("@tryforge/reforge.db")
    assert.equal(Object.getPrototypeOf(GiveawaysDatabaseManager), DataBaseManager)
})

test("the package does not import a database extension (only the deprecated export may)", () => {
    const dist = path.join(__dirname, "..", "dist")
    const offenders = []
    const walk = (d) => {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, f.name)
            if (f.isDirectory()) walk(p)
            else if (/\.(js|d\.ts)$/.test(f.name) && !/GiveawaysDatabaseManager/.test(f.name)) {
                if (/require\("@tryforge\/(re)?forge\.db|from "@tryforge\/(re)?forge\.db/.test(fs.readFileSync(p, "utf8"))) offenders.push(path.relative(dist, p))
            }
        }
    }
    walk(dist)
    assert.deepEqual(offenders, [])
})
