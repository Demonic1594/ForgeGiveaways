"use strict"
/*
 * Tests for the bugs fixed and the features added in 2.1.0. Every one of
 * them fails on 2.0.0.
 * Runs in its own process, with one boot (default messages, buttons).
 */
const { test, before, after } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { boot, snow, DAY } = require("./fixtures/harness")
const { Database, Giveaway, Renderer, DEFAULT_MESSAGES, GiveawaysInteractionHandler, GiveawaysEventHandler, shardIdFor } = require("..")
const { scopedGiveaway } = require("../dist/functions/scope")

let h
before(async () => { h = await boot(fs.mkdtempSync(path.join(os.tmpdir(), "fg-reg-"))) })
after(async () => { await h.manager.destroy() })

const base = (extra = {}) => ({ prize: "Prize", duration: 30 * DAY, winnersCount: 1, hostID: snow(), guildID: h.guild.id, channelID: h.channel.id, ...extra })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const row = async (id) => (await Database.find({ id }))[0]

/** Makes database writes fail while `fn` runs. Returns how many were refused. */
async function withFailingWrites(fn, when = () => true) {
    const realSet = Database.set
    let refused = 0
    Database.set = async function (g) {
        if (when(g)) { refused++; throw new Error("injected: database unavailable") }
        return realSet.call(this, g)
    }
    try { await fn() } finally { Database.set = realSet }
    return refused
}

test("a pause that could not be saved leaves the giveaway running with its timer", async () => {
    const g = await h.manager.start(base())
    await withFailingWrites(() => assert.rejects(h.manager.pause(g.id), /injected/))
    assert.equal((await Database.get(g.id)).isPaused(), false, "still running")
    assert.equal(h.manager.scheduler.get(g.id), g.endTimestamp(), "and something will still end it")
})

test("a cancel that could not be saved loses neither the timer nor waiting entry writes", async () => {
    const g = await h.manager.start(base())
    const u = h.addMember(snow())
    await h.manager.toggleEntry(g.id, u, {}, u.user) // waits to be written
    await withFailingWrites(() => assert.rejects(h.manager.cancel(g.id), /injected/))
    assert.ok(h.manager.scheduler.has(g.id))
    await sleep(150)
    await h.manager.flushAll()
    assert.deepEqual((await row(g.id)).entries, [u.id], "the entry made before the failed cancel reached the database")
})

test("an entry whose write failed is written later instead of being lost", async () => {
    const g = await h.manager.start(base())
    const u = h.addMember(snow())
    await withFailingWrites(() => assert.rejects(h.manager.addEntry(g.id, u.id), /injected/))
    assert.equal((await row(g.id)).entries.length, 0)
    await h.manager.flushAll()
    assert.deepEqual((await row(g.id)).entries, [u.id])
})

test("an overdue giveaway is not redrawn in a tight loop while the database is down", async () => {
    const g = await h.manager.start(base({ duration: 150 }))
    const u = h.addMember(snow())
    await h.manager.toggleEntry(g.id, u, {}, u.user)
    const attempts = await withFailingWrites(() => sleep(1200), (x) => x.id === g.id && x.hasEnded)
    assert.ok(attempts >= 1 && attempts <= 2, `${attempts} draw attempts in a second (2.0.0 made over a thousand)`)
    assert.equal((await Database.get(g.id)).hasEnded, false)
    const retryAt = h.manager.scheduler.get(g.id)
    assert.ok(retryAt - Date.now() > 50_000, "retried about a minute later")
    assert.ok(await h.manager.end(g.id), "and it ends normally once the database is back")
})

