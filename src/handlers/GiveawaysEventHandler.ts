import { Interaction, MessageReaction, PartialMessageReaction, User } from "discord.js"
import { BaseEventHandler, ForgeClient } from "@tryforge/forgescript"
import { Giveaway, GiveawayDenyReason } from "../structures/Giveaway"
import { ReForgeGiveaways } from ".."
import noop from "../functions/noop"

export type EntryContext = Interaction | MessageReaction | PartialMessageReaction

export interface IGiveawayEvents {
    databaseConnect: []
    giveawayStart: [Giveaway]
    giveawayEnd: [Giveaway]
    giveawayReroll: [Giveaway, Giveaway]
    giveawayEdit: [Giveaway, Giveaway]
    giveawayEntryAdd: [Giveaway, Giveaway, EntryContext, User]
    giveawayEntryRemove: [Giveaway, Giveaway, EntryContext, User]
    giveawayEntryRevoke: [Giveaway, EntryContext, User, GiveawayDenyReason?]
    giveawayCancel: [Giveaway]
    giveawayPause: [Giveaway]
    giveawayResume: [Giveaway]
}

export class GiveawaysEventHandler<T extends keyof IGiveawayEvents> extends BaseEventHandler<IGiveawayEvents, T> {
    register(client: ForgeClient) {
        const listener = this.listener as (this: ForgeClient, ...args: unknown[]) => unknown
        // Listeners are async and nobody awaits an emitter: without this, one
        // that throws becomes an unhandled rejection, which ends the process.
        const safe = (...args: unknown[]) => {
            try {
                Promise.resolve(listener.apply(client, args)).catch(noop)
            } catch (e) {
                noop(e)
            }
        }
        // @ts-ignore
        client.getExtension(ReForgeGiveaways, true).emitter.on(this.name, safe)
    }
}
