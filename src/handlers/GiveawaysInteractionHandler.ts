import { ForgeClient } from "@tryforge/forgescript"
import { ButtonInteraction, MessageFlags, time, User } from "discord.js"
import { ReForgeGiveaways } from ".."
import { Database, ENTRY_BUTTON_ID, Giveaway, INFO_BUTTON_ID } from "../structures"
import { denyReasonText, format, GiveawayMessages } from "../structures/messages"
import { GiveawaysErrorType, throwGiveawaysError } from "../functions/error"
import noop from "../functions/noop"
import { truncate } from "../utils"

/** Acknowledge a click that takes longer than this (Discord allows 3 s). */
const DEFER_AFTER = 2000

/**
 * Handles clicks on the giveaway buttons. The entry button (custom id
 * `giveawayEntry`, optionally followed by `-anything`) toggles the entry; the
 * info button (`giveawayInfo`) shows the clicker's status and odds.
 */
export class GiveawaysInteractionHandler {
    public constructor(private readonly client: ForgeClient) {
        this.client.on("interactionCreate", (interaction) => {
            if (!interaction.isButton() || !interaction.inGuild()) return
            const [action] = interaction.customId.split("-")
            if (action === ENTRY_BUTTON_ID) this.handle(interaction).catch(noop)
            else if (action === INFO_BUTTON_ID) this.info(interaction).catch(noop)
        })
    }

    /** Last join/leave per giveaway and user, for the anti-spam cooldown. */
    readonly #lastToggle = new Map<string, number>()

    /** Returns the remaining cooldown in ms (0 if none) and records the click. */
    #cooldown(key: string, ms: number) {
        if (ms <= 0) return 0
        const now = Date.now()
        const last = this.#lastToggle.get(key)
        if (last !== undefined && now - last < ms) return ms - (now - last)
        this.#lastToggle.set(key, now)
        // Keep the map small: drop stale keys once it grows.
        if (this.#lastToggle.size > 10_000) {
            for (const [k, t] of this.#lastToggle) if (now - t >= ms) this.#lastToggle.delete(k)
        }
        return 0
    }

    /** The "info" button: tells the clicker their status, tickets and odds. */
    private async info(interaction: ButtonInteraction<"cached" | "raw">) {
        const ext = this.client.getExtension(ReForgeGiveaways, true)
        const m = ext.options.messages as GiveawayMessages
        const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(noop)
        if (!Database.ready) return reply(m.notReady)

        const g = await Database.getByMessage(interaction.message.id, interaction.channelId)
        if (!g) return reply(m.unknown)
        const userID = interaction.user.id
        const prize = truncate(g.prize, 200)

        const reason = g.hasEntered(userID) ? null : g.denyReason(interaction.member, true)
        const status = g.hasEntered(userID)
            ? format(m.infoEntered, { prize })
            : reason ? format(m.infoNotEligible, { prize, reason: denyReasonText(m, reason) }) : format(m.infoNotEntered, { prize })
        const chance = g.winChance(userID)
        return reply(format(m.info, {
            status,
            tickets: g.hasEntered(userID) ? g.weightOf(userID) : 0,
            count: g.entries.length,
            chance: `${chance >= 1 ? 100 : Math.round(chance * 10000) / 100}%`,
            ends: g.hasEnded ? m.ended : g.isPaused() ? m.paused : time(Math.floor(g.endTimestamp() / 1000), "R"),
        }))
    }

    private async handle(interaction: ButtonInteraction<"cached" | "raw">) {
        const ext = this.client.getExtension(ReForgeGiveaways, true)
        const { useDefault } = ext.options
        const m = ext.options.messages as GiveawayMessages
        let deferred = false
        const reply = (content: string) => !useDefault
            ? undefined
            : deferred
                ? interaction.editReply({ content, allowedMentions: { parse: [] } }).catch(noop)
                : interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(noop)

        if (!Database.ready) return reply(m.notReady)

        const giveaway = await Database.getByMessage(interaction.message.id, interaction.channelId)
        if (!giveaway) {
            throwGiveawaysError(GiveawaysErrorType.UnknownGiveaway, interaction.message.id)
            return reply(m.unknown)
        }
        if (giveaway.hasEnded) return reply(m.ended)
        if (giveaway.isPaused()) return reply(m.paused)

        const user = interaction.user as User
        // Anti-spam: join/leave toggles are rate limited per user and giveaway,
        // so one person can't flood your entry events or the database.
        const wait = this.#cooldown(`${giveaway.id}:${user.id}`, ext.options.entryCooldown ?? 0)
        if (wait) return reply(format(m.cooldown, { time: time(Math.ceil((Date.now() + wait) / 1000), "R") }))

        const work = ext.giveawaysManager.toggleEntry(giveaway.id, interaction.member, interaction, user)

        // Discord drops a click that isn't answered within 3 seconds. If the
        // giveaway is busy (e.g. being drawn), acknowledge first, answer later.
        if (useDefault) {
            let timer: NodeJS.Timeout | undefined
            const slow = await Promise.race([
                work.then(() => false, () => false),
                new Promise<boolean>((r) => { timer = setTimeout(() => r(true), DEFER_AFTER) }),
            ])
            clearTimeout(timer)
            if (slow) deferred = !!(await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(noop))
        }

        const result = await work
        if (!result) return reply(m.unknown)

        switch (result.action) {
            case "added": {
                const w = result.giveaway.weightOf(user.id)
                return reply(format(m.joined, { prize: truncate(result.giveaway.prize, 200), tickets: w > 1 ? ` (${w} entries)` : "" }))
            }
            case "removed":
                return reply(format(m.left, { prize: truncate(result.giveaway.prize, 200) }))
            case "denied":
                return reply(format(m.denied, { reason: denyReasonText(m, result.reason!) }))
        }
    }
}