test("a network failure during the draw fails the end instead of declaring no winners", async () => {
    const g = await h.manager.start(base())
    const users = Array.from({ length: 5 }, () => h.addMember(snow()))
    for (const u of users) await h.manager.toggleEntry(g.id, u, {}, u.user)

    const realFetch = h.guild.members.fetch
    h.guild.members.fetch = async () => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) }
    try {
        await assert.rejects(h.manager.end(g.id), /socket hang up/)
        const cur = await Database.get(g.id)
        assert.equal(cur.hasEnded, false, "still running")
        assert.ok(h.manager.scheduler.has(g.id), "and still scheduled")

        // Last resort, a day past the deadline: end with whoever can be reached.
        const forced = await h.manager._end(g.id, true)
        assert.deepEqual(forced.winners, [])
    } finally {
        h.guild.members.fetch = realFetch
    }

    // Members who really left are skipped, that is not an error.
    const g2 = await h.manager.start(base())
    const stays = h.addMember(snow())
    const leaves = snow()
    await h.manager.toggleEntry(g2.id, stays, {}, stays.user)
    await h.manager.addEntry(g2.id, leaves, true)
    h.guild.members.fetch = async (arg) => {
        if (typeof arg !== "string") throw new Error("gateway timeout") // forces the one-by-one path
        return realFetch(arg)
    }
    try {
        assert.deepEqual((await h.manager.end(g2.id)).winners, [stays.id])
    } finally {
        h.guild.members.fetch = realFetch
    }
})

test("options passed to start() are copied: builder calls after it don't change the stored giveaway", async () => {
    // What "$addRequiredRoles[A] $startGiveaway[...] $addRequiredRoles[B]" does to ctx.requirements.
    const requirements = { requiredRoles: ["400000000000000002"] }
    const bonusEntries = [{ roleID: "400000000000000001", amount: 2 }]
    const g = await h.manager.start(base({ requirements, bonusEntries }))
    requirements.requiredRoles = [...requirements.requiredRoles, "400000000000000009"]
    requirements.minAccountAge = DAY
    bonusEntries[0].amount = 999
    const cur = await Database.get(g.id)
    assert.deepEqual(cur.requirements, { requiredRoles: ["400000000000000002"] })
    assert.deepEqual(cur.bonusEntries, [{ roleID: "400000000000000001", amount: 2 }])
})

test("a start whose message id can't be saved takes the message back and leaves nothing behind", async () => {
    const before = h.deleted.length
    let id
    await withFailingWrites(() => assert.rejects(h.manager.start(base())), (g) => { id = g.id; return !!g.messageID })
    assert.equal(h.deleted.length, before + 1, "the orphaned message was deleted")
    assert.equal(await Database.get(id), null)
    assert.equal(await row(id), undefined)
    assert.equal(h.manager.scheduler.has(id), false)
})

test("start rejects impossible values with a clear error", async () => {
    await assert.rejects(h.manager.start(base({ duration: 9000 * 365 * DAY })), /before the year 10000/)
    await assert.rejects(h.manager.start(base({ requirements: { minAccountAge: -5 } })), RangeError)
    await assert.rejects(h.manager.start(base({ requirements: { requiredRolesMode: "some" } })), RangeError)
    const g = await h.manager.start(base())
    assert.equal(await h.manager.extend(g.id, 9000 * 365 * DAY), null, "nor can it be extended past it")
})

test("a throwing event listener is logged, not an unhandled rejection that ends the process", async () => {
    const seen = []
    const onUnhandled = (e) => seen.push(e)
    process.on("unhandledRejection", onUnhandled)
    try {
        new GiveawaysEventHandler({ name: "giveawayPause", description: "", version: "0", listener: async () => { throw new Error("listener blew up") } }).register(h.client)
        new GiveawaysEventHandler({ name: "giveawayPause", description: "", version: "0", listener: () => { throw new Error("sync too") } }).register(h.client)
        const g = await h.manager.start(base())
        assert.ok(await h.manager.pause(g.id))
        await sleep(50)
        assert.deepEqual(seen, [])
    } finally {
        process.off("unhandledRejection", onUnhandled)
        h.giveaways.emitter.removeAllListeners("giveawayPause")
    }
})

