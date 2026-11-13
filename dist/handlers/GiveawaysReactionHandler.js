"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GiveawaysReactionHandler = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const discord_js_1 = require("discord.js");
const __1 = require("..");
const structures_1 = require("../structures");
const noop_1 = __importDefault(require("../functions/noop"));
const utils_1 = require("../utils");
/**
 * Handles reaction based entries. Reacting joins, removing the reaction
 * leaves. Members who don't meet the requirements get their reaction removed.
 */
class GiveawaysReactionHandler {
    client;
    constructor(client) {
        this.client = client;
        const partials = client.options.partials ?? [];
        if (!partials.includes(discord_js_1.Partials.Message) || !partials.includes(discord_js_1.Partials.Reaction)) {
            forgescript_1.Logger.warn(`[ReForgeGiveaways] Enable the "Message" and "Reaction" partials so reactions on giveaway messages sent before a restart are seen`);
        }
        client.on("messageReactionAdd", (r, u) => void this.add(r, u).catch(noop_1.default));
        client.on("messageReactionRemove", (r, u) => void this.remove(r, u).catch(noop_1.default));
    }
    /** Last entry change per giveaway and user, for `entryCooldown`. */
    #lastChange = new Map();
    /**
     * Whether a join must wait for the cooldown. Leaving is never refused
     * (the reaction is already gone), but it starts the cooldown, so
     * reacting and unreacting in a loop costs at most one entry change, one
     * member lookup and one event per cooldown period.
     */
    #coolingDown(key, record) {
        const ms = this.ext.options.entryCooldown ?? 0;
        if (ms <= 0)
            return false;
        const now = Date.now();
        const last = this.#lastChange.get(key);
        if (!record)
            return last !== undefined && now - last < ms;
        this.#lastChange.set(key, now);
        if (this.#lastChange.size > 10_000) {
            for (const [k, t] of this.#lastChange)
                if (now - t >= ms)
                    this.#lastChange.delete(k);
        }
        return false;
    }
    get ext() {
        return this.client.getExtension(__1.ReForgeGiveaways, true);
    }
    matches(reaction) {
        return (0, utils_1.emojiMatches)(reaction.emoji, this.ext.options.emoji);
    }
    async add(reaction, user) {
        if (user.bot || !structures_1.Database.ready || !this.matches(reaction))
            return;
        const giveaway = await structures_1.Database.getByMessage(reaction.message.id, reaction.message.channelId);
        if (!giveaway)
            return;
        if (!giveaway.isActive()) {
            reaction.users.remove(user.id).catch(noop_1.default);
            return;
        }
        const key = `${giveaway.id}:${user.id}`;
        if (!giveaway.hasEntered(user.id) && this.#coolingDown(key, false)) {
            reaction.users.remove(user.id).catch(noop_1.default);
            return;
        }
        const guild = this.client.guilds.cache.get(giveaway.guildID);
        const member = guild?.members.cache.get(user.id) ?? (await guild?.members.fetch(user.id).catch(() => null));
        const full = user.partial ? await user.fetch().catch(() => null) : user;
        if (!member || !full) {
            reaction.users.remove(user.id).catch(noop_1.default);
            return;
        }
        const result = await this.ext.giveawaysManager.join(giveaway.id, member, reaction, full);
        if (result?.action === "denied")
            reaction.users.remove(user.id).catch(noop_1.default);
        else if (result)
            this.#coolingDown(key, true);
    }
    async remove(reaction, user) {
        if (user.bot || !structures_1.Database.ready || !this.matches(reaction))
            return;
        const giveaway = await structures_1.Database.getByMessage(reaction.message.id, reaction.message.channelId);
        // Only real participants leave: our own removal of a denied reaction
        // must not fire giveawayEntryRemove for somebody who never entered.
        if (!giveaway || !giveaway.isActive() || !giveaway.hasEntered(user.id))
            return;
        const full = user.partial ? await user.fetch().catch(() => null) : user;
        const left = await this.ext.giveawaysManager.leave(giveaway.id, user.id, reaction, full ?? undefined);
        if (left)
            this.#coolingDown(`${giveaway.id}:${user.id}`, true);
    }
}
exports.GiveawaysReactionHandler = GiveawaysReactionHandler;
//# sourceMappingURL=GiveawaysReactionHandler.js.map