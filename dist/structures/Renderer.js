"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Renderer = exports.INFO_BUTTON_ID = exports.ENTRY_BUTTON_ID = void 0;
const discord_js_1 = require("discord.js");
const messages_1 = require("./messages");
const utils_1 = require("../utils");
exports.ENTRY_BUTTON_ID = "giveawayEntry";
exports.INFO_BUTTON_ID = "giveawayInfo";
/** Room for winner mentions in the result card (the embed description holds 4096 characters). */
const MAX_WINNER_LIST = 3000;
const roleList = (ids) => ids?.map((id) => `<@&${id}>`).join(", ");
/**
 * Builds the default giveaway embeds and components. Kept separate from the
 * manager so start, edit, pause, resume and live entry counts all render
 * through one code path (the original duplicated the embed three times).
 */
class Renderer {
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    #details(g) {
        const m = this.opts.messages;
        const req = g.requirements;
        const lines = [(0, messages_1.format)(m.embedPrize, { prize: g.prize })];
        if (g.display?.description)
            lines.push("", g.display.description, "");
        lines.push((0, messages_1.format)(m.embedWinnersCount, { count: g.winnersCount }));
        const extra = [];
        const required = roleList(req?.requiredRoles);
        if (required) {
            const many = req.requiredRoles.length > 1;
            extra.push((0, messages_1.format)(m.embedRequiredRoles, {
                s: many ? "s" : "",
                any: many && req.requiredRolesMode === "any" ? m.embedAnyRole : "",
                roles: required,
            }));
        }
        const restricted = roleList(req?.restrictedRoles);
        if (restricted)
            extra.push((0, messages_1.format)(m.embedRestrictedRoles, { roles: restricted }));
        if (req?.minAccountAge)
            extra.push((0, messages_1.format)(m.embedMinAccountAge, { time: (0, utils_1.formatDuration)(req.minAccountAge) }));
        if (req?.minMemberAge)
            extra.push((0, messages_1.format)(m.embedMinMemberAge, { time: (0, utils_1.formatDuration)(req.minMemberAge) }));
        if (g.bonusEntries?.length) {
            extra.push((0, messages_1.format)(m.embedBonusEntries, { bonuses: g.bonusEntries.map((b) => `<@&${b.roleID}> +${b.amount}`).join(", ") }));
        }
        if (g.maxEntries)
            extra.push((0, messages_1.format)(m.embedMaxEntries, { count: g.maxEntries }));
        if (extra.length)
            lines.push("", ...extra);
        return lines.join("\n");
    }
    /**
     * Winner mentions for the result card. A mention cut in half shows as raw
     * text, so when they don't all fit the list stops at a whole mention and
     * says how many more there are (the announcement lists everyone).
     */
    #winnerList(winners) {
        if (!winners.length)
            return this.opts.messages.embedNoWinners;
        const shown = [];
        let length = 0;
        for (const id of winners) {
            const mention = `<@${id}>`;
            if (length + mention.length + 2 > MAX_WINNER_LIST)
                break;
            shown.push(mention);
            length += mention.length + 2;
        }
        const rest = winners.length - shown.length;
        return shown.join(", ") + (rest ? ` ${(0, messages_1.format)(this.opts.messages.embedMoreWinners, { count: rest })}` : "");
    }
    #base(g, color) {
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(g.display?.color ?? (0, discord_js_1.resolveColor)(color))
            .setTimestamp(g.endTimestamp());
        if (g.display?.image)
            embed.setImage(g.display.image);
        if (g.display?.thumbnail)
            embed.setThumbnail(g.display.thumbnail);
        return embed;
    }
    /** Embed for an active or paused giveaway. */
    activeEmbed(g) {
        const m = this.opts.messages;
        const paused = g.isPaused();
        const entryMethod = this.opts.useReactions ? m.entryMethodReaction : m.entryMethodButton;
        return this.#base(g, paused ? this.opts.colors.paused : this.opts.colors.active)
            .setTitle((0, utils_1.truncate)(paused ? m.pausedTitle : m.title, 256))
            .setDescription((0, utils_1.truncate)(this.#details(g), 4096))
            .setFields(paused
            ? { name: m.fieldTimeLeft, value: (0, utils_1.formatDuration)(g.timeLeft()), inline: true }
            : { name: m.fieldEnds, value: `${(0, discord_js_1.time)(Math.floor(g.endTimestamp() / 1000), "R")} (${(0, discord_js_1.time)(Math.floor(g.endTimestamp() / 1000), "f")})`, inline: true }, { name: m.fieldHost, value: `<@${g.hostID}>`, inline: true }, 
        // Only shown when it is kept up to date.
        ...(this.opts.showEntryCount ? [{ name: m.fieldEntries, value: `${g.entries.length}`, inline: true }] : []))
            .setFooter({ text: (0, utils_1.truncate)(paused ? m.pausedFooter : (0, messages_1.format)(m.footer, { entryMethod }), 2048) });
    }
    /**
     * When the giveaway is shown as having ended: the actual end for early
     * ends and cancels, but the scheduled end if the draw happened late
     * because the bot was offline, so downtime doesn't change the result card.
     */
    #shownEnd(g) {
        const ended = g.endedAt ?? Date.now();
        return g.cancelled ? ended : Math.min(ended, g.endTimestamp());
    }
    /** Embed for an ended or cancelled giveaway. */
    endedEmbed(g) {
        const m = this.opts.messages;
        const lines = [(0, messages_1.format)(m.embedPrize, { prize: g.prize })];
        if (!g.cancelled)
            lines.push((0, messages_1.format)(m.embedWinners, { s: g.winners.length === 1 ? "" : "s", mentions: this.#winnerList(g.winners) }));
        lines.push((0, messages_1.format)(m.embedTotalEntries, { count: g.entries.length }));
        return this.#base(g, g.cancelled ? this.opts.colors.cancelled : this.opts.colors.ended)
            .setTitle((0, utils_1.truncate)(g.cancelled ? m.cancelledTitle : m.endedTitle, 256))
            .setDescription((0, utils_1.truncate)(lines.join("\n"), 4096))
            .setFields({ name: m.fieldEnded, value: `${(0, discord_js_1.time)(Math.floor(this.#shownEnd(g) / 1000), "R")}`, inline: true }, { name: m.fieldHost, value: `<@${g.hostID}>`, inline: true })
            .setTimestamp(this.#shownEnd(g))
            .setFooter({ text: (0, utils_1.truncate)(g.cancelled ? m.cancelledFooter : m.endedFooter, 2048) });
    }
    /** Entry button row, or nothing when reactions are used or the giveaway ended. */
    components(g) {
        if (this.opts.useReactions || g.hasEnded)
            return [];
        const label = this.opts.showEntryCount ? `${this.opts.buttonLabel} (${g.entries.length})` : this.opts.buttonLabel;
        const button = new discord_js_1.ButtonBuilder()
            .setCustomId(exports.ENTRY_BUTTON_ID)
            .setLabel((0, utils_1.truncate)(label, 80))
            .setStyle(this.opts.buttonStyle)
            .setDisabled(g.isPaused());
        if (this.opts.emoji)
            button.setEmoji(this.opts.emoji);
        const row = new discord_js_1.ActionRowBuilder().addComponents(button);
        if (this.opts.showInfoButton) {
            row.addComponents(new discord_js_1.ButtonBuilder().setCustomId(exports.INFO_BUTTON_ID).setEmoji("ℹ️").setStyle(discord_js_1.ButtonStyle.Secondary));
        }
        return [row.toJSON()];
    }
    /**
     * Keeps field names and values inside Discord's limits (256 and 1024).
     * They come from the `messages` option, and one translation that is too
     * long would otherwise make Discord refuse every giveaway message.
     */
    #fit(embed) {
        const fields = embed.data.fields ?? [];
        return embed.setFields(fields.map((f) => ({ ...f, name: (0, utils_1.truncate)(f.name || "\u200b", 256), value: (0, utils_1.truncate)(f.value || "\u200b", 1024) })));
    }
    /** Full payload for the giveaway message in its current state. */
    payload(g) {
        return {
            embeds: [this.#fit(g.hasEnded ? this.endedEmbed(g) : this.activeEmbed(g))],
            components: this.components(g),
        };
    }
}
exports.Renderer = Renderer;
//# sourceMappingURL=Renderer.js.map