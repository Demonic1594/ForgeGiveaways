import { ForgeClient } from "@tryforge/forgescript"
import { ReForgeGiveawaysLogger as log } from "../utils/logger"
import { MessageReaction, PartialMessageReaction, PartialUser, Partials, User } from "discord.js"
import { ReForgeGiveaways } from ".."
import { Database } from "../structures"
import noop from "../functions/noop"
import { emojiMatches } from "../utils"

/**
 * Handles reaction based entries. Reacting joins, removing the reaction
 * leaves. Members who don't meet the requirements get their reaction removed.
 */
export class GiveawaysReactionHandler {
    public constructor(private readonly client: ForgeClient) {
        const partials = client.options.partials ?? []
        if (!partials.includes(Partials.Message) || !partials.includes(Partials.Reaction)) {
            log.warn(`Enable the "Message" and "Reaction" partials so reactions on giveaway messages sent before a restart are seen`)
        }

        client.on("messageReactionAdd", (r, u) => void this.add(r, u).catch(noop))
        client.on("messageReactionRemove", (r, u) => void this.remove(r, u).catch(noop))
    }

    /** Last entry change per giveaway and user, for `entryCooldown`. */
    readonly #lastChange = new Map<string, number>()

    /**
     * Whether a join must wait for the cooldown. Leaving is never refused
     * (the reaction is already gone), but it starts the cooldown, so
     * reacting and unreacting in a loop costs at most one entry change, one
     * member lookup and one event per cooldown period.
     */
    #coolingDown(key: string, record: boolean) {
        const ms = this.ext.options.entryCooldown ?? 0
        if (ms <= 0) return false
        const now = Date.now()
        const last = this.#lastChange.get(key)
        if (!record) return last !== undefined && now - last < ms
        this.#lastChange.set(key, now)
        if (this.#lastChange.size > 10_000) {
            for (const [k, t] of this.#lastChange) if (now - t >= ms) this.#lastChange.delete(k)
        }
        return false
    }

    private get ext() {
        return this.client.getExtension(ReForgeGiveaways, true)
    }

    private matches(reaction: MessageReaction | PartialMessageReaction) {
        return emojiMatches(reaction.emoji, this.ext.options.emoji!)
    }

    private async add(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        if (user.bot || !Database.ready || !this.matches(reaction)) return

        const giveaway = await Database.getByMessage(reaction.message.id, reaction.message.channelId)
        if (!giveaway) return
        if (!giveaway.isActive()) {
            reaction.users.remove(user.id).catch(noop)
            return
        }
        const key = `${giveaway.id}:${user.id}`
        if (!giveaway.hasEntered(user.id) && this.#coolingDown(key, false)) {
            reaction.users.remove(user.id).catch(noop)
            return
        }

        const guild = this.client.guilds.cache.get(giveaway.guildID)
        const member = guild?.members.cache.get(user.id) ?? (await guild?.members.fetch(user.id).catch(() => null))
        const full = user.partial ? await user.fetch().catch(() => null) : user
        if (!member || !full) {
            reaction.users.remove(user.id).catch(noop)
            return
        }

        const result = await this.ext.giveawaysManager.join(giveaway.id, member, reaction, full)
        if (result?.action === "denied") reaction.users.remove(user.id).catch(noop)
        else if (result) this.#coolingDown(key, true)
    }

    private async remove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        if (user.bot || !Database.ready || !this.matches(reaction)) return

        const giveaway = await Database.getByMessage(reaction.message.id, reaction.message.channelId)
        // Only real participants leave: our own removal of a denied reaction
        // must not fire giveawayEntryRemove for somebody who never entered.
        if (!giveaway || !giveaway.isActive() || !giveaway.hasEntered(user.id)) return

        const full = user.partial ? await user.fetch().catch(() => null) : user
        const left = await this.ext.giveawaysManager.leave(giveaway.id, user.id, reaction, full ?? undefined)
        if (left) this.#coolingDown(`${giveaway.id}:${user.id}`, true)
    }
}
