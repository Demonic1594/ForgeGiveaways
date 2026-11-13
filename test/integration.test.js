"use strict"
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")

const DAY = 864e5
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "forge-giveaways-"))
const phase = (dir, name, arg = "") => {
    const stdout = execFileSync(process.execPath, [path.join(__dirname, "fixtures/phase.js"), dir, name, arg], { encoding: "utf8" })
    return JSON.parse(stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop())
}

test("a 400 day giveaway survives a restart with its entries and end time", () => {
    const dir = tmp()
    const started = phase(dir, "start")
    assert.ok(started.end - Date.now() > 399 * DAY)

    // Raw check: the duration is stored as a full number, not truncated to 32 bits.
    const Sqlite = require("better-sqlite3")
    const row = new Sqlite(path.join(dir, "giveaways.db"), { readonly: true }).prepare("select duration, entries from giveaway").get()
    assert.equal(row.duration, 400 * DAY)
    assert.equal(row.entries.split(",").length, 30)

    const after = phase(dir, "restart")
    assert.equal(after.restored.length, 1)
    assert.equal(after.restored[0].entries, 30)
    assert.equal(after.restored[0].end, started.end)
    assert.equal(after.restored[0].scheduledAt, started.end, "end timer re-armed for the original deadline")
})

test("full life cycle against a real database", async (t) => {
    const { boot, snow } = require("./fixtures/harness")
    const { Database, GiveawayDenyReason } = require("..")
    const h = await boot(tmp())
    const { manager, sent } = h
    t.after(() => manager.destroy())
    const events = []
    for (const e of ["giveawayStart", "giveawayEnd", "giveawayReroll", "giveawayPause", "giveawayResume", "giveawayCancel", "giveawayEntryAdd", "giveawayEntryRemove", "giveawayEntryRevoke", "giveawayEdit"]) {
        h.giveaways.emitter.on(e, () => events.push(e))
    }

    const bonusRole = "400000000000000001"
    const requiredRole = "400000000000000002"
    const g = await manager.start({
        prize: "Prize @everyone", duration: 60 * DAY, winnersCount: 3, hostID: snow(),
        guildID: h.guild.id, channelID: h.channel.id,
        requirements: { requiredRoles: [requiredRole] },
        bonusEntries: [{ roleID: bonusRole, amount: 4 }],
        maxEntries: 40,
        display: { description: "Be nice", pingRoleID: "400000000000000003" },
    })
    assert.ok(g)
    assert.deepEqual(sent[0].allowedMentions, { parse: [], roles: ["400000000000000003"] }, "the prize can't ping @everyone")
    assert.equal(manager.scheduler.get(g.id), g.endTimestamp())

    // 60 members click at the same moment; 50 qualify, cap is 40.
    const qualified = Array.from({ length: 50 }, (_, i) => h.addMember(snow(), i < 5 ? [requiredRole, bonusRole] : [requiredRole]))
    const unqualified = Array.from({ length: 10 }, () => h.addMember(snow(), []))
    const results = await Promise.all([...qualified, ...unqualified].map((m) => manager.toggleEntry(g.id, m, {}, m.user)))
    const added = results.filter((r) => r.action === "added").length
    const reasons = results.filter((r) => r.action === "denied").map((r) => r.reason)
    assert.equal(added, 40)
    assert.equal(reasons.filter((r) => r === GiveawayDenyReason.EntriesFull).length, 10)
    assert.equal(reasons.filter((r) => r === GiveawayDenyReason.MissingRoles).length, 10)

    // Clicking again leaves.
    const leaver = qualified.find((m) => g.hasEntered(m.id))
    assert.equal((await manager.toggleEntry(g.id, leaver, {}, leaver.user)).action, "removed")
    assert.equal(g.entries.length, 39)

    await manager.flushAll()
    const stored = await Database.find({ id: g.id })
    assert.equal(stored[0].entries.length, 39, "coalesced writes reached the database")

    // Pause, resume, extend.
    await manager.pause(g.id)
    assert.equal(manager.scheduler.has(g.id), false)
    assert.equal((await manager.toggleEntry(g.id, leaver, {}, leaver.user)).reason, GiveawayDenyReason.Paused)
    await new Promise((r) => setTimeout(r, 30))
    const resumed = await manager.resume(g.id)
    assert.ok(resumed.duration >= 60 * DAY + 30, "paused time is added back")
    const before = resumed.endTimestamp()
    const extended = await manager.extend(g.id, DAY)
    assert.equal(extended.endTimestamp(), before + DAY)
    assert.equal(manager.scheduler.get(g.id), extended.endTimestamp())
    assert.equal((await Database.get(g.id)).endTimestamp(), before + DAY, "cache holds the saved copy")

    // One winner loses the role before the end: they must not win.
    const dropped = qualified.find((m) => g.hasEntered(m.id))
    dropped.roles = []

    // A failed database write while ending leaves the giveaway running and scheduled.
    const realSet = Database.set
    Database.set = async function (x) {
        if (x.hasEnded) throw new Error("disk full")
        return realSet.call(this, x)
    }
    await assert.rejects(manager.end(g.id), /disk full/)
    Database.set = realSet
    assert.equal((await Database.get(g.id)).hasEnded, false, "memory still matches the database")
    assert.ok(manager.scheduler.has(g.id), "timer re-armed")

    const ended = await manager.end(g.id)
    assert.equal(ended.winners.length, 3)
    assert.equal(new Set(ended.winners).size, 3)
    assert.ok(!ended.winners.includes(dropped.id))
    assert.ok(ended.winners.every((id) => g.entries.includes(id)))
    assert.equal(await manager.end(g.id), null, "ending twice is a no-op")
    const announce = sent.find((m) => m.replyTo === g.messageID)
    assert.deepEqual([...announce.allowedMentions.users].sort(), [...ended.winners].sort())

    const first = [...ended.winners]
    const rerolled = await manager.reroll(g.id, true, 2)
    assert.equal(rerolled.winners.length, 2)
    assert.ok(rerolled.winners.every((id) => !first.includes(id)), "unique reroll excludes previous winners")
    assert.deepEqual(rerolled.previousWinners.sort(), first.sort())

    // Cancel and automatic end.
    const c = await manager.start({ prize: "c", duration: DAY, winnersCount: 1, hostID: snow(), guildID: h.guild.id, channelID: h.channel.id })
    const cancelled = await manager.cancel(c.id)
    assert.ok(cancelled.cancelled && cancelled.hasEnded && !cancelled.winners.length)
    assert.equal(await manager.reroll(c.id), null, "cancelled giveaways can't be rerolled")

    const quick = await manager.start({ prize: "q", duration: 150, winnersCount: 1, hostID: snow(), guildID: h.guild.id, channelID: h.channel.id })
    const solo = h.addMember(snow())
    await manager.toggleEntry(quick.id, solo, {}, solo.user)
    await new Promise((r) => setTimeout(r, 400))
    const q = await Database.get(quick.id)
    assert.ok(q.hasEnded)
    assert.deepEqual(q.winners, [solo.id])

    for (const e of ["giveawayStart", "giveawayEnd", "giveawayReroll", "giveawayPause", "giveawayResume", "giveawayCancel", "giveawayEntryAdd", "giveawayEntryRemove", "giveawayEntryRevoke", "giveawayEdit"]) {
        assert.ok(events.includes(e), `${e} was emitted`)
    }

    const p = manager.start({ prize: "x", duration: 0, winnersCount: 1, hostID: "1", guildID: "1", channelID: "1" })
    await assert.rejects(p, RangeError)
})