test("management functions refuse to act from a direct message unless a guild is given", async () => {
    const g = await h.manager.start(base())
    const other = { id: "399999999999999999" }
    const guild = { id: h.guild.id }
    const scope = (ctx, explicit) => scopedGiveaway({ guild: null, interaction: null, message: null, channel: null, user: null, ...ctx }, g.id, explicit)

    assert.ok(await scope({ guild }), "a command in the giveaway's guild")
    assert.equal(await scope({ guild: other }), null, "a command in another guild")
    assert.equal(await scope({ message: { guildId: null }, channel: {}, user: {} }), null, "a DM command (2.0.0 allowed this)")
    assert.equal(await scope({ interaction: { guildId: null }, user: {} }), null, "a DM slash command")
    assert.equal(await scope({ interaction: { guildId: other.id }, user: {} }), null, "an interaction from a guild the bot has no cache for")
    assert.ok(await scope({ interaction: { guildId: h.guild.id }, user: {} }))
    assert.ok(await scope({ message: { guildId: null }, channel: {}, user: {} }, guild), "a DM command that names the guild")
    assert.ok(await scope({}), "giveaway and ready events have nobody behind them")
})

test("reroll of one winner keeps the others and never picks a previous winner", async () => {
    const g = await h.manager.start(base({ winnersCount: 3 }))
    const users = Array.from({ length: 5 }, () => h.addMember(snow()))
    for (const u of users) await h.manager.toggleEntry(g.id, u, {}, u.user)
    const ended = await h.manager.end(g.id)
    const [out, ...kept] = ended.winners
    const sentBefore = h.sent.length

    const again = await h.manager.rerollWinner(g.id, out)
    assert.equal(again.winners.length, 3)
    assert.ok(kept.every((id) => again.winners.includes(id)), "the other two keep their win")
    assert.ok(!again.winners.includes(out))
    assert.deepEqual(again.previousWinners, [out])
    assert.equal(again.winners.indexOf(again.winners.find((id) => !kept.includes(id))), 0, "the replacement takes the same place")
    const announcement = h.sent[sentBefore]
    assert.deepEqual(announcement.allowedMentions.users, [again.winners[0]], "only the new winner is announced")

    assert.equal(await h.manager.rerollWinner(g.id, out), null, "somebody who is no longer a winner can't be replaced")
    const last = await h.manager.rerollWinner(g.id, again.winners[0])
    assert.ok(last, "one entrant is left to draw")
    assert.equal(await h.manager.rerollWinner(g.id, last.winners[0]), null, "nobody is left who has not won")
    assert.deepEqual((await row(g.id)).winners, last.winners, "a failed replacement changes nothing")
})

test("editing can remove bonus entries and requirements again", async () => {
    const role = "400000000000000001"
    const g = await h.manager.start(base({ bonusEntries: [{ roleID: role, amount: 9 }], requirements: { requiredRoles: [role], minAccountAge: DAY } }))
    const u = h.addMember(snow(), [role])
    await h.manager.toggleEntry(g.id, u, {}, u.user)
    assert.equal((await Database.get(g.id)).weightOf(u.id), 10)

    assert.equal((await h.manager.edit(g.id, { prize: "Same bonuses" })).bonusEntries.length, 1, "an edit without bonuses keeps them")
    const cleared = await h.manager.edit(g.id, {
        bonusEntries: [], // $clearBonusEntries
        requirements: { requiredRoles: [], requiredRolesMode: "all", restrictedRoles: [], restrictedMembers: [], minAccountAge: 0, minMemberAge: 0, excludeHost: false }, // $clearGiveawayRequirements
    })
    assert.equal(cleared.bonusEntries, null)
    assert.equal(cleared.weightOf(u.id), 1, "saved ticket counts are dropped with the bonuses")
    const anyone = h.addMember(snow(), [])
    assert.equal((await h.manager.toggleEntry(g.id, anyone, {}, anyone.user)).action, "added", "nothing is required any more")
})

