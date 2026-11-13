"use strict"
/*
 * Adversarial tests: abusive users, hostile input, injected failures and
 * random operation storms against the real extension and a real SQLite file.
 * Runs in its own process (node --test isolates files), with one boot.
 */
const { test, before, after } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { boot, snow, DAY } = require("./fixtures/harness")
const { Database, GiveawayDenyReason, GiveawaysInteractionHandler, DEFAULT_MESSAGES } = require("..")

let h
before(async () => { h = await boot(fs.mkdtempSync(path.join(os.tmpdir(), "fg-adv-"))) })
after(async () => { await h.manager.destroy() })

const base = (extra = {}) => ({ prize: "Prize", duration: 30 * DAY, winnersCount: 1, hostID: snow(), guildID: h.guild.id, channelID: h.channel.id, ...extra })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Small seeded PRNG (mulberry32) so a failing fuzz run can be replayed.
function rng(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

async function checkInvariants(ids) {
    for (const id of ids) {
        const mem = await Database.get(id)
        const [row] = await Database.find({ id })
        if (!mem) { assert.equal(row, undefined, `${id}: deleted in memory but not in the database`); continue }
        const where = `giveaway ${id}`
        assert.equal(new Set(row.entries).size, row.entries.length, `${where}: duplicate entries`)
        assert.ok(row.winners.every((w) => row.entries.includes(w)), `${where}: winner who never entered`)
        assert.equal(new Set(row.winners).size, row.winners.length, `${where}: duplicate winners`)
        assert.ok(row.winners.length <= Math.max(row.winnersCount, 0) || row.previousWinners?.length, `${where}: too many winners`)
        if (row.cancelled) assert.deepEqual(row.winners, [], `${where}: cancelled with winners`)
        assert.equal(row.hasEnded, mem.hasEnded, `${where}: memory and database disagree on ended`)
        assert.deepEqual(row.winners, mem.winners, `${where}: memory and database disagree on winners`)
        assert.deepEqual([...row.entries].sort(), [...mem.entries].sort(), `${where}: entries not persisted`)
        assert.equal(row.pausedAt ?? null, mem.pausedAt ?? null, `${where}: pause state differs`)
        assert.equal(row.duration, mem.duration, `${where}: duration differs`)
        const scheduled = h.manager.scheduler.has(id)
        if (row.hasEnded || row.pausedAt != null) assert.ok(!scheduled, `${where}: finished or paused but still scheduled`)
        else assert.ok(scheduled, `${where}: running but nothing will end it`)
    }
}

// Seeds 2, 3 and 10 once found a winner whose entry had been removed after the end.
const SEEDS = process.env.FUZZ_SEED ? [Number(process.env.FUZZ_SEED)] : [1337, 2, 3, 10]
for (const seed of SEEDS) test(`fuzz (seed ${seed}): 1,500 random concurrent operations with 15% injected database failures keep every invariant`, async () => {
    // Two streams: which operations run, and which writes fail. Writes
    // happen at moments that depend on timing (background entry flushes),
    // so sharing one stream made the operation sequence differ between a
    // fast and a slow database, and a seed could not be replayed.
    const random = rng(seed)
    const failure = rng(seed ^ 0x5bd1e995)
    const pick = (arr) => arr[Math.floor(random() * arr.length)]
    const members = Array.from({ length: 40 }, () => h.addMember(snow()))
    const ids = []
    let live = []
    const startOne = async (i) => {
        const g = await h.manager.start(base({ winnersCount: 1 + (i % 3) }))
        ids.push(g.id)
        return g.id
    }
    for (let i = 0; i < 6; i++) live.push(await startOne(i))

    const realSet = Database.set
    let chaos = true
    let injected = 0
    let writes = 0
    Database.set = async function (g) {
        if (chaos) {
            writes++
            if (failure() < 0.15) { injected++; throw new Error("injected: database unavailable") }
        }
        return realSet.call(this, g)
    }

    const m = h.manager
    const ops = [
        (id) => { const u = pick(members); return m.toggleEntry(id, u, {}, u.user) },
        (id) => { const u = pick(members); return m.toggleEntry(id, u, {}, u.user) },
        (id) => { const u = pick(members); return m.toggleEntry(id, u, {}, u.user) },
        (id) => m.pause(id),
        (id) => m.resume(id),
        (id) => m.extend(id, Math.floor((random() - 0.3) * 2 * DAY)),
        (id) => m.end(id),
        (id) => m.reroll(id, random() < 0.5, 1 + Math.floor(random() * 3)),
        (id) => m.rerollWinner(id, pick(members).id),
        (id) => m.edit(id, { winnersCount: 1 + Math.floor(random() * 4), prize: "P" + Math.floor(random() * 100) }),
        (id) => m.addEntry(id, pick(members).id, random() < 0.5),
        (id) => m.leave(id, pick(members).id, undefined, undefined, random() < 0.5),
    ]
    try {
        for (let round = 0; round < 150; round++) {
            // Mostly live giveaways, sometimes ended ones (reroll, late clicks).
            const batch = Array.from({ length: 10 }, () => pick(ops)(random() < 0.8 ? pick(live) : pick(ids)).catch(() => {}))
            await Promise.all(batch)
            // Keep six giveaways running, so the storm never runs out of targets.
            const running = []
            for (const id of live) if (!(await Database.get(id))?.hasEnded) running.push(id)
            // A start can hit an injected failure too; try again, as a bot would.
            while (running.length < 6) {
                const id = await startOne(round).catch(() => null)
                if (id) running.push(id)
            }
            live = running
        }
    } finally {
        chaos = false
        Database.set = realSet
    }
    // Let failed background writes retry, then force everything out.
    await sleep(200)
    await m.flushAll()
    await sleep(100)
    if (process.env.FUZZ_STATS) console.log(`FUZZ seed=${seed} writes=${writes} injected=${injected} giveaways=${ids.length}`)
    assert.ok(writes >= 300, `seed ${seed}: only ${writes} database writes, the storm did too little`)
    assert.ok(injected >= 0.08 * writes, `seed ${seed}: only ${injected} of ${writes} writes failed`)
    await checkInvariants(ids)
})

test("a pending entry write never resurrects a giveaway that was ended meanwhile", async () => {
    const g = await h.manager.start(base())
    const u = h.addMember(snow())
    await h.manager.toggleEntry(g.id, u, {}, u.user) // queues an entry write in 50 ms

    // Exact interleaving: addEntry holds the lock during a slow member fetch,
    // end() queues behind it, then the entry-write timer fires and queues
    // *after* end(). Writing the object captured at click time would put
    // back "not ended" over the saved end.
    const realFetch = h.guild.members.fetch
    h.guild.members.fetch = async (arg) => { await sleep(200); return realFetch(arg) }
    try {
        const slow = h.manager.addEntry(g.id, snow(), true)
        const ended = h.manager.end(g.id)
        await Promise.all([slow, ended])
    } finally {
        h.guild.members.fetch = realFetch
    }
    await sleep(300) // let the queued write run
    const [row] = await Database.find({ id: g.id })
    assert.equal(row.hasEnded, true, "the queued write must not undo the end")
    assert.equal((await Database.get(g.id)).hasEnded, true, "nor in memory")
    assert.equal(row.winners.length, 1)
})

test("one user hammering the button 500 times at once ends in a consistent state", async () => {
    const g = await h.manager.start(base())
    const u = h.addMember(snow())
    const results = await Promise.all(Array.from({ length: 500 }, () => h.manager.toggleEntry(g.id, u, {}, u.user)))
    const net = results.filter((r) => r.action === "added").length - results.filter((r) => r.action === "removed").length
    const cur = await Database.get(g.id)
    assert.equal(cur.entries.filter((e) => e === u.id).length, net, "entered exactly when joins outnumber leaves")
    assert.ok(net === 0 || net === 1)
})

test("the click cooldown stops one user from spamming join/leave", async () => {
    const g = await h.manager.start(base())
    let toggles = 0
    const replies = []
    const ext = {
        options: { useDefault: true, messages: DEFAULT_MESSAGES, entryCooldown: 3000 },
        giveawaysManager: { toggleEntry: async () => { toggles++; return { action: "added", giveaway: g } } },
    }
    const handler = new GiveawaysInteractionHandler({ on() {}, getExtension: () => ext })
    const click = () => handler.handle({
        message: { id: g.messageID }, channelId: h.channel.id, member: { user: { id: "999999999999999999" } }, user: { id: "999999999999999999" },
        reply: async (p) => replies.push(p.content), deferReply: async () => ({}), editReply: async () => {},
    })
    for (let i = 0; i < 50; i++) await click()
    assert.equal(toggles, 1)
    assert.equal(replies.filter((r) => r.startsWith("⏳ Slow down")).length, 49)
})

test("hostile prizes: placeholders, mass pings and markdown can't escape", async () => {
    const evil = "{mentions} {prize} {s} @everyone @here <@&123456789012345678> <@111111111111111111> ```"
    const g = await h.manager.start(base({ prize: evil, winnersCount: 2 }))
    const a = h.addMember(snow()), b = h.addMember(snow())
    await h.manager.toggleEntry(g.id, a, {}, a.user)
    await h.manager.toggleEntry(g.id, b, {}, b.user)
    h.sent.length = 0
    await h.manager.end(g.id)
    const msg = h.sent.find((m) => m.content?.includes("Congratulations"))
    assert.deepEqual(msg.allowedMentions.parse, [], "no @everyone/@here/role parsing")
    assert.deepEqual([...msg.allowedMentions.users].sort(), [a.id, b.id].sort(), "only the winners can be pinged")
    assert.equal(msg.content.split(`<@${a.id}>`).length - 1, 1, "placeholders in the prize are not expanded")
    assert.ok(msg.content.includes("{mentions}"), "the prize text is kept literally")

    await assert.rejects(h.manager.start(base({ prize: "x".repeat(5000) })), RangeError)
    await assert.rejects(h.manager.start(base({ winnersCount: 2 ** 40 })), RangeError)
    await assert.rejects(h.manager.start(base({ duration: Number.MAX_SAFE_INTEGER })), RangeError)
    await assert.rejects(h.manager.start(base({ duration: -5 })), RangeError)
    await assert.rejects(h.manager.start(base({ bonusEntries: [{ roleID: "1", amount: 1e308 }] })), RangeError)
    for (const id of ["' OR 1=1 --", "\"; DROP TABLE giveaway; --", "../../etc/passwd", "", "0"]) {
        assert.equal(await Database.get(id), null, `lookup of ${JSON.stringify(id)}`)
    }
    assert.ok((await Database.getAll()).length > 0, "table still there")
})

test("a 1,024 character prize with 500 winners still announces every winner within Discord limits", async () => {
    const g = await h.manager.start(base({ prize: "🎁".repeat(512), winnersCount: 500 }))
    const people = Array.from({ length: 600 }, () => h.addMember(snow()))
    for (const p of people) await h.manager.addEntry(g.id, p.id, true)
    h.sent.length = 0
    const ended = await h.manager.end(g.id)
    assert.equal(ended.winners.length, 500)
    const msgs = h.sent.filter((m) => m.allowedMentions?.users)
    const pinged = msgs.flatMap((m) => m.allowedMentions.users)
    assert.deepEqual([...pinged].sort(), [...ended.winners].sort(), "every winner pinged exactly once")
    for (const m of msgs) {
        assert.ok(m.content.length <= 2000, `message of ${m.content.length} chars`)
        assert.ok(m.allowedMentions.users.length <= 100, "Discord allows at most 100 users per message")
        for (const id of m.allowedMentions.users) assert.ok(m.content.includes(`<@${id}>`), "every pinged user is mentioned in that message")
    }
})

test("bonus-role exploit: holding the role only while joining doesn't boost the odds", async () => {
    const role = "500000000000000001"
    const g = await h.manager.start(base({ bonusEntries: [{ roleID: role, amount: 99 }] }))
    const cheater = h.addMember(snow(), [role])
    const honest = h.addMember(snow(), [])
    await h.manager.toggleEntry(g.id, cheater, {}, cheater.user) // joins with 100 tickets
    await h.manager.toggleEntry(g.id, honest, {}, honest.user)
    assert.equal((await Database.get(g.id)).weightOf(cheater.id), 100)
    cheater.roles = [] // drops the role right after joining

    const cur = await Database.get(g.id)
    let wins = 0
    const N = 3000
    for (let i = 0; i < N; i++) if ((await h.manager.drawWinners(cur, 1))[0] === cheater.id) wins++
    // Without the fix the cheater wins ~99% of draws; with it, a fair ~50%.
    assert.ok(Math.abs(wins / N - 0.5) < 0.05, `cheater won ${(100 * wins / N).toFixed(1)}%`)

    // A member who still has the role keeps the bonus.
    const loyal = h.addMember(snow(), [role])
    const g2 = await h.manager.start(base({ bonusEntries: [{ roleID: role, amount: 3 }] }))
    await h.manager.toggleEntry(g2.id, loyal, {}, loyal.user)
    await h.manager.toggleEntry(g2.id, honest, {}, honest.user)
    const cur2 = await Database.get(g2.id)
    let loyalWins = 0
    for (let i = 0; i < N; i++) if ((await h.manager.drawWinners(cur2, 1))[0] === loyal.id) loyalWins++
    assert.ok(Math.abs(loyalWins / N - 0.8) < 0.05, `role holder won ${(100 * loyalWins / N).toFixed(1)}%, expected 80%`)
})

test("draws are fair: chi-square over 6,000 draws of 10 entrants", async () => {
    const g = await h.manager.start(base())
    const people = Array.from({ length: 10 }, () => h.addMember(snow()))
    for (const p of people) await h.manager.addEntry(g.id, p.id, true)
    const cur = await Database.get(g.id)
    const counts = new Map(people.map((p) => [p.id, 0]))
    const N = 6000
    for (let i = 0; i < N; i++) { const [w] = await h.manager.drawWinners(cur, 1); counts.set(w, counts.get(w) + 1) }
    const expected = N / 10
    const chi = [...counts.values()].reduce((a, c) => a + (c - expected) ** 2 / expected, 0)
    assert.ok(chi < 27.88, `chi-square ${chi.toFixed(2)} exceeds the 99.9% bound for 9 degrees of freedom`)
})

test("bots and an excluded host never win, whatever way they were added", async () => {
    const host = h.addMember(snow())
    const bot = h.addMember(snow())
    bot.user.bot = true
    const human = h.addMember(snow())
    const g = await h.manager.start(base({ hostID: host.id, winnersCount: 3, requirements: { excludeHost: true } }))
    assert.equal((await h.manager.toggleEntry(g.id, host, {}, host.user)).reason, GiveawayDenyReason.Host)
    assert.equal((await h.manager.toggleEntry(g.id, bot, {}, bot.user)).reason, GiveawayDenyReason.Bot)
    await h.manager.addEntry(g.id, host.id, true) // admin bypass still can't make them win
    await h.manager.addEntry(g.id, bot.id, true)
    await h.manager.toggleEntry(g.id, human, {}, human.user)
    const ended = await h.manager.end(g.id)
    assert.deepEqual(ended.winners, [human.id])
})

test("100,000 entrants: joins, draw and persistence stay fast", async () => {
    const g = await h.manager.start(base({ winnersCount: 10 }))
    const cur = await Database.get(g.id)
    let t = Date.now()
    for (let i = 0; i < 100_000; i++) cur.addEntry(String(200000000000000000n + BigInt(i)))
    const joinMs = Date.now() - t
    h.manager.fetchMembers = (() => {
        const real = h.manager.fetchMembers
        return async (guild, ids) => { const m = new Map(); for (const id of ids) m.set(id, { id, user: { id }, roles: [], joined_at: new Date(0).toISOString() }); return m }
    })()
    t = Date.now()
    const ended = await h.manager.end(g.id)
    const endMs = Date.now() - t
    assert.equal(ended.winners.length, 10)
    const [row] = await Database.find({ id: g.id })
    assert.equal(row.entries.length, 100_000)
    assert.ok(joinMs < 1000, `100k joins took ${joinMs} ms`)
    assert.ok(endMs < 3000, `draw + save took ${endMs} ms`)
})

test("pause, extend while paused and resume keep the remaining time exact", async () => {
    const g = await h.manager.start(base({ duration: 10 * DAY }))
    const paused = await h.manager.pause(g.id)
    const left = paused.timeLeft()
    await sleep(40)
    const extended = await h.manager.extend(g.id, DAY)
    assert.equal(extended.timeLeft(), left + DAY, "extending while paused adds to the frozen time")
    await assert.doesNotReject(h.manager.extend(g.id, -100 * DAY))
    assert.equal((await Database.get(g.id)).timeLeft(), 0, "shortening never goes below zero")
    const resumed = await h.manager.resume(g.id)
    assert.ok(resumed.endTimestamp() <= Date.now() + 5, "resuming with no time left ends it right away")
    await sleep(300)
    assert.ok((await Database.get(g.id)).hasEnded)
})
