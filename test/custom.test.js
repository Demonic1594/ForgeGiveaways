"use strict"
/*
 * Custom messages (useDefault: false): the giveawayStart event sends the
 * message and returns its id. Runs in its own process, with one boot.
 */
const { test, before, after } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { boot, snow, DAY } = require("./fixtures/harness")
const { Database } = require("..")

let h
const unhandled = []
const onUnhandled = (e) => unhandled.push(e)
before(async () => {
    process.on("unhandledRejection", onUnhandled)
    h = await boot(fs.mkdtempSync(path.join(os.tmpdir(), "fg-custom-")), { useDefault: false, events: ["giveawayStart"] })
})
after(async () => {
    process.off("unhandledRejection", onUnhandled)
    await h.manager.destroy()
})

const base = (extra = {}) => ({ prize: "Prize", duration: DAY, winnersCount: 1, hostID: snow(), guildID: h.guild.id, channelID: h.channel.id, ...extra })

test("without a giveawayStart command nothing is started, and the process survives", async () => {
    // 2.0.0 threw inside the event listener: an unhandled rejection, which
    // ends a Node process, and start() had already reported success.
    assert.equal(await h.manager.start(base()), null)
    assert.deepEqual(unhandled, [])
    assert.deepEqual(await Database.getAll(), [], "nothing is left in the database")
    assert.equal(h.manager.scheduler.size, 0)
})

test("start() returns once the event attached its message", async () => {
    const message = await h.channel.send({ content: "custom giveaway message" })
    h.giveaways.commands.add({ type: "giveawayStart", code: `$return[${message.id}]` })

    const g = await h.manager.start(base())
    assert.equal(g.messageID, message.id, "the caller sees the message id right away")
    assert.equal((await Database.getByMessage(message.id)).id, g.id, "and clicks on that message find the giveaway")
    assert.equal(h.sent.filter((m) => m.embeds).length, 0, "no default message was sent")
    assert.equal((await h.manager.end(g.id)).hasEnded, true)
})

test("a second giveawayStart command is refused instead of guessing which one to use", async () => {
    h.giveaways.commands.add({ type: "giveawayStart", code: "$return[123]" })
    assert.equal(await h.manager.start(base()), null)
    assert.deepEqual(unhandled, [])
    assert.equal((await Database.find({ hasEnded: false })).length, 0)
})
