"use strict"
const { test, mock } = require("node:test")
const assert = require("node:assert/strict")
const { SnowflakeUtil } = require("discord.js")
const {
    Scheduler, MAX_TIMER_DELAY, KeyedMutex, shuffle, weightedOrder, chunkJoin, parseSnowflake,
    formatDuration, Giveaway, GiveawayDenyReason, format, DEFAULT_MESSAGES,
} = require("../dist")

const DAY = 864e5

test("scheduler fires deadlines far beyond the 24.8 day timer limit, and not early", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 })
    try {
        const fired = []
        const s = new Scheduler((k) => fired.push([k, Date.now()]))
        s.schedule("year", 365 * DAY)
        s.schedule("month", 40 * DAY)
        s.schedule("soon", 1000)

        mock.timers.tick(1000)
        assert.deepEqual(fired, [["soon", 1000]])

        mock.timers.tick(MAX_TIMER_DELAY) // ~24.8 days: nothing else is due yet
        assert.equal(fired.length, 1)

        mock.timers.tick(40 * DAY - 1000 - MAX_TIMER_DELAY)
        assert.deepEqual(fired[1], ["month", 40 * DAY])

        mock.timers.tick(325 * DAY - 1)
        assert.equal(fired.length, 2, "must not fire a millisecond early")
        mock.timers.tick(1)
        assert.deepEqual(fired[2], ["year", 365 * DAY])
        assert.equal(s.size, 0)
    } finally {
        mock.timers.reset()
    }
})

test("scheduler reschedule, cancel and overdue deadlines", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 })
    try {
        const fired = []
        const s = new Scheduler((k) => fired.push(k))
        s.schedule("a", 5_000) // already overdue
        s.schedule("b", 20_000)
        s.schedule("c", 30_000)
        mock.timers.tick(0)
        assert.deepEqual(fired, ["a"])

        s.schedule("b", 50_000) // pushed back
        assert.ok(s.cancel("c"))
        mock.timers.tick(20_000)
        assert.deepEqual(fired, ["a"])
        mock.timers.tick(20_000)
        assert.deepEqual(fired, ["a", "b"])
        assert.throws(() => s.schedule("x", NaN), RangeError)
    } finally {
        mock.timers.reset()
    }
})

test("scheduler keeps going when a callback throws", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 })
    try {
        const fired = []
        const s = new Scheduler((k) => { fired.push(k); if (k === "bad") throw new Error("boom") })
        s.schedule("bad", 10)
        s.schedule("good", 10)
        mock.timers.tick(10)
        assert.deepEqual(fired.sort(), ["bad", "good"])
    } finally {
        mock.timers.reset()
    }
})

test("keyed mutex serialises per key, runs keys in parallel, survives errors", async () => {
    const m = new KeyedMutex()
    const log = []
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const a1 = m.run("a", async () => { log.push("a1+"); await sleep(20); log.push("a1-") })
    const a2 = m.run("a", async () => { log.push("a2+"); throw new Error("x") })
    const a3 = m.run("a", async () => { log.push("a3") ; return 3 })
    const b1 = m.run("b", async () => { log.push("b1") })
    await assert.rejects(a2)
    assert.equal(await a3, 3)
    await Promise.all([a1, b1])
    assert.deepEqual(log.filter((x) => x.startsWith("a")), ["a1+", "a1-", "a2+", "a3"])
    assert.ok(log.indexOf("b1") < log.indexOf("a1-"), "other keys are not blocked")
    await new Promise((r) => setImmediate(r))
    assert.equal(m.isLocked("a"), false)
})

test("concurrent toggles on one giveaway lose no entries", async () => {
    const m = new KeyedMutex()
    const g = new Giveaway({ prize: "x", duration: 1000 })
    let stored = [] // simulates read-modify-write against a slow database
    await Promise.all(Array.from({ length: 200 }, (_, i) => m.run(g.id, async () => {
        const copy = [...stored]
        await new Promise((r) => setImmediate(r))
        copy.push(String(i))
        stored = copy
    })))
    assert.equal(stored.length, 200)
})

test("shuffle is a permutation and is unbiased", () => {
    const items = ["a", "b", "c", "d"]
    const firsts = { a: 0, b: 0, c: 0, d: 0 }
    for (let i = 0; i < 20_000; i++) {
        const s = shuffle(items)
        assert.deepEqual([...s].sort(), items)
        firsts[s[0]]++
    }
    for (const k of items) assert.ok(Math.abs(firsts[k] / 20_000 - 0.25) < 0.02, `${k}: ${firsts[k]}`)
})

