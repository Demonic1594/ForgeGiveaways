import { ForgeClient } from "@tryforge/forgescript";
/**
 * Handles clicks on the giveaway buttons. The entry button (custom id
 * `giveawayEntry`, optionally followed by `-anything`) toggles the entry; the
 * info button (`giveawayInfo`) shows the clicker's status and odds.
 */
export declare class GiveawaysInteractionHandler {
    #private;
    private readonly client;
    constructor(client: ForgeClient);
    /** The "info" button: tells the clicker their status, tickets and odds. */
    private info;
    private handle;
}
//# sourceMappingURL=GiveawaysInteractionHandler.d.ts.map