"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GiveawaysManager = void 0;
const discord_js_1 = require("discord.js");
const forgescript_1 = require("@tryforge/forgescript");
const structures_1 = require("../structures");
const messages_1 = require("../structures/messages");
const error_1 = require("../functions/error");
const utils_1 = require("../utils");
const noop_1 = __importDefault(require("../functions/noop"));
const MAX_MESSAGE = 2000;
/** How often the scheduler re-checks the wall clock (host sleep, clock jumps). */
const WATCHDOG_INTERVAL = 30_000;
/** Retry delay when a deadline can't be processed yet (disconnected, guild outage). */
const RETRY_DELAY = 60_000;
/** After this long past the deadline, end even if the guild is still unavailable. */
const MAX_POSTPONE = 24 * 36e5;
/** Retry delay for a failed background write of entries. */
const RETRY_FLUSH = 5_000;
/** How long a call waits for the database before giving up. */
const READY_TIMEOUT = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms).unref?.());
/** Prize as used inside chat messages, short enough to never push winner mentions out. */
const shortPrize = (g) => (0, utils_1.truncate)(g.prize, 200);
/** Throws a RangeError for options outside {@link GiveawayLimits}. */
function validate(o) {
    const fail = (msg) => { throw new RangeError(msg); };
    if (o.prize != null && o.prize.trim().length > structures_1.GiveawayLimits.prize)
        fail(`Giveaway prize must be at most ${structures_1.GiveawayLimits.prize} characters`);
    if (o.winnersCount != null && Math.floor(o.winnersCount) > structures_1.GiveawayLimits.count)
        fail(`Giveaway winners count must be at most ${structures_1.GiveawayLimits.count}`);
    if (o.maxEntries != null && o.maxEntries > structures_1.GiveawayLimits.count)
        fail(`Giveaway max entries must be at most ${structures_1.GiveawayLimits.count}`);
    for (const b of o.bonusEntries ?? []) {
        if (!Number.isInteger(b.amount) || b.amount < 1 || b.amount > structures_1.GiveawayLimits.bonus)
            fail(`Bonus entries must be between 1 and ${structures_1.GiveawayLimits.bonus}`);
    }
    if ((o.display?.description?.length ?? 0) > structures_1.GiveawayLimits.description)
        fail(`Giveaway description must be at most ${structures_1.GiveawayLimits.description} characters`);
}
/**
 * Owns the life cycle of every giveaway: start, end, reroll, edit, pause,
 * resume, extend, cancel and entries.
 *
 * - All state changes for a giveaway run through a per-giveaway lock, so
 *   concurrent clicks or a timer racing a manual end can't lose writes or
 *   announce winners twice.
 * - End times are tracked by a single {@link Scheduler}, which has no maximum
 *   duration (the original `setTimeout` per giveaway broke past ~24.8 days).
 * - Entry changes are batched into one database write per giveaway every
 *   `entryFlushDelay` ms, and the live entry counter on the message is
 *   refreshed at most every `messageUpdateDelay` ms.
 */
