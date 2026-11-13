import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ColorResolvable,
    EmbedBuilder,
    resolveColor,
    time,
} from "discord.js"
import { Giveaway } from "./Giveaway"
import { format, GiveawayMessages } from "./messages"
import { formatDuration, truncate } from "../utils"

export const ENTRY_BUTTON_ID = "giveawayEntry"
export const INFO_BUTTON_ID = "giveawayInfo"

export interface IRendererOptions {
    emoji: string
    buttonLabel: string
    buttonStyle: ButtonStyle
    showEntryCount: boolean
    showInfoButton: boolean
    useReactions: boolean
    colors: { active: ColorResolvable, paused: ColorResolvable, ended: ColorResolvable, cancelled: ColorResolvable }
    messages: GiveawayMessages
}

/** Room for winner mentions in the result card (the embed description holds 4096 characters). */
const MAX_WINNER_LIST = 3000

const roleList = (ids?: string[] | null) => ids?.map((id) => `<@&${id}>`).join(", ")

/**
 * Builds the default giveaway embeds and components. Kept separate from the
 * manager so start, edit, pause, resume and live entry counts all render
 * through one code path (the original duplicated the embed three times).
 */
export class Renderer {
    public constructor(private readonly opts: IRendererOptions) {}

    #details(g: Giveaway) {
        const m = this.opts.messages
        const req = g.requirements
        const lines: string[] = [format(m.embedPrize, { prize: g.prize })]
        if (g.display?.description) lines.push("", g.display.description, "")
        lines.push(format(m.embedWinnersCount, { count: g.winnersCount }))

        const extra: string[] = []
        const required = roleList(req?.requiredRoles)
        if (required) {
            const many = req!.requiredRoles!.length > 1
            extra.push(format(m.embedRequiredRoles, {
                s: many ? "s" : "",
                any: many && req!.requiredRolesMode === "any" ? m.embedAnyRole : "",
                roles: required,
            }))
        }
        const restricted = roleList(req?.restrictedRoles)
        if (restricted) extra.push(format(m.embedRestrictedRoles, { roles: restricted }))
        if (req?.minAccountAge) extra.push(format(m.embedMinAccountAge, { time: formatDuration(req.minAccountAge) }))
        if (req?.minMemberAge) extra.push(format(m.embedMinMemberAge, { time: formatDuration(req.minMemberAge) }))
        if (g.bonusEntries?.length) {
            extra.push(format(m.embedBonusEntries, { bonuses: g.bonusEntries.map((b) => `<@&${b.roleID}> +${b.amount}`).join(", ") }))
        }
        if (g.maxEntries) extra.push(format(m.embedMaxEntries, { count: g.maxEntries }))
        if (extra.length) lines.push("", ...extra)

        return lines.join("\n")
    }

    /**
     * Winner mentions for the result card. A mention cut in half shows as raw
     * text, so when they don't all fit the list stops at a whole mention and
     * says how many more there are (the announcement lists everyone).
     */
    #winnerList(winners: readonly string[]) {
        if (!winners.length) return this.opts.messages.embedNoWinners
        const shown: string[] = []
        let length = 0
        for (const id of winners) {
            const mention = `<@${id}>`
            if (length + mention.length + 2 > MAX_WINNER_LIST) break
            shown.push(mention)
            length += mention.length + 2
        }
        const rest = winners.length - shown.length
        return shown.join(", ") + (rest ? ` ${format(this.opts.messages.embedMoreWinners, { count: rest })}` : "")
    }

    #base(g: Giveaway, color: ColorResolvable) {
        const embed = new EmbedBuilder()
            .setColor(g.display?.color ?? resolveColor(color))
            .setTimestamp(g.endTimestamp())
        if (g.display?.image) embed.setImage(g.display.image)
        if (g.display?.thumbnail) embed.setThumbnail(g.display.thumbnail)
        return embed
    }

    /** Embed for an active or paused giveaway. */
    public activeEmbed(g: Giveaway) {
        const m = this.opts.messages
        const paused = g.isPaused()
        const entryMethod = this.opts.useReactions ? m.entryMethodReaction : m.entryMethodButton

        return this.#base(g, paused ? this.opts.colors.paused : this.opts.colors.active)
            .setTitle(paused ? m.pausedTitle : m.title)
            .setDescription(truncate(this.#details(g), 4096))
            .setFields(
                paused
                    ? { name: m.fieldTimeLeft, value: formatDuration(g.timeLeft()), inline: true }
                    : { name: m.fieldEnds, value: `${time(Math.floor(g.endTimestamp() / 1000), "R")} (${time(Math.floor(g.endTimestamp() / 1000), "f")})`, inline: true },
                { name: m.fieldHost, value: `<@${g.hostID}>`, inline: true },
                // Only shown when it is kept up to date.
                ...(this.opts.showEntryCount ? [{ name: m.fieldEntries, value: `${g.entries.length}`, inline: true }] : []),
            )
            .setFooter({ text: truncate(paused ? m.pausedFooter : format(m.footer, { entryMethod }), 2048) })
    }

    /**
     * When the giveaway is shown as having ended: the actual end for early
     * ends and cancels, but the scheduled end if the draw happened late
     * because the bot was offline, so downtime doesn't change the result card.
     */
    #shownEnd(g: Giveaway) {
        const ended = g.endedAt ?? Date.now()
        return g.cancelled ? ended : Math.min(ended, g.endTimestamp())
    }

    /** Embed for an ended or cancelled giveaway. */
    public endedEmbed(g: Giveaway) {
        const m = this.opts.messages
        const lines = [format(m.embedPrize, { prize: g.prize })]
        if (!g.cancelled) lines.push(format(m.embedWinners, { s: g.winners.length === 1 ? "" : "s", mentions: this.#winnerList(g.winners) }))
        lines.push(format(m.embedTotalEntries, { count: g.entries.length }))

        return this.#base(g, g.cancelled ? this.opts.colors.cancelled : this.opts.colors.ended)
            .setTitle(g.cancelled ? m.cancelledTitle : m.endedTitle)
            .setDescription(truncate(lines.join("\n"), 4096))
            .setFields(
                { name: m.fieldEnded, value: `${time(Math.floor(this.#shownEnd(g) / 1000), "R")}`, inline: true },
                { name: m.fieldHost, value: `<@${g.hostID}>`, inline: true },
            )
            .setTimestamp(this.#shownEnd(g))
            .setFooter({ text: truncate(g.cancelled ? m.cancelledFooter : m.endedFooter, 2048) })
    }

    /** Entry button row, or nothing when reactions are used or the giveaway ended. */
    public components(g: Giveaway) {
        if (this.opts.useReactions || g.hasEnded) return []
        const label = this.opts.showEntryCount ? `${this.opts.buttonLabel} (${g.entries.length})` : this.opts.buttonLabel
        const button = new ButtonBuilder()
            .setCustomId(ENTRY_BUTTON_ID)
            .setLabel(truncate(label, 80))
            .setStyle(this.opts.buttonStyle)
            .setDisabled(g.isPaused())
        if (this.opts.emoji) button.setEmoji(this.opts.emoji)
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)
        if (this.opts.showInfoButton) {
            row.addComponents(new ButtonBuilder().setCustomId(INFO_BUTTON_ID).setEmoji("ℹ️").setStyle(ButtonStyle.Secondary))
        }
        return [row.toJSON()]
    }

    /** Full payload for the giveaway message in its current state. */
    public payload(g: Giveaway) {
        return {
            embeds: [g.hasEnded ? this.endedEmbed(g) : this.activeEmbed(g)],
            components: this.components(g),
        }
    }
}