test("README examples and every new function compile", async () => {
    const { Compiler } = require("@tryforge/forgescript")
    // The extension was booted by the previous test in this process, so all
    // of its functions are registered with the compiler.
    const snippets = [
        `$addRequiredRoles[123456789012345678]
         $setRequiredRolesMode[any]
         $addRestrictedRoles[<@&123456789012345679>]
         $setMinimumAccountAge[30d]
         $setMinimumMemberAge[7d]
         $addBonusEntries[234567890123456789;2]
         $setMaxEntries[500]
         $setGiveawayDescription[Thanks!]
         $setGiveawayColor[#5865F2]
         $setGiveawayImage[https://example.com/a.png]
         $setGiveawayThumbnail[https://example.com/b.png]
         $setGiveawayPingRole[123456789012345678]
         $let[id;$startGiveaway[$channelID;$authorID;Discord Nitro;60d;3]]`,
        `$endGiveaway[1] $cancelGiveaway[1] $pauseGiveaway[1] $resumeGiveaway[1]
         $extendGiveaway[1;1d] $shortenGiveaway[1;1h] $rerollGiveaway[1;true;2]
         $editGiveaway[1;$guildID;$authorID;New prize;2]
         $addGiveawayEntry[1;$authorID;true] $removeGiveawayEntry[1;$authorID]
         $deleteGiveaway[1] $wipeGiveaways[$guildID] $rerollGiveawayWinner[1;$authorID]
         $clearGiveawayRequirements $clearBonusEntries $addBonusEntries[234567890123456789;2] $editGiveaway[1;$guildID]
         $getGiveaway[1;pausedAt] $getGiveaway[1;color] $getGiveaway[1;pingRoleID]`,
        `$getGuildGiveaways[$guildID;active;prize;, ] $getGiveaway[1;timeLeft] $getAllGiveaways
         $giveawayEndTimestamp $giveawayTimeLeft $giveawayIsPaused $giveawayIsCancelled
         $giveawayEndedAt $giveawayEntriesCount $giveawayTotalTickets $giveawayMaxEntries
         $giveawayDescription $giveawayMinAccountAge $giveawayMinMemberAge $giveawayRequiredRolesMode
         $giveawayBonusEntries $giveawayHasEntered[1;$authorID] $giveawayEntryWeight[1;$authorID]
         $giveawayDenyReason $newGiveaway[entriesCount] $oldGiveaway
         $giveawayWinChance[1;$authorID] $giveawayIsWinner[1;$authorID] $giveawayURL $excludeGiveawayHost`,
        `$interactionReply[$ephemeral You can't join: $giveawayDenyReason]`,
    ]
    const { FunctionManager } = require("@tryforge/forgescript")
    for (const code of snippets) {
        assert.doesNotThrow(() => Compiler.compile(code), code.slice(0, 60))
        // Unknown $names compile as plain text, so also check each one exists.
        for (const name of code.match(/\$[a-zA-Z]+/g)) assert.ok(FunctionManager.get(name.slice(1)) || FunctionManager.get(name), `${name} is registered`)
    }
})