test("weighted order respects bonus entries", () => {
    const w = { heavy: 3, light: 1 }
    let heavyFirst = 0
    const N = 20_000
    for (let i = 0; i < N; i++) if (weightedOrder(["heavy", "light"], (x) => w[x])[0] === "heavy") heavyFirst++
    assert.ok(Math.abs(heavyFirst / N - 0.75) < 0.02, String(heavyFirst / N))
    assert.deepEqual(weightedOrder(["x"], () => NaN), ["x"])
})

test("text helpers", () => {
    assert.deepEqual(chunkJoin(["aaa", "bbb", "ccc"], ", ", 8), ["aaa, bbb", "ccc"])
    assert.equal(parseSnowflake("<@&123456789012345678>"), "123456789012345678")
    assert.equal(parseSnowflake("<@!123456789012345678>"), "123456789012345678")
    assert.equal(parseSnowflake("nope"), null)
    assert.equal(formatDuration(400 * DAY), "1y 5w")
    assert.equal(format(DEFAULT_MESSAGES.left, { prize: "Nitro" }), "👋 You left the giveaway for **Nitro**.")
    assert.equal(format("{a} {missing}", { a: 1 }), "1 {missing}")
})

const member = (id, roles = [], joinedAgo = 365 * DAY) => ({
    user: { id },
    roles,
    joined_at: new Date(Date.now() - joinedAgo).toISOString(),
})
const oldUser = SnowflakeUtil.generate({ timestamp: Date.now() - 2 * 365 * DAY }).toString()
const newUser = SnowflakeUtil.generate({ timestamp: Date.now() - DAY }).toString()

test("giveaway entries, weights and capacity", () => {
    const g = new Giveaway({ prize: "p", duration: 1000, maxEntries: 2, bonusEntries: [{ roleID: "r1", amount: 2 }, { roleID: "r2", amount: 1 }] })
    assert.equal(g.computeWeight(member("1", ["r1", "r2"])), 4)
    assert.ok(g.addEntry("1", 4))
    assert.equal(g.addEntry("1"), null, "no duplicates")
    g.addEntry("2")
    assert.equal(g.totalTickets(), 5)
    assert.equal(g.denyReason(member("3"), true), GiveawayDenyReason.EntriesFull)
    assert.equal(g.denyReason(member("1"), true), null, "existing entrant is not blocked by the cap")
    g.removeEntry("1")
    assert.equal(g.weightOf("1"), 1)
    assert.deepEqual(g.entries, ["2"])
    // index follows a replaced array (as after loading from the database)
    g.entries = ["7", "8"]
    assert.ok(g.hasEntered("8") && !g.hasEntered("2"))
})

test("giveaway requirements", () => {
    const g = new Giveaway({
        prize: "p", duration: 1000,
        requirements: { requiredRoles: ["a", "b"], restrictedRoles: ["x"], restrictedMembers: ["9"], minAccountAge: 30 * DAY, minMemberAge: 7 * DAY },
    })
    assert.equal(g.requirementDenyReason(member(oldUser, ["a", "b"])), null)
    assert.equal(g.requirementDenyReason(member(oldUser, ["a"])), GiveawayDenyReason.MissingRoles)
    g.requirements.requiredRolesMode = "any"
    assert.equal(g.requirementDenyReason(member(oldUser, ["a"])), null)
    assert.equal(g.requirementDenyReason(member(oldUser, ["a", "x"])), GiveawayDenyReason.RestrictedRole)
    assert.equal(g.requirementDenyReason(member("9", ["a"])), GiveawayDenyReason.RestrictedMember)
    assert.equal(g.requirementDenyReason(member(newUser, ["a"])), GiveawayDenyReason.AccountTooNew)
    assert.equal(g.requirementDenyReason(member(oldUser, ["a"], DAY)), GiveawayDenyReason.MemberTooNew)
    assert.equal(g.canEnter(member(oldUser, ["b"])), true)
})

test("pause freezes time, clone keeps methods and is independent", () => {
    const g = new Giveaway({ prize: "p", duration: 10 * DAY })
    g.pausedAt = Date.now()
    const left = g.timeLeft()
    assert.ok(g.isPaused() && !g.isActive())
    assert.equal(g.denyReason(member("1")), GiveawayDenyReason.Paused)
    const c = g.clone()
    assert.ok(c instanceof Giveaway)
    assert.equal(c.timeLeft(), left)
    c.addEntry("5")
    assert.equal(g.entries.length, 0)
    const json = JSON.parse(JSON.stringify(g))
    assert.equal(json.isPaused, true)
    assert.equal(json.endTimestamp, g.timestamp + 10 * DAY)
})

