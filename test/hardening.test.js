"use strict"
/*
 * Hardening added after 2.1.0: inputs that used to be accepted and then
 * break later, and the remaining ways to act on another server.
 */
const { test } = require("node:test")
const assert = require("node:assert/strict")
const { parseSnowflake, isEmbedURL, Renderer, DEFAULT_MESSAGES, Giveaway, ReForgeGiveaways, GiveawaysReactionHandler, GiveawaysInteractionHandler, Database } = require("..")
const { wipeScope } = require("../dist/functions/scope")

const DAY = 864e5
const none = { guild: null, interaction: null, message: null, channel: null, user: null }

test("role arguments accept role ids and role mentions only", () => {
    assert.equal(parseSnowflake("123456789012345678"), "123456789012345678")
    assert.equal(parseSnowflake(" <@&123456789012345678> "), "123456789012345678")
    // 2.1.0 stored these as role requirements nobody could ever meet.
    assert.equal(parseSnowflake("<@123456789012345678>"), null, "a user mention")
    assert.equal(parseSnowflake("<@!123456789012345678>"), null, "a nickname mention")
    assert.equal(parseSnowflake("<#123456789012345678>"), null, "a channel mention")
    assert.equal(parseSnowflake("everyone"), null)
})

test("embed images must be http(s) links Discord accepts", () => {
    assert.ok(isEmbedURL("https://example.com/a.png"))
    assert.ok(isEmbedURL("http://example.com/a.png"))
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x/y.png", "not a url", "", `https://example.com/${"a".repeat(2100)}`]) {
        assert.equal(isEmbedURL(bad), false, bad.slice(0, 30))
    }
})

test("$wipeGiveaways only wipes the current server, and never from a DM without a guild", () => {
    assert.equal(wipeScope({ ...none, guild: { id: "1" } }), "1", "2.1.0 wiped every server here")
    assert.equal(wipeScope({ ...none, guild: { id: "1" } }, { id: "2" }), "2", "an explicit guild still wins")
    assert.equal(wipeScope({ ...none, message: { guildId: null }, user: {} }), false, "a DM")
    assert.equal(wipeScope({ ...none, message: { guildId: null }, user: {} }, { id: "2" }), "2")
    assert.equal(wipeScope(none), null, "ready and giveaway events may wipe everything")
})

test("over-long translated texts are cut to Discord's embed limits instead of breaking every message", () => {
    const long = "x".repeat(3000)
    const messages = { ...DEFAULT_MESSAGES, title: long, endedTitle: long, fieldEnds: long, fieldHost: long, fieldEntries: long, fieldEnded: long, embedTotalEntries: long }
    const renderer = new Renderer({ emoji: "🎉", buttonLabel: "Join", buttonStyle: 3, showEntryCount: true, showInfoButton: false, useReactions: false, colors: { active: "Green", paused: "Yellow", ended: "Red", cancelled: "Grey" }, messages })
    const g = new Giveaway({ prize: "p", duration: DAY, hostID: "1" })
    for (const embed of [renderer.payload(g).embeds[0], (g.hasEnded = true, renderer.payload(g).embeds[0])]) {
        const e = embed.toJSON()
        assert.ok(e.title.length <= 256)
        assert.ok(e.description.length <= 4096)
        for (const f of e.fields) {
            assert.ok(f.name.length <= 256 && f.value.length <= 1024)
            assert.ok(f.name.length > 0 && f.value.length > 0)
        }
    }
})

test("an invalid color fails at start-up with a clear message", () => {
    assert.throws(() => new ReForgeGiveaways({ handleSignals: false, colors: { ended: "NotAColor" } }), /Invalid color for "ended"/)
    assert.doesNotThrow(() => new ReForgeGiveaways({ handleSignals: false, colors: { ended: "#ff0000", active: 0x00ff00 } }))
})