test("a deadline hit during a guild outage is retried, not ended without winners", async () => {
    const { Scheduler, GiveawaysManager, Giveaway, Database } = require("..")
    const { mock } = require("node:test")
    const manager = Object.create(GiveawaysManager.prototype)
    let ended = 0
    let status = "unavailable"
    const g = new Giveaway({ prize: "p", duration: 1000 })
    const lenient = []
    Object.assign(manager, { client: { isReady: () => true }, _end: async (_id, l) => { ended++; lenient.push(l) }, guildStatus: async () => status, schedule() {} })
    manager.scheduler = new Scheduler(() => {})
    const realGet = Database.get
    Database.get = async () => g
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: g.endTimestamp() + 5 })
    try {
        await manager._onDeadline(g.id)
        assert.equal(ended, 0, "not drawn while the guild is unavailable")
        assert.equal(manager.scheduler.get(g.id), Date.now() + 60_000, "retried in a minute")

        status = "gone" // bot was removed from the guild: end anyway
        await manager._onDeadline(g.id)
        assert.equal(ended, 1)

        status = "unavailable" // an outage longer than a day: stop waiting
        mock.timers.setTime(g.endTimestamp() + 25 * 36e5)
        await manager._onDeadline(g.id)
        assert.equal(ended, 2)
        assert.deepEqual(lenient, [false, true], "only the last resort ends without being able to check members")

        manager.client.isReady = () => false // disconnected
        mock.timers.setTime(g.endTimestamp() + 5)
        await manager._onDeadline(g.id)
        assert.equal(ended, 2)
    } finally {
        Database.get = realGet
        manager.scheduler.clear()
        mock.timers.reset()
    }
})

