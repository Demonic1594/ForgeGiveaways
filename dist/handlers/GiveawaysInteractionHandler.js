"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GiveawaysInteractionHandler = void 0;
const discord_js_1 = require("discord.js");
const __1 = require("..");
const structures_1 = require("../structures");
const messages_1 = require("../structures/messages");
const error_1 = require("../functions/error");
const noop_1 = __importDefault(require("../functions/noop"));
const utils_1 = require("../utils");
/** Acknowledge a click that takes longer than this (Discord allows 3 s). */
const DEFER_AFTER = 2000;
/**
 * Handles clicks on the giveaway buttons. The entry button (custom id
 * `giveawayEntry`, optionally followed by `-anything`) toggles the entry; the
 * info button (`giveawayInfo`) shows the clicker's status and odds.
 */
class GiveawaysInteractionHandler {
    client;
    constructor(client) {
        this.client = client;
        this.client.on("interactionCreate", (interaction) => {
            if (!interaction.isButton() || !interaction.inGuild())
                return;
            const [action] = interaction.customId.split("-");
            if (action === structures_1.ENTRY_BUTTON_ID)
                this.handle(interaction).catch(noop_1.default);
            else if (action === structures_1.INFO_BUTTON_ID)
                this.info(interaction).catch(noop_1.default);
        });
    }
    /** Last join/leave per giveaway and user, for the anti-spam cooldown. */
    #lastToggle = new Map();
    #lastSweep = 0;
    /** Returns the remaining cooldown in ms (0 if none) and records the click. */
    #cooldown(key, ms) {
        if (ms <= 0)
            return 0;
        const now = Date.now();
        const last = this.#lastToggle.get(key);
        if (last !== undefined && now - last < ms)
            return ms - (now - last);
        this.#lastToggle.set(key, now);
        // Keep the map small: drop expired keys once it grows. At most once
        // per cooldown period, because during a mass join every key is still
        // fresh and a scan on each click would find nothing to drop.
        if (this.#lastToggle.size > 10_000 && now - this.#lastSweep >= ms) {
            this.#lastSweep = now;
            for (const [k, t] of this.#lastToggle)
                if (now - t >= ms)
                    this.#lastToggle.delete(k);
        }
        return 0;
    }
    /** The "info" button: tells the clicker their status, tickets and odds. */
    async info(interaction) {
        const ext = this.client.getExtension(__1.ReForgeGiveaways, true);
        const m = ext.options.messages;
        const reply = (content) => interaction.reply({ content, flags: discord_js_1.MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(noop_1.default);
        if (!structures_1.Database.ready)
            return reply(m.notReady);
        const g = await structures_1.Database.getByMessage(interaction.message.id, interaction.channelId);
        if (!g)
            return reply(m.unknown);
        const userID = interaction.user.id;
        const prize = (0, utils_1.truncate)(g.prize, 200);
        const reason = g.hasEntered(userID) ? null : g.denyReason(interaction.member, true);
        const status = g.hasEntered(userID)
            ? (0, messages_1.format)(m.infoEntered, { prize })
            : reason ? (0, messages_1.format)(m.infoNotEligible, { prize, reason: (0, messages_1.denyReasonText)(m, reason) }) : (0, messages_1.format)(m.infoNotEntered, { prize });
        const chance = g.winChance(userID);
        return reply((0, messages_1.format)(m.info, {
            status,
            tickets: g.hasEntered(userID) ? g.weightOf(userID) : 0,
            count: g.entries.length,
            chance: `${chance >= 1 ? 100 : Math.round(chance * 10000) / 100}%`,
            ends: g.hasEnded ? m.ended : g.isPaused() ? m.paused : (0, discord_js_1.time)(Math.floor(g.endTimestamp() / 1000), "R"),
        }));
    }
    async handle(interaction) {
        const ext = this.client.getExtension(__1.ReForgeGiveaways, true);
        const { useDefault } = ext.options;
        const m = ext.options.messages;
        let deferred = false;
        // With custom messages the entry events answer the click. A click no
        // event will answer (nothing listens, or there is no event for it)
        // still gets the default reply: an unanswered click shows "This
        // interaction failed" even when the entry worked.
        const answeredBy = (event) => !useDefault && !!event && ext.emitter.listenerCount(event) > 0;
        const reply = (content, event) => answeredBy(event)
            ? undefined
            : deferred
                ? interaction.editReply({ content, allowedMentions: { parse: [] } }).catch(noop_1.default)
                : interaction.reply({ content, flags: discord_js_1.MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(noop_1.default);
        if (!structures_1.Database.ready)
            return reply(m.notReady);
        const giveaway = await structures_1.Database.getByMessage(interaction.message.id, interaction.channelId);
        if (!giveaway) {
            (0, error_1.throwGiveawaysError)(error_1.GiveawaysErrorType.UnknownGiveaway, interaction.message.id);
            return reply(m.unknown);
        }
        // If a giveawayEntryRevoke event wants to answer, let the click go on:
        // the manager refuses it and fires that event with the reason.
        if (!answeredBy("giveawayEntryRevoke")) {
            if (giveaway.hasEnded)
                return reply(m.ended);
            if (giveaway.isPaused())
                return reply(m.paused);
        }
        const user = interaction.user;
        // Anti-spam: join/leave toggles are rate limited per user and giveaway,
        // so one person can't flood your entry events or the database.
        const wait = this.#cooldown(`${giveaway.id}:${user.id}`, ext.options.entryCooldown ?? 0);
        if (wait)
            return reply((0, messages_1.format)(m.cooldown, { time: (0, discord_js_1.time)(Math.ceil((Date.now() + wait) / 1000), "R") }));
        const work = ext.giveawaysManager.toggleEntry(giveaway.id, interaction.member, interaction, user);
        // Discord drops a click that isn't answered within 3 seconds. If the
        // giveaway is busy (e.g. being drawn), acknowledge first, answer later.
        if (useDefault) {
            let timer;
            const slow = await Promise.race([
                work.then(() => false, () => false),
                new Promise((r) => { timer = setTimeout(() => r(true), DEFER_AFTER); }),
            ]);
            clearTimeout(timer);
            if (slow)
                deferred = !!(await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral }).catch(noop_1.default));
        }
        const result = await work;
        if (!result)
            return reply(m.unknown);
        switch (result.action) {
            case "added": {
                const w = result.giveaway.weightOf(user.id);
                return reply((0, messages_1.format)(m.joined, {
                    prize: (0, utils_1.truncate)(result.giveaway.prize, 200),
                    tickets: w > 1 ? (0, messages_1.format)(m.joinedTickets, { count: w }) : "",
                }), "giveawayEntryAdd");
            }
            case "removed":
                return reply((0, messages_1.format)(m.left, { prize: (0, utils_1.truncate)(result.giveaway.prize, 200) }), "giveawayEntryRemove");
            case "denied":
                return reply((0, messages_1.format)(m.denied, { reason: (0, messages_1.denyReasonText)(m, result.reason) }), "giveawayEntryRevoke");
        }
    }
}
exports.GiveawaysInteractionHandler = GiveawaysInteractionHandler;
//# sourceMappingURL=GiveawaysInteractionHandler.js.map