class GiveawaysManager {
    client;
    giveaways;
    scheduler;
    renderer;
    // Life cycle changes (end, cancel, reroll, edit, extend, pause, resume)
    // work on a copy that replaces the cached giveaway only once it has been
    // saved, so a failed write can't leave memory and database disagreeing.
    #lock = new utils_1.KeyedMutex();
    #flushTimers = new Map();
    #refreshTimers = new Map();
    #sweepTimer = null;
    #ready;
    #markReady;
    #isReady = false;
    /** Deadlines are processed one at a time so a restart after long downtime doesn't fire everything at once. */
    #deadlineChain = Promise.resolve();
    constructor(client, giveaways) {
        this.client = client;
        this.giveaways = giveaways;
        const o = giveaways.options;
        this.renderer = new structures_1.Renderer({
            emoji: o.emoji,
            buttonLabel: o.buttonLabel,
            buttonStyle: o.buttonStyle,
            showEntryCount: o.showEntryCount,
            showInfoButton: o.showInfoButton,
            useReactions: !!o.useReactions,
            colors: o.colors,
            messages: o.messages,
        });
        this.scheduler = new utils_1.Scheduler((id) => {
            this.#deadlineChain = this.#deadlineChain
                .then(() => this._onDeadline(id))
                .catch((e) => {
                // e.g. the database was briefly unreachable: try again
                // instead of losing the deadline until the next restart.
                (0, noop_1.default)(e);
                if (!this.scheduler.has(id))
                    this.scheduler.schedule(id, Date.now() + RETRY_DELAY);
            });
        }, { maxDelay: WATCHDOG_INTERVAL });
        this.#ready = new Promise((res) => (this.#markReady = res));
    }
    get messages() {
        return this.giveaways.options.messages;
    }
    /** Resolves once the database is connected. */
    whenReady() {
        return this.#ready;
    }
    /**
     * Waits for the database, but not forever: if it never connects, calls
     * fail after {@link READY_TIMEOUT} instead of hanging the command.
     */
    async #awaitReady() {
        if (this.#isReady)
            return;
        let timer;
        const timeout = new Promise((_, rej) => {
            timer = setTimeout(() => rej(new Error("[ReForgeGiveaways] Database is not connected")), READY_TIMEOUT);
            timer.unref?.();
        });
        try {
            await Promise.race([this.#ready, timeout]);
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** @internal Called by the extension once the database is connected. */
    _onDatabaseReady() {
        this.#isReady = true;
        this.#markReady();
        const client = this.client;
        if (client.isReady())
            this._restore().catch(noop_1.default);
        else
            client.once("clientReady", () => this._restore().catch(noop_1.default));
    }
    // ----------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------
    emit = (...args) => this.giveaways.emitter.emit(...args);
    /** Whether anything listens to an event, so snapshots are only built when needed. */
    wants(event) {
        return this.giveaways.emitter.listenerCount(event) > 0;
    }
    async getChannel(channelID) {
        const cached = this.client.channels.cache.get(channelID);
        const chan = cached ?? (await this.client.channels.fetch(channelID).catch(() => null));
        return chan && chan.isTextBased() && "send" in chan ? chan : null;
    }
    /**
     * Fetches the message of a giveaway.
     * @param channelID The id of the channel to pull message from.
     * @param messageID The id of the message to fetch.
     */
    async fetchMessage(channelID, messageID) {
        if (!messageID || !/^\d{17,20}$/.test(messageID))
            return;
        const chan = await this.getChannel(channelID);
        if (!chan)
            return;
        return chan.messages.cache.get(messageID) ?? (await chan.messages.fetch(messageID).catch(() => undefined));
    }
    async getGuild(guildID) {
        return this.client.guilds.cache.get(guildID) ?? (await this.client.guilds.fetch(guildID).catch(() => null));
    }
    clearTimers(id) {
        const f = this.#flushTimers.get(id);
        if (f)
            clearTimeout(f);
        this.#flushTimers.delete(id);
        const r = this.#refreshTimers.get(id);
        if (r)
            clearTimeout(r);
        this.#refreshTimers.delete(id);
    }
    /** Persists a giveaway now (inside its lock). */
    async save(g) {
        const f = this.#flushTimers.get(g.id);
        if (f)
            clearTimeout(f);
        this.#flushTimers.delete(g.id);
        await structures_1.Database.set(g);
    }
    /** Queues a coalesced write of entry changes. */
    queueFlush(g) {
        const delay = this.giveaways.options.entryFlushDelay;
        if (delay <= 0) {
            // Write now; if that fails the change is still in memory, so keep
            // retrying in the background instead of losing it on restart.
            return this.save(g).catch((e) => {
                (0, noop_1.default)(e);
                this.#scheduleFlush(g.id, RETRY_FLUSH);
            });
        }
        this.#scheduleFlush(g.id, delay);
    }
    #scheduleFlush(id, delay) {
        if (this.#flushTimers.has(id))
            return;
        const t = setTimeout(() => {
            this.#flushTimers.delete(id);
            this.#lock.run(id, async () => {
                // Always write the *current* state. Writing the object captured
                // when the timer was set could overwrite a newer saved change
                // (e.g. resurrect a giveaway that was ended meanwhile).
                const cur = await structures_1.Database.get(id);
                if (cur)
                    await structures_1.Database.set(cur);
            }).catch((e) => {
                (0, noop_1.default)(e);
                this.#scheduleFlush(id, RETRY_FLUSH);
            });
        }, delay);
        t.unref?.();
        this.#flushTimers.set(id, t);
    }
    /** Queues a refresh of the giveaway message (live entry count). */
    queueRefresh(g) {
        const { useDefault, showEntryCount } = this.giveaways.options;
        if (!useDefault || !g.messageID || this.#refreshTimers.has(g.id))
            return;
        if (!showEntryCount)
            return;
        const t = setTimeout(() => {
            this.#refreshTimers.delete(g.id);
            this.#lock.run(g.id, async () => {
                const cur = await structures_1.Database.get(g.id);
                if (cur && !cur.hasEnded)
                    await this.updateMessage(cur);
            }).catch(noop_1.default);
        }, this.giveaways.options.messageUpdateDelay);
        t.unref?.();
        this.#refreshTimers.set(g.id, t);
    }
    /** Writes every pending entry change to the database. */
    async flushAll() {
        const ids = [...this.#flushTimers.keys()];
        for (const id of ids) {
            clearTimeout(this.#flushTimers.get(id));
            this.#flushTimers.delete(id);
        }
        await Promise.all(ids.map((id) => this.#lock.run(id, async () => {
            const g = await structures_1.Database.get(id);
            if (g)
                await structures_1.Database.set(g);
        }).catch(noop_1.default)));
    }
    /** Re-renders the default giveaway message. */
    async updateMessage(g) {
        if (!this.giveaways.options.useDefault)
            return true;
        const msg = await this.fetchMessage(g.channelID, g.messageID);
        if (!msg) {
            (0, error_1.throwGiveawaysError)(error_1.GiveawaysErrorType.MessageNotFound, g.id);
            return false;
        }
        await msg.edit(this.renderer.payload(g)).catch(noop_1.default);
        return true;
    }
    schedule(g) {
        if (g.hasEnded || g.isPaused())
            this.scheduler.cancel(g.id);
        else
            this.scheduler.schedule(g.id, g.endTimestamp());
    }
    // ----------------------------------------------------------------------
    // Life cycle
    // ----------------------------------------------------------------------
    /**
     * Starts a new giveaway on a guild. There is no upper limit on the duration.
     * @param options The start options for the giveaway.
     */
    async start(options) {
        await this.#awaitReady();
        const winnersCount = Math.floor(Number(options.winnersCount));
        const duration = Math.floor(Number(options.duration));
        if (!Number.isFinite(duration) || duration <= 0)
            throw new RangeError("Giveaway duration must be a positive amount of time");
        if (!Number.isSafeInteger(Date.now() + duration))
            throw new RangeError("Giveaway duration is too large");
        if (!Number.isFinite(winnersCount) || winnersCount < 1)
            throw new RangeError("Giveaway winners count must be at least 1");
        if (!options.prize?.trim())
            throw new RangeError("Giveaway prize must not be empty");
        validate(options);
        const giveaway = structures_1.Database.create({ ...options, duration, winnersCount, prize: options.prize.trim() });
        if (giveaway.maxEntries != null && !(giveaway.maxEntries >= 1))
            giveaway.maxEntries = null;
        // Persist first, then post. If the bot dies in between, the next start
        // finds a giveaway without a message and posts it (see _restore);
        // the other order would leave a message whose button belongs to nothing.
        return this.#lock.run(giveaway.id, async () => {
            await structures_1.Database.set(giveaway);
            if (this.giveaways.options.useDefault && !(await this.postMessage(giveaway))) {
                (0, error_1.throwGiveawaysError)(error_1.GiveawaysErrorType.MessageNotDetermined, giveaway.id);
                await structures_1.Database.delete(giveaway.id).catch(noop_1.default);
                return null;
            }
            this.schedule(giveaway);
            this.emit("giveawayStart", giveaway.clone());
            return giveaway;
        });
    }
    /** Sends the default giveaway message and saves its id. Returns false if it could not be sent. */
    async postMessage(giveaway) {
        const chan = await this.getChannel(giveaway.channelID);
        const ping = giveaway.display?.pingRoleID;
        const msg = await chan?.send({
            content: ping ? (0, messages_1.format)(this.messages.startPing, { ping: `<@&${ping}>` }) : undefined,
            ...this.renderer.payload(giveaway),
            allowedMentions: { parse: [], roles: ping ? [ping] : [] },
        }).catch(noop_1.default);
        if (!msg)
            return false;
        if (this.giveaways.options.useReactions)
            await msg.react(this.giveaways.options.emoji).catch(noop_1.default);
        giveaway.messageID = msg.id;
        await this.save(giveaway);
        return true;
    }
    /**
     * Links a custom start message to a giveaway (used by the `giveawayStart`
     * event when default messages are disabled).
     */
    async attachMessage(id, messageID) {
        return this.#lock.run(id, async () => {
            const g = await structures_1.Database.get(id);
            if (!g)
                return null;
            g.messageID = messageID;
            await this.save(g);
            return g;
        });
    }
    /** Removes a giveaway and its timers without announcing anything. */
    async discard(id) {
        return this.#lock.run(id, async () => {
            this.scheduler.cancel(id);
            this.clearTimers(id);
            return await structures_1.Database.delete(id);
        });
    }
    /**
     * Whether a guild can be used for a draw right now.
     * - `ok`: available.
     * - `unavailable`: Discord outage or a network error; worth retrying.
     * - `gone`: the bot was removed (Unknown Guild / Missing Access).
     */
    async guildStatus(guildID) {
        const cached = this.client.guilds.cache.get(guildID);
        if (cached)
            return cached.available ? "ok" : "unavailable";
        try {
            const guild = await this.client.guilds.fetch(guildID);
            return guild.available ? "ok" : "unavailable";
        }
        catch (e) {
            const code = e instanceof discord_js_1.DiscordAPIError ? e.code : e?.code;
            return code === discord_js_1.RESTJSONErrorCodes.UnknownGuild || code === discord_js_1.RESTJSONErrorCodes.MissingAccess ? "gone" : "unavailable";
        }
    }
    /**
     * Timer path for ending. Drawing while the bot is disconnected or the
     * guild is in an outage would find no members and end with no winners,
     * so it retries every minute instead (up to a day past the deadline).
     * Manual `end()` calls are never postponed.
     */
    async _onDeadline(id) {
        const giveaway = await structures_1.Database.get(id).catch(() => null);
        if (!giveaway || giveaway.hasEnded || giveaway.isPaused())
            return null;
        // A deadline moved later (extend) while this one was queued.
        if (giveaway.endTimestamp() > Date.now()) {
            this.schedule(giveaway);
            return null;
        }
        const overdue = Date.now() - giveaway.endTimestamp();
        if (overdue < MAX_POSTPONE) {
            const status = this.client.isReady() ? await this.guildStatus(giveaway.guildID) : "unavailable";
            if (status === "unavailable") {
                forgescript_1.Logger.warn(`[ReForgeGiveaways] Guild of giveaway ${id} is unavailable, retrying the draw in ${RETRY_DELAY / 1000}s`);
                this.scheduler.schedule(id, Date.now() + RETRY_DELAY);
                return null;
            }
        }
        return this.end(id);
    }
    /**
     * Ends an existing giveaway and draws the winners.
     * @param id The id of the giveaway to end.
     */
    async end(id) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = (await structures_1.Database.get(id))?.clone();
            if (!giveaway || giveaway.hasEnded)
                return null;
            this.scheduler.cancel(id);
            this.clearTimers(id);
            // Reactions added or removed while the bot was offline count too.
            if (this.giveaways.options.useReactions)
                await this.#syncReactions(giveaway).catch(noop_1.default);
            try {
                giveaway.winners = await this.drawWinners(giveaway, giveaway.winnersCount);
                giveaway.hasEnded = true;
                giveaway.endedAt = Date.now();
                giveaway.pausedAt = null;
                giveaway.announcePending = "end";
                await this.save(giveaway);
            }
            catch (e) {
                // Nothing was saved: the giveaway is still running, keep its timer.
                const cur = await structures_1.Database.get(id).catch(() => null);
                if (cur && !cur.hasEnded)
                    this.schedule(cur);
                throw e;
            }
            await this.#publish(giveaway, "end");
            return giveaway;
        });
    }
    /**
     * Shows the result of an end or reroll: updates the message, announces the
     * winners, DMs them and fires the event, then clears `announcePending`.
     * Runs again on the next start if the bot stopped before finishing.
     */
    async #publish(giveaway, kind, winners = giveaway.winners, old) {
        if (this.giveaways.options.useDefault) {
            const msg = await this.fetchMessage(giveaway.channelID, giveaway.messageID);
            if (msg)
                await msg.edit(this.renderer.payload(giveaway)).catch(noop_1.default);
            else
                (0, error_1.throwGiveawaysError)(error_1.GiveawaysErrorType.MessageNotFound, giveaway.id);
            await this.announce(giveaway, msg, winners, kind === "end" ? "winners" : "reroll");
        }
        if (this.giveaways.options.dmWinners)
            this.dmWinners(giveaway, winners).catch(noop_1.default);
        if (kind === "end")
            this.emit("giveawayEnd", giveaway.clone());
        else
            this.emit("giveawayReroll", old ?? giveaway.clone(), giveaway.clone());
        giveaway.announcePending = null;
        await this.save(giveaway).catch(noop_1.default);
    }
    /**
     * Cancels a running giveaway: it ends without winners.
     */
    async cancel(id) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = (await structures_1.Database.get(id))?.clone();
            if (!giveaway || giveaway.hasEnded)
                return null;
            this.scheduler.cancel(id);
            this.clearTimers(id);
            giveaway.hasEnded = true;
            giveaway.cancelled = true;
            giveaway.endedAt = Date.now();
            giveaway.pausedAt = null;
            giveaway.winners = [];
            await this.save(giveaway).catch(async (e) => {
                const cur = await structures_1.Database.get(id).catch(() => null);
                if (cur && !cur.hasEnded)
                    this.schedule(cur);
                throw e;
            });
            await this.updateMessage(giveaway);
            this.emit("giveawayCancel", giveaway.clone());
            return giveaway;
        });
    }
    /**
     * Rerolls an ended giveaway.
     * @param id The id of the giveaway to reroll.
     * @param unique Whether everyone who already won is excluded.
     * @param amount The amount of new winners (defaults to the winners count).
     */
    async reroll(id, unique = false, amount) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = (await structures_1.Database.get(id))?.clone();
            if (!giveaway || !giveaway.hasEnded || giveaway.cancelled || !giveaway.entries.length)
                return null;
            const oldGiveaway = giveaway.clone();
            const count = Math.floor(amount ?? giveaway.winnersCount);
            if (!(count >= 1))
                return null;
            const previous = [...new Set([...giveaway.previousWinners ?? [], ...giveaway.winners])];
            const newWinners = await this.drawWinners(giveaway, count, unique ? new Set(previous) : undefined);
            if (!newWinners.length)
                return null;
            giveaway.previousWinners = previous;
            giveaway.winners = newWinners;
            giveaway.announcePending = "reroll";
            await this.save(giveaway);
            await this.#publish(giveaway, "reroll", newWinners, oldGiveaway);
            return giveaway;
        });
    }
    /**
     * Edits a running giveaway.
     * @param id The id of the giveaway to edit.
     * @param options The options used to edit this giveaway.
     */
    async edit(id, options) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = (await structures_1.Database.get(id))?.clone();
            if (!giveaway || giveaway.hasEnded)
                return null;
            validate(options);
            const oldGiveaway = giveaway.clone();
            if (options.prize?.trim())
                giveaway.prize = options.prize.trim();
            if (options.winnersCount != null && Math.floor(options.winnersCount) >= 1)
                giveaway.winnersCount = Math.floor(options.winnersCount);
            if (options.hostID)
                giveaway.hostID = options.hostID;
            // Builder functions are additive, so merge instead of replacing:
            // "$setMinimumAccountAge[7d] $editGiveaway[...]" must not drop the required roles.
            if (options.requirements && Object.keys(options.requirements).length)
                giveaway.requirements = { ...giveaway.requirements, ...options.requirements };
            if (options.bonusEntries?.length)
                giveaway.bonusEntries = options.bonusEntries;
            if (options.maxEntries !== undefined)
                giveaway.maxEntries = options.maxEntries && options.maxEntries >= 1 ? Math.floor(options.maxEntries) : null;
            if (options.display && Object.keys(options.display).length)
                giveaway.display = { ...giveaway.display, ...options.display };
            await this.save(giveaway);
            await this.updateMessage(giveaway);
            this.emit("giveawayEdit", oldGiveaway, giveaway.clone());
            return giveaway;
        });
    }
    /**
     * Adds (or with a negative value removes) time from a running giveaway.
     * Shortening never moves the end before "now"; the giveaway then ends immediately.
     */
    async extend(id, ms) {
        await this.#awaitReady();
        if (!Number.isFinite(ms) || ms === 0)
            return null;
        return this.#lock.run(id, async () => {
            const giveaway = (await structures_1.Database.get(id))?.clone();
            if (!giveaway || giveaway.hasEnded)
                return null;
            const oldGiveaway = giveaway.clone();
            const floor = (giveaway.pausedAt ?? Date.now()) - giveaway.timestamp;
            const next = Math.max(giveaway.duration + Math.trunc(ms), floor);
            if (!Number.isSafeInteger(giveaway.timestamp + next))
                return null;
            giveaway.duration = next;
            await this.save(giveaway);
            this.schedule(giveaway);
            await this.updateMessage(giveaway);
            this.emit("giveawayEdit", oldGiveaway, giveaway.clone());
            return giveaway;
        });
    }
    /** Pauses a running giveaway: the timer stops and nobody can join or leave. */
    async pause(id) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = (await structures_1.Database.get(id))?.clone();
            if (!giveaway || giveaway.hasEnded || giveaway.isPaused())
                return null;
            giveaway.pausedAt = Date.now();
            this.scheduler.cancel(id);
            await this.save(giveaway);
            await this.updateMessage(giveaway);
            this.emit("giveawayPause", giveaway.clone());
            return giveaway;
        });
    }
    /** Resumes a paused giveaway with the time it had left. */
    async resume(id) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = (await structures_1.Database.get(id))?.clone();
            if (!giveaway || !giveaway.isPaused())
                return null;
            giveaway.duration += Date.now() - giveaway.pausedAt;
            giveaway.pausedAt = null;
            await this.save(giveaway);
            this.schedule(giveaway);
            await this.updateMessage(giveaway);
            this.emit("giveawayResume", giveaway.clone());
            return giveaway;
        });
    }
    // ----------------------------------------------------------------------
    // Entries
    // ----------------------------------------------------------------------
    /**
     * Toggles a member's entry: joins if not entered, leaves otherwise.
     * Used by the button handler.
     */
    async toggleEntry(id, member, source, user) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = await structures_1.Database.get(id);
            if (!giveaway)
                return null;
            const userID = member.user.id;
            if (!giveaway.hasEnded && !giveaway.isPaused() && giveaway.hasEntered(userID)) {
                const old = this.wants("giveawayEntryRemove") ? giveaway.clone() : null;
                giveaway.removeEntry(userID);
                await this.queueFlush(giveaway);
                this.queueRefresh(giveaway);
                if (old)
                    this.emit("giveawayEntryRemove", old, giveaway.clone(), source, user);
                return { action: "removed", giveaway };
            }
            return this.#add(giveaway, member, source, user);
        });
    }
    /** Adds a member's entry (used by reactions). */
    async join(id, member, source, user) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = await structures_1.Database.get(id);
            if (!giveaway)
                return null;
            if (giveaway.hasEntered(member.id))
                return { action: "added", giveaway };
            return this.#add(giveaway, member, source, user);
        });
    }
    async #add(giveaway, member, source, user) {
        const reason = giveaway.denyReason(member, true);
        if (reason) {
            if (this.wants("giveawayEntryRevoke"))
                this.emit("giveawayEntryRevoke", giveaway.clone(), source, user, reason);
            return { action: "denied", reason, giveaway };
        }
        const old = this.wants("giveawayEntryAdd") ? giveaway.clone() : null;
        giveaway.addEntry(member.user.id, giveaway.computeWeight(member));
        await this.queueFlush(giveaway);
        this.queueRefresh(giveaway);
        if (old)
            this.emit("giveawayEntryAdd", old, giveaway.clone(), source, user);
        return { action: "added", giveaway };
    }
    /**
     * Removes an entry. Returns the giveaway, or null if it was not entered/active.
     * @param force Also remove entries while paused. Entries of an ended
     * giveaway are never changed: they are the record the winners were drawn
     * from (removing one used to leave a winner who "never entered").
     */
    async leave(id, userID, source, user, force = false) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = await structures_1.Database.get(id);
            if (!giveaway || giveaway.hasEnded || (!force && !giveaway.isActive()) || !giveaway.hasEntered(userID))
                return null;
            const old = source && user && this.wants("giveawayEntryRemove") ? giveaway.clone() : null;
            giveaway.removeEntry(userID);
            await (force ? this.save(giveaway) : this.queueFlush(giveaway));
            this.queueRefresh(giveaway);
            if (old)
                this.emit("giveawayEntryRemove", old, giveaway.clone(), source, user);
            return giveaway;
        });
    }
    /**
     * Adds an entry on someone's behalf.
     * @param bypassRequirements Skip requirement checks (still respects ended state).
     */
    async addEntry(id, userID, bypassRequirements = false) {
        await this.#awaitReady();
        return this.#lock.run(id, async () => {
            const giveaway = await structures_1.Database.get(id);
            if (!giveaway || giveaway.hasEnded || giveaway.hasEntered(userID))
                return null;
            const guild = await this.getGuild(giveaway.guildID);
            const member = await guild?.members.fetch(userID).catch(() => null);
            if (!member && !bypassRequirements)
                return null;
            if (member && !bypassRequirements && giveaway.requirementDenyReason(member, true))
                return null;
            giveaway.addEntry(userID, member ? giveaway.computeWeight(member) : 1);
            await this.save(giveaway);
            this.queueRefresh(giveaway);
            return giveaway;
        });
    }
    // ----------------------------------------------------------------------
    // Winners
    // ----------------------------------------------------------------------
    /**
     * Draws up to `count` winners. Candidates are put in a random order
     * (weighted by bonus entries) using a cryptographically secure RNG and then
     * checked one by one, so only as many members are fetched as needed instead
     * of every entrant, and people who left the server or no longer meet the
     * requirements are skipped.
     */
    async drawWinners(g, count, exclude) {
        const pool = exclude ? g.entries.filter((e) => !exclude.has(e)) : [...g.entries];
        if (!pool.length || count < 1)
            return [];
        const guild = await this.getGuild(g.guildID);
        if (!guild)
            return [];
        const weighted = !!g.bonusEntries?.length || !!(g.entryWeights && Object.keys(g.entryWeights).length);
        // Members fetched so far (null = left the server), and ticket counts
        // corrected from their live roles.
        const fetched = new Map();
        const corrected = new Map();
        const weightOf = (id) => {
            const fixed = corrected.get(id);
            if (fixed !== undefined)
                return fixed;
            const m = guild.members.cache.get(id);
            return m ? g.computeWeight(m) : g.weightOf(id);
        };
        // Anti-abuse: uncached members are ordered by the ticket count saved
        // when they joined. If a drawn member's live roles give a different
        // count (e.g. a bonus role held only while joining), the draw is
        // redone with the corrected count. Each restart fixes at least one
        // member and reuses everything already fetched.
        for (let attempt = 0;; attempt++) {
            const order = weighted ? (0, utils_1.weightedOrder)(pool, weightOf) : (0, utils_1.shuffle)(pool);
            const winners = [];
            let restart = false;
            let i = 0;
            while (winners.length < count && i < order.length && !restart) {
                const need = count - winners.length;
                const batch = order.slice(i, i + Math.min(100, Math.max(need * 2, 10)));
                i += batch.length;
                const missing = batch.filter((id) => !fetched.has(id));
                if (missing.length) {
                    const got = await this.fetchMembers(guild, missing);
                    for (const id of missing)
                        fetched.set(id, got.get(id) ?? null);
                }
                for (const id of batch) {
                    const m = fetched.get(id);
                    if (!m || g.requirementDenyReason(m) !== null)
                        continue;
                    if (weighted && attempt < 50 && !corrected.has(id)) {
                        const used = weightOf(id);
                        const live = g.computeWeight(m);
                        corrected.set(id, live);
                        if (live !== used) {
                            restart = true;
                            break;
                        }
                    }
                    winners.push(id);
                    if (winners.length === count)
                        break;
                }
            }
            if (!restart)
                return winners;
        }
    }
    async fetchMembers(guild, ids) {
        const found = new Map();
        const missing = [];
        for (const id of ids) {
            const m = guild.members.cache.get(id);
            if (m)
                found.set(id, m);
            else
                missing.push(id);
        }
        if (!missing.length)
            return found;
        const fetched = await guild.members.fetch({ user: missing, time: 15_000 }).catch(() => null);
        if (fetched) {
            for (const [id, m] of fetched)
                found.set(id, m);
        }
        else {
            // Gateway member requests can time out; fall back to REST.
            const results = await Promise.allSettled(missing.map((id) => guild.members.fetch(id)));
            for (const r of results)
                if (r.status === "fulfilled")
                    found.set(r.value.id, r.value);
        }
        return found;
    }
    async announce(g, msg, winners, kind) {
        const chan = msg ? msg.channel : await this.getChannel(g.channelID);
        if (!chan || !("send" in chan))
            return;
        const m = this.messages;
        const s = winners.length === 1 ? "" : "s";
        if (!winners.length) {
            await (msg
                ? msg.reply({ content: (0, messages_1.format)(m.noWinners, { prize: shortPrize(g) }), allowedMentions: { parse: [], repliedUser: false } })
                : chan.send({ content: (0, messages_1.format)(m.noWinners, { prize: shortPrize(g) }), allowedMentions: { parse: [] } })).catch(noop_1.default);
            return;
        }
        const head = (0, messages_1.format)(kind === "winners" ? m.winners : m.reroll, { prize: shortPrize(g), s, mentions: "" });
        const room = Math.max(200, MAX_MESSAGE - head.length - 10);
        const groups = (0, utils_1.chunk)(winners, 90);
        let first = true;
        for (const group of groups) {
            for (const part of (0, utils_1.chunkJoin)(group.map((id) => `<@${id}>`), ", ", room)) {
                const users = part.match(/\d{17,20}/g) ?? [];
                const content = (0, messages_1.format)(first ? (kind === "winners" ? m.winners : m.reroll) : m.winnersContinued, { prize: shortPrize(g), s, mentions: part });
                const payload = { content: content.slice(0, MAX_MESSAGE), allowedMentions: { parse: [], users, repliedUser: false } };
                await (first && msg ? msg.reply(payload) : chan.send(payload)).catch(noop_1.default);
                first = false;
            }
        }
    }
    async dmWinners(g, winners) {
        const guild = this.client.guilds.cache.get(g.guildID);
        const link = g.messageID ? `https://discord.com/channels/${g.guildID}/${g.channelID}/${g.messageID}` : "";
        const content = (0, messages_1.format)(this.messages.winnerDM, { prize: shortPrize(g), guild: guild?.name ?? "the server", link }).slice(0, MAX_MESSAGE);
        for (const id of winners) {
            const user = await this.client.users.fetch(id).catch(() => null);
            await user?.send({ content, allowedMentions: { parse: [] } }).catch(() => { });
        }
    }
    // ----------------------------------------------------------------------
    // Start-up and maintenance
    // ----------------------------------------------------------------------
    /**
     * @internal Recovers after a (re)start. Runs once, when both the database
     * and the gateway are ready:
     * 1. announces results that were drawn but never announced (crash mid-end),
     * 2. re-arms every active giveaway; ones that ended during downtime are
     *    processed right away, one by one,
     * 3. in the background: posts messages that were never sent (crash
     *    mid-start), refreshes the others (live entry count went stale while
     *    offline) and, in reaction mode, counts reactions made while offline.
     */
    _restore() {
        return (this.#restoring ??= this.#doRestore());
    }
    #restoring = null;
    async #doRestore() {
        const pending = await structures_1.Database.findPendingAnnouncements().catch((e) => { (0, noop_1.default)(e); return []; });
        for (const g of pending) {
            await this.#lock.run(g.id, async () => {
                const cur = await structures_1.Database.get(g.id);
                if (cur?.announcePending)
                    await this.#publish(cur, cur.announcePending);
            }).catch(noop_1.default);
        }
        const active = structures_1.Database.activeGiveaways();
        for (const g of active)
            this.schedule(g);
        const overdue = active.filter((g) => !g.isPaused() && g.endTimestamp() <= Date.now()).length;
        forgescript_1.Logger.info(`[ReForgeGiveaways] Restored ${active.length} active giveaway(s)` +
            (overdue ? `, ${overdue} ended while offline and will be drawn now` : "") +
            (pending.length ? `, re-announced ${pending.length} result(s)` : ""));
        this.#repairChain = this.#repairMessages(active.filter((g) => g.isPaused() || g.endTimestamp() > Date.now())).catch(noop_1.default);
        const keep = this.giveaways.options.deleteEndedAfter;
        if (keep && keep > 0) {
            await this.sweep(keep).catch(noop_1.default);
            this.#sweepTimer = setInterval(() => this.sweep(keep).catch(noop_1.default), Math.min(keep, 6 * 36e5));
            this.#sweepTimer.unref?.();
        }
    }
    #repairChain = Promise.resolve();
    /** @internal Resolves when the background message repair after a restart is done. */
    _whenRepaired() {
        return this.#repairChain;
    }
    async #repairMessages(giveaways) {
        const { useDefault, useReactions } = this.giveaways.options;
        for (const g of giveaways) {
            await this.#lock.run(g.id, async () => {
                const cur = await structures_1.Database.get(g.id);
                if (!cur || cur.hasEnded)
                    return;
                if (useDefault && !cur.messageID) {
                    if (await this.postMessage(cur))
                        forgescript_1.Logger.info(`[ReForgeGiveaways] Posted the missing message of giveaway ${cur.id}`);
                    else
                        (0, error_1.throwGiveawaysError)(error_1.GiveawaysErrorType.MessageNotDetermined, cur.id);
                    return;
                }
                if (useReactions)
                    await this.#syncReactions(cur);
                if (useDefault)
                    await this.updateMessage(cur);
            }).catch(noop_1.default);
            await sleep(250); // stay well clear of rate limits on large restores
        }
    }
    /**
     * Makes the entries match the reactions on the giveaway message: adds
     * eligible people who reacted while the bot was offline (and removes the
     * reaction of those who don't qualify) and drops entries whose reaction is
     * gone. Call inside the giveaway's lock.
     */
    async #syncReactions(g) {
        const msg = await this.fetchMessage(g.channelID, g.messageID);
        const reaction = msg?.reactions.cache.find((r) => (0, utils_1.emojiMatches)(r.emoji, this.giveaways.options.emoji));
        // No message or no reaction at all is more likely a permission problem
        // than everybody leaving; don't wipe entries on that.
        if (!reaction)
            return;
        const reactors = new Set();
        let after;
        for (;;) {
            const page = await reaction.users.fetch({ limit: 100, after });
            for (const [id, user] of page)
                if (!user.bot)
                    reactors.add(id);
            if (page.size < 100)
                break;
            after = page.lastKey();
        }
        let changed = false;
        for (const id of [...g.entries]) {
            if (!reactors.has(id)) {
                g.removeEntry(id);
                changed = true;
            }
        }
        const newcomers = [...reactors].filter((id) => !g.hasEntered(id));
        if (newcomers.length) {
            const guild = await this.getGuild(g.guildID);
            if (guild) {
                for (const batch of (0, utils_1.chunk)(newcomers, 100)) {
                    const members = await this.fetchMembers(guild, batch);
                    for (const id of batch) {
                        const m = members.get(id);
                        if (m && !g.requirementDenyReason(m, true)) {
                            g.addEntry(id, g.computeWeight(m));
                            changed = true;
                        }
                        else {
                            reaction.users.remove(id).catch(noop_1.default);
                        }
                    }
                }
            }
        }
        if (changed)
            await this.save(g);
    }
    /** Deletes giveaways that ended more than `olderThan` ms ago. Returns how many. */
    async sweep(olderThan) {
        const cutoff = Date.now() - olderThan;
        const ended = await structures_1.Database.find({ hasEnded: true });
        const stale = ended.filter((g) => (g.endedAt ?? g.endTimestamp()) < cutoff).map((g) => g.id);
        return structures_1.Database.deleteMany(stale);
    }
    /** Stops all timers and writes pending changes. */
    async destroy() {
        this.scheduler.clear();
        if (this.#sweepTimer)
            clearInterval(this.#sweepTimer);
        for (const t of this.#refreshTimers.values())
            clearTimeout(t);
        this.#refreshTimers.clear();
        await this.flushAll();
    }
}
exports.GiveawaysManager = GiveawaysManager;
//# sourceMappingURL=GiveawaysManager.js.map