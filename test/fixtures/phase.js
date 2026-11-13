"use strict"
// Runs one phase of an integration test in its own process. ForgeDB keeps its
// configuration in module state, so a "restart" needs a new process; the
// phases share state only through the SQLite file in `dir`.
const { Collection } = require("discord.js")
const { boot, snow, DAY } = require("./harness")
const { Database } = require("../..")

const [, , dir, phase, arg] = process.argv
const out = (x) => process.stdout.write(JSON.stringify(x) + "\n")
const base = (h, extra = {}) => ({ prize: "Prize", winnersCount: 1, hostID: snow(), guildID: h.guild.id, channelID: h.channel.id, ...extra })
const waitFor = async (fn, ms = 8000) => {
    const end = Date.now() + ms
    while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)) }
    return false
}
const announcements = (h) => h.sent.filter((m) => typeof m.content === "string" && /won|winner/i.test(m.content))

const phases = {
    // ----- long giveaway survives a restart
    async start(h) {
        const g = await h.manager.start(base(h, { prize: "A year of Nitro", duration: 400 * DAY }))
        const users = Array.from({ length: 30 }, () => snow())
        for (const u of users) await h.manager.addEntry(g.id, u, true)
        await h.manager.flushAll()
        return { id: g.id, end: g.endTimestamp(), entries: users.length }
    },
    async restart(h) {
        await h.manager._restore()
        return { restored: Database.activeGiveaways().map((g) => ({ id: g.id, end: g.endTimestamp(), entries: g.entries.length, scheduledAt: h.manager.scheduler.get(g.id) })) }
    },

    // ----- the giveaway ends while the bot is offline
    async startShort(h) {
        const g = await h.manager.start(base(h, { duration: 1500 }))
        const users = [snow(), snow(), snow()]
        for (const u of users) await h.manager.addEntry(g.id, u, true)
        await h.manager.flushAll()
        return { id: g.id, users, end: g.endTimestamp() }
    },
    async restartAfterEnd(h) {
        await h.manager._restore()
        const ok = await waitFor(async () => (await Database.get(arg))?.hasEnded)
        const g = await Database.get(arg)
        return { ended: ok, winners: g.winners, endedAt: g.endedAt, pending: g.announcePending ?? null, announced: announcements(h).length, endEvents: h.emitted.filter((e) => e.name === "giveawayEnd").length }
    },

    // ----- crash after the winners were saved but before they were announced
    async crashMidEnd(h) {
        const g = await h.manager.start(base(h, { duration: DAY }))
        const winner = snow()
        await h.manager.addEntry(g.id, winner, true)
        const cur = await Database.get(g.id)
        h.manager.scheduler.cancel(g.id)
        Object.assign(cur, { hasEnded: true, endedAt: Date.now(), winners: [winner], announcePending: "end" })
        await Database.set(cur) // ...and the process dies here
        return { id: g.id, winner }
    },
    async restartAfterCrash(h) {
        await h.manager._restore()
        const g = await Database.get(arg)
        return { pending: g.announcePending ?? null, announced: announcements(h).map((m) => m.allowedMentions.users), endEvents: h.emitted.filter((e) => e.name === "giveawayEnd").length }
    },

    // ----- crash after the giveaway was saved but before its message was sent
    async crashMidStart(h) {
        const g = Database.create(base(h, { duration: DAY }))
        await Database.set(g) // ...and the process dies here
        return { id: g.id }
    },
    async restartAfterStartCrash(h) {
        await h.manager._restore()
        await h.manager._whenRepaired()
        const g = await Database.get(arg)
        return { messageID: g.messageID ?? null, posted: h.sent.filter((m) => m.embeds?.length).length }
    },

    // ----- reaction mode: reactions changed while the bot was offline
    async reactions(h) {
        const g = await h.manager.start(base(h, { duration: DAY, winnersCount: 5 }))
        const [left, stayed, joinedOffline, botUser] = [snow(), snow(), snow(), snow()]
        await h.manager.addEntry(g.id, left, true)
        await h.manager.addEntry(g.id, stayed, true)

        const removed = []
        const users = [stayed, joinedOffline, botUser]
        const reaction = {
            emoji: { name: "🎉", id: null, toString: () => "🎉" },
            users: {
                fetch: async ({ after }) => {
                    const page = new Collection()
                    for (const id of users) if (!after) page.set(id, { id, bot: id === botUser })
                    return page
                },
                remove: async (id) => removed.push(id),
            },
        }
        h.messages.get(g.messageID).reactions.cache = [reaction]
        const ended = await h.manager.end(g.id)
        return { winners: ended.winners.sort(), expected: [stayed, joinedOffline].sort(), entries: ended.entries.sort(), left }
    },
}

;(async () => {
    const reactionsMode = phase === "reactions"
    const h = await boot(dir, { autoMembers: true, ...(reactionsMode ? { useReactions: true } : {}) })
    out(await phases[phase](h))
    await h.manager.destroy()
    process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