test("scheduler watchdog catches up after the host slept or the clock jumped", () => {
    // Timers are mocked on their own (monotonic time) and Date.now separately
    // (wall clock), so a wall-clock jump can be simulated without the timers seeing it.
    const realNow = Date.now
    let wall = 1_000_000
    Date.now = () => wall
    mock.timers.enable({ apis: ["setTimeout"] })
    try {
        const run = (opts) => {
            const fired = []
            const s = new Scheduler((k) => fired.push(k), opts)
            s.schedule("g", wall + 10 * 60_000)
            wall += 10 * 60_000 // host slept 10 minutes: wall clock moved, timers did not
            mock.timers.tick(30_000)
            s.clear()
            wall -= 10 * 60_000
            return fired.length
        }
        assert.equal(run({}), 0, "without the watchdog the deadline is missed")
        assert.equal(run({ maxDelay: 30_000 }), 1, "with it, it fires within 30 s")
    } finally {
        mock.timers.reset()
        Date.now = realNow
    }
})

test("a slow click is acknowledged in time and answered afterwards", async () => {
    const { GiveawaysInteractionHandler, Database, DEFAULT_MESSAGES, Giveaway } = require("../dist")
    const g = new Giveaway({ prize: "Nitro", duration: DAY })
    const calls = []
    const interaction = {
        message: { id: "1" }, channelId: "2", member: { user: { id: "3" } }, user: { id: "3" },
        reply: async (p) => calls.push(["reply", p.content]),
        deferReply: async () => { calls.push(["defer"]); return {} },
        editReply: async (p) => calls.push(["edit", p.content]),
    }
    const ext = {
        options: { useDefault: true, messages: DEFAULT_MESSAGES },
        giveawaysManager: { toggleEntry: () => new Promise((r) => setTimeout(() => r({ action: "added", giveaway: g }), 2300)) },
    }
    const handler = new GiveawaysInteractionHandler({ on() {}, getExtension: () => ext })

    const desc = Object.getOwnPropertyDescriptor(Database, "ready")
    const realGet = Database.getByMessage
    Object.defineProperty(Database, "ready", { get: () => true, configurable: true })
    Database.getByMessage = async () => g
    try {
        await handler.handle(interaction)
    } finally {
        Object.defineProperty(Database, "ready", desc)
        Database.getByMessage = realGet
    }
    assert.deepEqual(calls.map((c) => c[0]), ["defer", "edit"])
    assert.match(calls[1][1], /joined the giveaway for \*\*Nitro\*\*/)
})

test("emoji matching ignores the variation selector and matches custom emoji forms", () => {
    const { emojiMatches } = require("../dist")
    const uni = (name) => ({ name, id: null, toString: () => name })
    assert.ok(emojiMatches(uni("🎉"), "🎉️"))
    assert.ok(emojiMatches(uni("🎉️"), "🎉"))
    assert.ok(!emojiMatches(uni("🎁"), "🎉"))
    const custom = { name: "party", id: "123456789012345678", toString: () => "<:party:123456789012345678>" }
    assert.ok(emojiMatches(custom, "123456789012345678"))
    assert.ok(emojiMatches(custom, "<:party:123456789012345678>"))
    assert.ok(!emojiMatches(custom, "party"), "a custom emoji's name alone is not unique")
})

test("win chance estimate", () => {
    const g = new Giveaway({ prize: "p", duration: DAY, winnersCount: 2 })
    for (const id of ["a", "b", "c", "d"]) g.addEntry(id)
    assert.equal(g.winChance("a"), 0.5)
    assert.equal(g.winChance("zzz"), 0, "not entered")
    g.winnersCount = 10
    assert.equal(g.winChance("a"), 1, "more winners than entries")
    g.winnersCount = 1
    g.setWeight("a", 7) // 7 of 10 tickets
    assert.ok(Math.abs(g.winChance("a") - 0.7) < 1e-9)
    assert.equal(g.url(), null)
})

test("the extension is ReForgeGiveaways, distinct from the original", () => {
    const pkg = require("../dist")
    assert.equal(typeof pkg.ReForgeGiveaways, "function")
    assert.equal(pkg.ForgeGiveaways, undefined, "the original's class name is not exported")
    assert.equal(new pkg.ReForgeGiveaways({ handleSignals: false }).name, "reforge.giveaways")
    assert.equal(require("../package.json").name, "@tryforge/reforge.giveaways")
})

test("only real texts override a default message", () => {
    const { ReForgeGiveaways, DEFAULT_MESSAGES } = require("../dist")
    const { messages } = new ReForgeGiveaways({ handleSignals: false, messages: { joined: undefined, left: "Bye", ended: 5, notAKey: "x" } }).options
    assert.equal(messages.joined, DEFAULT_MESSAGES.joined, "undefined keeps the default (2.0.0 blanked it and then crashed formatting it)")
    assert.equal(messages.ended, DEFAULT_MESSAGES.ended)
    assert.equal(messages.left, "Bye")
    assert.equal("notAKey" in messages, false)
})