test("a giveaway that ended while the bot was offline is drawn and announced on restart", async () => {
    const dir = tmp()
    const s = phase(dir, "startShort")
    await new Promise((r) => setTimeout(r, 1800)) // the bot is "down" past the deadline
    const r = phase(dir, "restartAfterEnd", s.id)
    assert.ok(r.ended)
    assert.equal(r.winners.length, 1)
    assert.ok(s.users.includes(r.winners[0]))
    assert.equal(r.pending, null)
    assert.equal(r.announced, 1)
    assert.equal(r.endEvents, 1)
})

test("a crash between drawing and announcing is finished on restart, exactly once", () => {
    const dir = tmp()
    const s = phase(dir, "crashMidEnd")
    const r = phase(dir, "restartAfterCrash", s.id)
    assert.equal(r.pending, null)
    assert.deepEqual(r.announced, [[s.winner]])
    assert.equal(r.endEvents, 1)
    const again = phase(dir, "restartAfterCrash", s.id)
    assert.deepEqual(again.announced, [], "not announced twice")
})

test("a crash between saving and posting a giveaway posts the message on restart", () => {
    const dir = tmp()
    const s = phase(dir, "crashMidStart")
    const r = phase(dir, "restartAfterStartCrash", s.id)
    assert.ok(r.messageID)
    assert.equal(r.posted, 1)
})

test("reaction mode counts reactions added and removed while offline", () => {
    const r = phase(tmp(), "reactions")
    assert.deepEqual(r.entries, r.expected, "entries match the reactions (bots ignored)")
    assert.deepEqual(r.winners, r.expected)
    assert.ok(!r.winners.includes(r.left))
})

test("a crash before a custom start event sent its message runs the event again on restart", () => {
    const dir = tmp()
    const s = phase(dir, "customCrashMidStart")
    const r = phase(dir, "customRestart", s.id)
    assert.ok(r.attached, "the giveaway got its message")
    assert.equal(r.startEvents, 1)
})

test("a database of the original ForgeGiveaways 1.1.0 is upgraded in place", () => {
    const dir = tmp()
    // Exactly what the original creates on SQLite (dumped from a real 1.1.0 database).
    const Sqlite = require("better-sqlite3")
    const db = new Sqlite(path.join(dir, "giveaways.db"))
    db.exec(`CREATE TABLE "giveaway" ("id" varchar PRIMARY KEY NOT NULL, "prize" varchar NOT NULL, "duration" integer NOT NULL, "timestamp" integer NOT NULL, "winnersCount" integer NOT NULL, "hasEnded" boolean NOT NULL, "hostID" varchar NOT NULL, "guildID" varchar NOT NULL, "channelID" varchar NOT NULL, "messageID" varchar, "entries" text NOT NULL, "winners" text NOT NULL, "previousWinners" text, "requirements" text)`)
    const insert = db.prepare(`INSERT INTO giveaway VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const now = Date.now()
    insert.run("1570659133252702209", "Old prize", 20 * DAY, now - DAY, 2, 0, "111111111111111111", "300000000000000000", "200000000000000000", "500000000000000000", "600000000000000001,600000000000000002", "", null, JSON.stringify({ requiredRoles: ["400000000000000002"] }))
    insert.run("1570659133303033858", "Ended one", 1000, now - 1000, 1, 1, "111111111111111111", "300000000000000000", "200000000000000000", null, "600000000000000001", "600000000000000001", null, null)
    db.close()

    const r = phase(dir, "upgraded")
    assert.deepEqual(r.giveaways, [
        { id: "1570659133252702209", prize: "Old prize", duration: 20 * DAY, hasEnded: false, cancelled: false, entries: ["600000000000000001", "600000000000000002"], winners: [], requirements: { requiredRoles: ["400000000000000002"] }, messageID: "500000000000000000" },
        { id: "1570659133303033858", prize: "Ended one", duration: 1000, hasEnded: true, cancelled: false, entries: ["600000000000000001"], winners: ["600000000000000001"], requirements: null, messageID: null },
    ])
    assert.equal(r.scheduledAt, now - DAY + 20 * DAY, "the running one is timed for its original end")
    assert.equal(r.joined, "added", "and can be entered")
    assert.equal(r.entriesAfter, 3)
})