test("every text of the giveaway embed can be translated, and long winner lists stay whole", () => {
    const messages = {
        ...DEFAULT_MESSAGES,
        embedPrize: "Preis: {prize}", embedWinnersCount: "Gewinner: {count}", embedRequiredRoles: "Rolle{s}{any}: {roles}", embedAnyRole: " (eine davon)",
        embedMaxEntries: "Max: {count}", fieldEnds: "Endet", fieldHost: "Von", fieldEntries: "Teilnehmer", fieldEnded: "Beendet",
        embedWinners: "Gewinner: {mentions}", embedNoWinners: "Niemand", embedTotalEntries: "Teilnahmen: {count}", embedMoreWinners: "und {count} weitere",
        entryMethodButton: "Knopf", footer: "Klick auf den {entryMethod}!",
    }
    const renderer = new Renderer({ emoji: "🎉", buttonLabel: "Join", buttonStyle: 3, showEntryCount: true, showInfoButton: true, useReactions: false, colors: { active: "Green", paused: "Yellow", ended: "Red", cancelled: "Grey" }, messages })
    const g = new Giveaway({ prize: "Nitro {count}", duration: DAY, winnersCount: 2, hostID: snow(), maxEntries: 5, requirements: { requiredRoles: ["1", "2"], requiredRolesMode: "any" } })

    const active = renderer.activeEmbed(g).toJSON()
    assert.equal(active.description, "Preis: Nitro {count}\nGewinner: 2\n\nRolle" + "s (eine davon): <@&1>, <@&2>\nMax: 5", "and a placeholder inside the prize is not expanded")
    assert.deepEqual(active.fields.map((f) => f.name), ["Endet", "Von", "Teilnehmer"])
    assert.equal(active.footer.text, "Klick auf den Knopf!")

    g.hasEnded = true
    assert.match(renderer.endedEmbed(g).toJSON().description, /Gewinner: Niemand\nTeilnahmen: 0/)

    g.winners = Array.from({ length: 500 }, () => snow())
    const ended = renderer.endedEmbed(g).toJSON()
    assert.ok(ended.description.length <= 4096)
    const shown = ended.description.match(/<@\d+>/g).length
    assert.ok(shown > 100 && shown < 500)
    assert.match(ended.description, new RegExp(`<@\\d+> und ${500 - shown} weitere\\n`), "no mention is cut in half; the rest is counted")
    assert.deepEqual(ended.fields.map((f) => f.name), ["Beendet", "Von"])
})

test("with custom messages, a click nobody will answer still gets the default reply", async () => {
    const g = new Giveaway({ prize: "Nitro", duration: DAY })
    const listeners = new Set()
    const calls = []
    const interaction = {
        message: { id: "1" }, channelId: "2", member: { user: { id: "3" } }, user: { id: "3" },
        reply: async (p) => calls.push(p.content),
    }
    let outcome = { action: "added", giveaway: g }
    let toggles = 0
    const ext = {
        options: { useDefault: false, messages: DEFAULT_MESSAGES, entryCooldown: 0 },
        emitter: { listenerCount: (e) => (listeners.has(e) ? 1 : 0) },
        giveawaysManager: { toggleEntry: async () => { toggles++; return outcome } },
    }
    const handler = new GiveawaysInteractionHandler({ on() {}, getExtension: () => ext })
    const desc = Object.getOwnPropertyDescriptor(Database, "ready")
    const realGet = Database.getByMessage
    Object.defineProperty(Database, "ready", { get: () => true, configurable: true })
    Database.getByMessage = async () => g
    try {
        await handler.handle(interaction)
        assert.match(calls.pop(), /joined the giveaway/, "no giveawayEntryAdd event: 2.0.0 left this click unanswered")

        listeners.add("giveawayEntryAdd")
        await handler.handle(interaction)
        assert.equal(calls.length, 0, "the event answers, so the default stays quiet")

        g.hasEnded = true
        await handler.handle(interaction)
        assert.match(calls.pop(), /already ended/, "no giveawayEntryRevoke event")

        listeners.add("giveawayEntryRevoke")
        outcome = { action: "denied", reason: "ended", giveaway: g }
        toggles = 0
        await handler.handle(interaction)
        assert.equal(toggles, 1, "the click goes on to the manager, which fires giveawayEntryRevoke with the reason")
        assert.equal(calls.length, 0)

        Database.getByMessage = async () => null
        await handler.handle(interaction)
        assert.match(calls.pop(), /no longer exists/, "there is no event for an unknown giveaway")
    } finally {
        Object.defineProperty(Database, "ready", desc)
        Database.getByMessage = realGet
    }
})