test("reacting and unreacting in a loop is throttled like the button", async () => {
    const g = new Giveaway({ prize: "p", duration: DAY, guildID: "9" })
    const removed = []
    let joins = 0
    let leaves = 0
    const member = { id: "5", user: { id: "5" } }
    const ext = {
        options: { emoji: "🎉", entryCooldown: 60_000 },
        giveawaysManager: {
            join: async () => { joins++; g.addEntry("5"); return { action: "added", giveaway: g } },
            leave: async () => { leaves++; g.removeEntry("5"); return g },
        },
    }
    const client = {
        options: { partials: [] }, on() {}, getExtension: () => ext,
        guilds: { cache: new Map([["9", { members: { cache: new Map([["5", member]]) } }]]) },
    }
    const handler = new GiveawaysReactionHandler(client)
    const reaction = { emoji: { name: "🎉", id: null, toString: () => "🎉" }, message: { id: "1", channelId: "2" }, users: { remove: async (id) => removed.push(id) } }
    const user = { id: "5", bot: false, partial: false }

    const desc = Object.getOwnPropertyDescriptor(Database, "ready")
    const realGet = Database.getByMessage
    Object.defineProperty(Database, "ready", { get: () => true, configurable: true })
    Database.getByMessage = async () => g
    try {
        for (let i = 0; i < 20; i++) {
            await handler.add(reaction, user)
            await handler.remove(reaction, user)
        }
    } finally {
        Object.defineProperty(Database, "ready", desc)
        Database.getByMessage = realGet
    }
    assert.equal(joins, 1, "one join per cooldown period (2.1.0: 20)")
    assert.equal(leaves, 1, "leaving is never refused, but nothing is left to leave")
    assert.equal(removed.length, 19, "the reactions made during the cooldown are taken back")
})

test("clicks on a deleted giveaway's message are logged once, not once per click", async () => {
    const { Logger } = require("@tryforge/forgescript")
    const ext = { options: { useDefault: true, messages: DEFAULT_MESSAGES, entryCooldown: 0 }, emitter: { listenerCount: () => 0 } }
    const handler = new GiveawaysInteractionHandler({ on() {}, getExtension: () => ext })
    const realError = Logger.error
    const logged = []
    Logger.error = (...a) => logged.push(a)
    const desc = Object.getOwnPropertyDescriptor(Database, "ready")
    const realGet = Database.getByMessage
    Object.defineProperty(Database, "ready", { get: () => true, configurable: true })
    Database.getByMessage = async () => null
    const replies = []
    try {
        for (let i = 0; i < 50; i++) {
            await handler.handle({ message: { id: "77" }, channelId: "2", member: { user: { id: String(i) } }, user: { id: String(i) }, reply: async (p) => replies.push(p.content) })
        }
    } finally {
        Logger.error = realError
        Object.defineProperty(Database, "ready", desc)
        Database.getByMessage = realGet
    }
    assert.equal(logged.length, 1)
    assert.equal(replies.length, 50, "every click is still answered")
})

test("embed image links are checked by the extension, not converted by ForgeScript first", () => {
    const { ArgType } = require("@tryforge/forgescript")
    // ForgeScript's URL type turns anything that is not an https link into a Discord emoji link
    // (https://cdn.discordapp.com/emojis/undefined.png...) before execute runs, so in 2.2.0 an
    // ftp:// or javascript: link was stored as a broken image instead of being refused.
    for (const file of ["setGiveawayImage", "setGiveawayThumbnail"]) {
        const fn = require(`../dist/native/builder/${file}`).default
        assert.equal(fn.data.args[0].type, ArgType.String, `${file} takes the link as text`)
        const self = { customError: (m) => ({ error: m }), success: () => ({ ok: true }) }
        assert.match(fn.data.execute.call(self, {}, ["ftp://example.com/a.png"]).error ?? "", /http\(s\) link/)
        assert.match(fn.data.execute.call(self, {}, ["javascript:alert(1)"]).error ?? "", /http\(s\) link/)
        const ctx = {}
        assert.deepEqual(fn.data.execute.call(self, ctx, ["https://example.com/a.png"]), { ok: true })
    }
})
