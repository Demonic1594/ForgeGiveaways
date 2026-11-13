import { GiveawayDenyReason } from "./Giveaway";
/**
 * Every text used by the default messages, including the embed itself, so the
 * whole giveaway can be translated. Override any of them through the
 * `messages` option. Placeholders in braces are replaced at send time:
 * `{prize}`, `{mentions}`, `{count}`, `{s}` (plural suffix), `{reason}`,
 * `{guild}`, `{link}`, `{tickets}`, `{roles}`, `{time}`, `{bonuses}`.
 */
export declare const DEFAULT_MESSAGES: {
    title: string;
    pausedTitle: string;
    endedTitle: string;
    cancelledTitle: string;
    footer: string;
    pausedFooter: string;
    endedFooter: string;
    cancelledFooter: string;
    entryMethodButton: string;
    entryMethodReaction: string;
    embedPrize: string;
    embedWinnersCount: string;
    embedRequiredRoles: string;
    embedAnyRole: string;
    embedRestrictedRoles: string;
    embedMinAccountAge: string;
    embedMinMemberAge: string;
    embedBonusEntries: string;
    embedMaxEntries: string;
    embedWinners: string;
    embedNoWinners: string;
    embedMoreWinners: string;
    embedTotalEntries: string;
    fieldEnds: string;
    fieldTimeLeft: string;
    fieldEnded: string;
    fieldHost: string;
    fieldEntries: string;
    startPing: string;
    joined: string;
    joinedTickets: string;
    left: string;
    denied: string;
    ended: string;
    paused: string;
    unknown: string;
    cooldown: string;
    info: string;
    infoEntered: string;
    infoNotEntered: string;
    infoNotEligible: string;
    notReady: string;
    winners: string;
    winnersContinued: string;
    noWinners: string;
    reroll: string;
    winnerDM: string;
    unknownGuild: string;
    reasonBot: string;
    reasonHost: string;
    reasonMissingRoles: string;
    reasonRestrictedRole: string;
    reasonRestrictedMember: string;
    reasonAccountTooNew: string;
    reasonMemberTooNew: string;
    reasonEntriesFull: string;
    reasonEnded: string;
    reasonPaused: string;
};
export type GiveawayMessages = typeof DEFAULT_MESSAGES;
/** Human readable text for a deny reason. */
export declare function denyReasonText(messages: GiveawayMessages, reason: GiveawayDenyReason): string;
export type GiveawayMessageKey = keyof GiveawayMessages;
/** Fills `{placeholders}`; unknown placeholders are left as they are. */
export declare function format(template: string, values: Record<string, string | number | undefined>): string;
//# sourceMappingURL=messages.d.ts.map