test("the click cooldown list is not scanned on every click of a mass join", async () => {
    const g = new Giveaway({ prize: "p", duration: DAY })
    const ext = {
        options: { useDefault: true, messages: DEFAULT_MESSAGES, entryCooldown: 60_000 },
        emitter: { listenerCount: () => 0 },
        giveawaysManager: { toggleEntry: async () => ({ action: "added", giveaway: g }) },
    }
    const handler = new GiveawaysInteractionHandler({ on() {}, getExtension: () => ext })
    const desc = Object.getOwnPropertyDescriptor(Database, "ready")
    const realGet = Database.getByMessage
    Object.defineProperty(Database, "ready", { get: () => true, configurable: true })
    Database.getByMessage = async () => g
    const click = (i) => handler.handle({ message: { id: "1" }, channelId: "2", member: { user: { id: String(i) } }, user: { id: String(i) }, reply: async () => {} })
    try {
        const started = process.hrtime.bigint()
        // 40,000 different members inside one cooldown period: nothing can expire.
        for (let i = 0; i < 40_000; i++) await click(i)
        const ms = Number(process.hrtime.bigint() - started) / 1e6
        assert.ok(ms < 3000, `40,000 clicks took ${Math.round(ms)} ms (with a scan on every click: about 8 s)`)
    } finally {
        Object.defineProperty(Database, "ready", desc)
        Database.getByMessage = realGet
    }
})

test("with sharding, a process only caches and times the giveaways of its own guilds", async () => {
    assert.equal(shardIdFor("300000000000000000", 1), 0)
    assert.equal(shardIdFor("300000000000000000", 4), Number((300000000000000000n >> 22n) % 4n))
    assert.equal(shardIdFor("not an id", 4), 0)

    const mine = h.guild.id
    const realOwns = Database.owns
    Database.owns = (guildID) => guildID !== mine // pretend the test guild lives on another shard
    try {
        const g = await h.manager.start(base())
        assert.ok(g, "starting still works")
        assert.equal(Database.isActive(g.id), false, "but another process owns it: not cached here")
        assert.equal(h.manager.scheduler.has(g.id), false, "and not timed here")
        assert.equal((await row(g.id)).hasEnded, false)
        assert.equal((await Database.loadActive()).some((x) => x.guildID === mine), false, "a restart would not pick it up either")
    } finally {
        Database.owns = realOwns
        for (const g of await Database.loadActive()) h.manager.scheduler.schedule(g.id, g.endTimestamp())
    }
})

test("$getGuildGiveaways sees entries that are still waiting to be written", async () => {
    const g = await h.manager.start(base())
    const u = h.addMember(snow())
    await h.manager.toggleEntry(g.id, u, {}, u.user)
    const rows = await Database.find({ id: g.id })
    assert.equal(Database.live(rows)[0].entries.length, 1)
    await h.manager.flushAll()
})

test("cleaning up ended giveaways skips results that still have to be announced", async () => {
    const done = await h.manager.start(base())
    await h.manager.cancel(done.id)
    const pending = Database.create(base())
    Object.assign(pending, { hasEnded: true, endedAt: Date.now() - 10 * DAY, announcePending: "end" })
    await Database.set(pending)
    const old = await Database.get(done.id)
    old.endedAt = Date.now() - 10 * DAY
    await Database.set(old)

    await h.manager.sweep(DAY)
    assert.equal(await Database.get(done.id), null, "ended ten days ago: deleted")
    assert.ok(await Database.get(pending.id), "its winners were never announced: kept for the next start")
    await Database.delete(pending.id)
})

test("a command can only start giveaways in channels of its own guild", () => {
    const { canStartIn } = require("../dist/functions/scope")
    const none = { guild: null, interaction: null, message: null, channel: null, user: null }
    assert.equal(canStartIn({ ...none, guild: { id: "1" } }, "1"), true)
    assert.equal(canStartIn({ ...none, guild: { id: "1" } }, "2"), false, "a channel of another server")
    assert.equal(canStartIn({ ...none, interaction: { guildId: "1" }, user: {} }, "2"), false)
    assert.equal(canStartIn({ ...none, message: { guildId: "1" }, user: {} }, "1"), true)
    assert.equal(canStartIn(none, "2"), true, "giveaway and ready events pick their own channel")
    assert.equal(canStartIn({ ...none, message: { guildId: null }, user: {} }, "2"), true, "a DM command")
})
