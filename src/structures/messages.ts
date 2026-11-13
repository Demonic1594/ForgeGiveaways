import { GiveawayDenyReason } from "./Giveaway"

/**
 * Every text used by the default messages, including the embed itself, so the
 * whole giveaway can be translated. Override any of them through the
 * `messages` option. Placeholders in braces are replaced at send time:
 * `{prize}`, `{mentions}`, `{count}`, `{s}` (plural suffix), `{reason}`,
 * `{guild}`, `{link}`, `{tickets}`, `{roles}`, `{time}`, `{bonuses}`.
 */
export const DEFAULT_MESSAGES = {
    title: "🎉 GIVEAWAY 🎉",
    pausedTitle: "⏸️ GIVEAWAY PAUSED ⏸️",
    endedTitle: "🎉 GIVEAWAY ENDED 🎉",
    cancelledTitle: "🚫 GIVEAWAY CANCELLED 🚫",
    footer: "Click the {entryMethod} below to join!",
    pausedFooter: "Entries are paused",
    endedFooter: "Thanks for participating!",
    cancelledFooter: "This giveaway was cancelled",
    entryMethodButton: "button",
    entryMethodReaction: "reaction",
    embedPrize: "🎁 **Prize:** {prize}",
    embedWinnersCount: "🏆 **Winners:** {count}",
    embedRequiredRoles: "📌 **Required Role{s}{any}:** {roles}",
    embedAnyRole: " (any)",
    embedRestrictedRoles: "🚫 **Excluded Roles:** {roles}",
    embedMinAccountAge: "🗓️ **Min. Account Age:** {time}",
    embedMinMemberAge: "🕰️ **Min. Time in Server:** {time}",
    embedBonusEntries: "✨ **Bonus Entries:** {bonuses}",
    embedMaxEntries: "👥 **Max Entries:** {count}",
    embedWinners: "🏆 **Winner{s}:** {mentions}",
    embedNoWinners: "None",
    embedMoreWinners: "and {count} more",
    embedTotalEntries: "👥 **Total Entries:** {count}",
    fieldEnds: "Ends",
    fieldTimeLeft: "Time Left",
    fieldEnded: "Ended",
    fieldHost: "Hosted by",
    fieldEntries: "Entries",
    startPing: "{ping} 🎉 A new giveaway has started!",
    joined: "✅ You joined the giveaway for **{prize}**!{tickets}",
    joinedTickets: " ({count} entries)",
    left: "👋 You left the giveaway for **{prize}**.",
    denied: "❌ You can't enter this giveaway: {reason}",
    ended: "⌛ This giveaway has already ended.",
    paused: "⏸️ This giveaway is paused right now, please try again later.",
    unknown: "❓ This giveaway no longer exists.",
    cooldown: "⏳ Slow down! You can join or leave again {time}.",
    info: "{status}\n🎟️ **Your entries:** {tickets}\n👥 **Participants:** {count}\n🍀 **Win chance:** {chance}\n⏰ **Ends:** {ends}",
    infoEntered: "✅ You are entered in the giveaway for **{prize}**.",
    infoNotEntered: "❌ You haven't entered the giveaway for **{prize}** yet.",
    infoNotEligible: "🚫 You can't enter the giveaway for **{prize}**: {reason}",
    notReady: "⏳ Giveaways are still loading, please try again in a moment.",
    winners: "🎉 Congratulations to the winner{s} of **{prize}**!\n🏆 {mentions}",
    winnersContinued: "🏆 {mentions}",
    noWinners: "😢 There were no valid entries, so **{prize}** has no winners.",
    reroll: "🔁 Rerolled! Congratulations to the new winner{s} of **{prize}**!\n🏆 {mentions}",
    winnerDM: "🎉 You won **{prize}** in **{guild}**!\n{link}",
    unknownGuild: "the server",
    reasonBot: "bots can't enter giveaways.",
    reasonHost: "the host can't enter their own giveaway.",
    reasonMissingRoles: "you don't have the required role(s).",
    reasonRestrictedRole: "one of your roles is not allowed to enter.",
    reasonRestrictedMember: "you are not allowed to enter.",
    reasonAccountTooNew: "your Discord account is too new.",
    reasonMemberTooNew: "you joined this server too recently.",
    reasonEntriesFull: "the maximum number of entries has been reached.",
    reasonEnded: "it has already ended.",
    reasonPaused: "it is paused.",
}

export type GiveawayMessages = typeof DEFAULT_MESSAGES

const REASON_KEYS: Record<GiveawayDenyReason, keyof GiveawayMessages> = {
    [GiveawayDenyReason.Bot]: "reasonBot",
    [GiveawayDenyReason.Host]: "reasonHost",
    [GiveawayDenyReason.MissingRoles]: "reasonMissingRoles",
    [GiveawayDenyReason.RestrictedRole]: "reasonRestrictedRole",
    [GiveawayDenyReason.RestrictedMember]: "reasonRestrictedMember",
    [GiveawayDenyReason.AccountTooNew]: "reasonAccountTooNew",
    [GiveawayDenyReason.MemberTooNew]: "reasonMemberTooNew",
    [GiveawayDenyReason.EntriesFull]: "reasonEntriesFull",
    [GiveawayDenyReason.Ended]: "reasonEnded",
    [GiveawayDenyReason.Paused]: "reasonPaused",
}

/** Human readable text for a deny reason. */
export function denyReasonText(messages: GiveawayMessages, reason: GiveawayDenyReason) {
    return messages[REASON_KEYS[reason]] ?? reason
}
export type GiveawayMessageKey = keyof GiveawayMessages

/** Fills `{placeholders}`; unknown placeholders are left as they are. */
export function format(template: string, values: Record<string, string | number | undefined>) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        const v = values[key]
        return v === undefined ? match : String(v)
    })
}
