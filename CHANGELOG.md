# Changelog

## 2.3.0 (November 2026)

Tag [`v2.3.0`](https://github.com/Demonic1594/ReForgeGiveaways/releases/tag/v2.3.0) · [all changes since 2.2.1](https://github.com/Demonic1594/ReForgeGiveaways/compare/v2.2.1...v2.3.0) · [upgrade notes](README.md#from-221-to-230)

Works with [ReForgeDB](https://github.com/Demonic1594/ReForgeDB) as well as ForgeDB. No database changes; install over 2.2.1.

### Added
- ReForgeDB support. Giveaways use whichever of ReForgeDB and ForgeDB the bot loaded, ReForgeDB when both are (with a warning to keep only one, since both add the same functions). Before, the extension required one named `forge.db` and refused to start with ReForgeDB.
- `TransformEvents`, `resolveDatabaseManager`, `loadedDatabaseExtensions` and `DATABASE_EXTENSIONS` are exported.

### Changed
- ReForgeGiveaways no longer imports a database package. It takes the `DataBaseManager` class from the extension the bot loaded (`client.db`, or the package's exports when both are loaded), so it always shares that extension's connection settings and TypeORM copy.
- `@tryforge/forge.db` and `@tryforge/reforge.db` are optional peer dependencies. Before, npm installed the original ForgeDB into every bot because it was a required peer, even bots using ReForgeDB.
- The database extension can come before or after ReForgeGiveaways in the extension list. With neither one loaded, the client refuses to start with a message naming both, as `requireExtensions` did before.
- `GiveawaysDatabaseManager` is deprecated and no longer used. It still extends the `DataBaseManager` of the installed package (ReForgeDB first).

### Tests
- The suite runs on ReForgeDB by default and on ForgeDB with `GIVEAWAYS_TEST_DB_EXTENSION=forge.db`; CI runs both, on SQLite and PostgreSQL.
- New `test/database-extension.test.js`: no database extension, each one before giveaways, and both loaded in either order.
- Test processes no longer depend on a timer ForgeDB left running for 10 s at start-up to stay alive.

## 2.2.1 (November 2026)

Tag [`v2.2.1`](https://github.com/Demonic1594/ReForgeGiveaways/releases/tag/v2.2.1) · [all changes since 2.2.0](https://github.com/Demonic1594/ReForgeGiveaways/compare/v2.2.0...v2.2.1)

A bug-fix release. No database changes; install over 2.2.0.

### Fixed
- `$setGiveawayImage` and `$setGiveawayThumbnail` did not refuse bad links, despite 2.2.0. Their argument had ForgeScript's `URL` type, which turns anything that is not an `https` link into a Discord emoji link (`https://cdn.discordapp.com/emojis/undefined.png...`) before the function runs, so the 2.2.0 check never saw it: an `ftp://` or `javascript:` link was stored as a broken image. They now take the link as text and refuse anything but an http(s) link of at most 2048 characters. Found while documenting the extension for the BotForge knowledge base.

## 2.2.0 (November 2026)

Tag [`v2.2.0`](https://github.com/Demonic1594/ReForgeGiveaways/releases/tag/v2.2.0) · [all changes since 2.1.0](https://github.com/Demonic1594/ReForgeGiveaways/compare/v2.1.0...v2.2.0) · [upgrade notes](README.md#from-210-to-220)

A hardening release: closes the remaining ways to act on another server, throttles reaction spam, and rejects inputs that used to break giveaway messages later. No database changes.

### Security
- `$startGiveaway` refuses to post in a channel of another server than the one the command runs in.
- `$wipeGiveaways` without a guild argument wiped the giveaways of every server, even from a command in one server. It now wipes the current server only; everything is wiped only outside any server (e.g. the `ready` event), and never from a direct message without a guild argument.
- Reacting and unreacting in a loop had no cooldown (only the button did), so one member could flood entry events and member lookups. `entryCooldown` now applies to reaction joins too.
- Clicks on a deleted giveaway's message logged an error each time; anyone could flood the log. Each message is reported once.

### Fixed
- Role arguments (`$addRequiredRoles`, `$addRestrictedRoles`, `$addBonusEntries`, `$setGiveawayPingRole`) accepted user and channel mentions and stored them as roles, creating requirements nobody could meet. Only role IDs and role mentions are accepted now.
- `$setGiveawayImage` and `$setGiveawayThumbnail` accepted links Discord refuses (any non-http(s) link, or longer than 2048 characters), which made the giveaway message fail and the giveaway be dropped.
- A translated title or field name longer than Discord allows made every giveaway message fail. Texts are cut to the embed limits.
- An invalid color in `colors` failed on every giveaway; it now fails at start-up with a clear message.
- Dependencies: updated `minimatch` (used by TypeORM) to a version without the known ReDoS issues. The remaining `glob` advisory in TypeORM 0.3 only affects file-pattern loading, which this extension doesn't use.

### Tests
- The fuzzer is reproducible: operations and injected failures use separate random streams, so a seed replays the same way on any database. It keeps six giveaways running and now makes about 800 writes per seed, about 120 of them failing (before: as few as 7 failures).
- New `test/hardening.test.js`; CI runs it against PostgreSQL too.

## 2.1.0 (November 2026)

Tag [`v2.1.0`](https://github.com/Demonic1594/ReForgeGiveaways/releases/tag/v2.1.0) · [all changes since 2.0.0](https://github.com/Demonic1594/ReForgeGiveaways/compare/e07ec8f...v2.1.0) · [upgrade notes](README.md#from-200-to-210)

A full review of 2.0.0 against the original. The fixes below have tests that fail on 2.0.0, except the shutdown timeout and the commit script.

### Fixed
- **A giveaway could lose its timer.** Pausing cancelled the end timer before saving; if that write failed, the giveaway kept running but nothing would ever end it until the next restart. Pause, cancel and end now only touch timers after the write succeeded.
- **Retry storm while the database is down.** An overdue giveaway whose end could not be saved was retried immediately, over and over (more than 1,000 failing draws and error logs per second). It is now retried once a minute.
- **"No winners" after a network error.** If members could not be fetched during the draw, every entrant looked like they had left the server and the giveaway ended without winners. A failed lookup now fails the draw, which is retried; only a real "not a member" answer skips someone. A day past the deadline the giveaway still ends with whoever can be reached.
- **Entries lost after a failed write.** `$addGiveawayEntry`, `$removeGiveawayEntry` and failed pause/cancel/edit writes dropped the pending entry write without retrying it. A failed write is now always retried in the background.
- **Requirements leaking into a started giveaway.** `$startGiveaway` stored the same object the builder functions keep writing to, so `$addRequiredRoles` used later in the same command silently changed the giveaway that had already started. Options are copied now.
- **Crash on a misconfigured start event.** With `useDefault: false` and no (or more than one) `giveawayStart` command, the event listener threw an unhandled rejection, which ends the Node process. Event listeners can no longer crash the bot.
- **`$startGiveaway` reported success for a giveaway that was discarded.** With custom messages it returned the ID before the start event had run. It now waits and returns nothing when no message could be attached.
- **Clicks without an answer in custom mode.** With `useDefault: false`, a click that no event answered (ended, paused, unknown, cooldown, or an entry event you don't listen to) showed "This interaction failed". Those clicks now get the built-in reply; ended and paused clicks reach `giveawayEntryRevoke` with the reason.
- **Manual entries vanished in reaction mode.** Entries added with `$addGiveawayEntry` have no reaction, so the reaction sync removed them before the draw.
- **Orphaned giveaway message.** If saving the message ID failed right after posting, the message stayed and a second one was posted on restart. The message is taken back.
- A crash before a custom `giveawayStart` event sent its message left a giveaway nobody could enter; the event now runs again on restart.
- The result card cut the winner list in the middle of a mention when there were many winners; it now ends on a whole mention with "and N more".
- The cooldown list was scanned on every click once it held 10,000 members, which made a mass join slow (8 s for 40,000 clicks, now 0.7 s).
- Cleaning up old giveaways (`deleteEndedAfter`) loaded every ended giveaway with all its entries each time, could run every few milliseconds for small values, and could delete a result that still had to be announced.
- `messages: { joined: undefined }` blanked the text instead of keeping the default.
- The shutdown handler could keep the process from stopping if the database hung; it gives up after 5 s.

### Security
- **Guild scoping could be bypassed from direct messages.** A context without a guild was treated as unrestricted, which was meant for giveaway events but also covered DMs: a command usable in DMs could end, edit or delete any server's giveaway by ID. Management functions now refuse to act from a DM unless the guild argument is given.
- `npm run commit` passed the commit message through a shell; a message with quotes or `$(...)` could run commands. It now calls git directly.

### Added
- `$rerollGiveawayWinner[id;user;guild?]` (alias `$replaceGiveawayWinner`): replace one winner and keep the others.
- `$clearGiveawayRequirements` and `$clearBonusEntries`, so `$editGiveaway` can remove requirements and bonuses, not only add them.
- Every text of the giveaway embed is in `messages` (`embedPrize`, `embedWinnersCount`, `fieldEnds`, ...), so the default messages can be fully translated.
- Properties `pausedAt`, `color`, `image`, `thumbnail`, `pingRoleID` for `$getGiveaway`, `$newGiveaway` and `$oldGiveaway`; `url` in the JSON output.
- Sharding support: with several processes, each one only handles the giveaways of its own guilds.
- `$getGuildGiveaways` and `$getAllGiveaways` include entries that are still waiting to be written.
- Validation: a giveaway must end before the year 10000; negative age requirements and unknown role modes are rejected.
- Tested against PostgreSQL 16 (previously SQLite only), including an upgrade of a 2.0.0 database; a test upgrades a real ForgeGiveaways 1.1.0 SQLite database.
- CI workflow that builds, tests and checks that the committed `dist/` and `metadata/` are up to date.

### Notes
- A new nullable column `manualEntries` is added on first start. No existing column changes.
- `manager.end()` now rejects when members can't be looked up instead of resolving with no winners; `$endGiveaway` returns `false` in that case.

## 2.0.0 (ReForgeGiveaways, November 2026)

Commit [`e07ec8f`](https://github.com/Demonic1594/ReForgeGiveaways/commit/e07ec8f) (released before tags were used).

Forked from [tryforge/ForgeGiveaways](https://github.com/tryforge/ForgeGiveaways) 1.1.0 (commit `586fb15`). The fork is a modified version of that program, under the same GPL-3.0 license.

### Fixed
- **Durations over ~24.8 days ended immediately.** Node turns any `setTimeout` delay above 2^31 - 1 ms into 1 ms. Replaced the per-giveaway timeouts with one scheduler that re-arms in safe steps; there is no maximum duration now.
- Times were stored as 32-bit `INTEGER` on Postgres and MySQL, which overflows for millisecond timestamps. Now `BIGINT`.
- MySQL stored entries in `TEXT` (64 KB, roughly 3,400 entries). Now `LONGTEXT`.
- Winners were only picked from members in the bot's cache, so without the `GuildMembers` intent giveaways often had no winners.
- Concurrent clicks could overwrite each other's entries; a timer racing `$endGiveaway` could announce winners twice.
- A giveaway whose message was deleted never ended and was retried on every restart.
- `oldGiveaway` in events lost all methods (`structuredClone` of a class instance).
- The reaction handler fired `giveawayEntryRemove` when it removed the reaction of somebody who never entered.
- Reroll ignored requirements, refused giveaways that ended without winners, and a unique reroll silently fell back to previous winners.
- Biased shuffle (`sort(() => Math.random() - 0.5)`) replaced by Fisher-Yates with `crypto.randomInt`.
- A prize containing `@everyone` pinged everyone.
- Clicks on ended or unknown giveaways showed "This interaction failed".
- Timers were not restored if the database connected after the bot became ready.
- `$getAllGiveaways`, `$newGiveaway` and `$oldGiveaway` required a property although they can return JSON.
- Requirement checks now report the real reason before "entries full".

### Downtime and crash recovery
- Ended-while-offline giveaways are drawn on restart one at a time; the result shows the scheduled end time.
- Results are written with an "announcement pending" marker and announced (and `giveawayEnd` fired) on the next start if the bot died in between, exactly once.
- A new giveaway is saved before its message is posted; a missing message is posted on restart.
- Reaction mode re-counts reactions on restart and before each draw.
- Stale giveaway messages are refreshed on restart.
- Deadlines during a guild outage or while disconnected are retried every minute (up to a day) instead of ending with no winners; a removed bot ends them right away.
- A failed database write while ending leaves memory and database consistent and re-arms the timer; life cycle changes are copy-on-write.
- The scheduler re-checks the wall clock every 30 s (host sleep, clock jumps).
- Database connection is retried with backoff at boot; calls time out after 30 s instead of hanging.
- Slow clicks are deferred within Discord's 3 s limit.

### Abuse resistance (found by adversarial testing)
- **Quadratic join cost:** every join rebuilt the entry index, so 20,000 joins took ~11 s of blocked event loop (a mass-join raid could freeze the bot). Joins are O(1) now; 1,000,000 joins take ~0.3 s.
- **Ended giveaway brought back to life:** an entry write queued before an end and run after it could overwrite the ended state with "running". Background writes now always save the current state; a test reproduces the exact interleaving and fails on the old code.
- **Winner who never entered:** `$removeGiveawayEntry` on an ended giveaway removed a winner's entry. Entries of ended giveaways are now read-only (found by the fuzzer).
- **Bonus role held only while joining:** the joined-with ticket count was used for uncached members. The draw now re-checks picked members' live roles and redraws with corrected counts (cheater's odds verified to drop from ~99% to a fair 50%).
- Failed background entry writes are retried instead of being lost until the next change.
- Bots can never enter or win; the host can be excluded.
- Per-member join/leave cooldown.
- Caps on prize length, winners, entry cap and bonus amounts; long prizes are shortened inside chat messages so winner mentions always fit.
- Event snapshots are built only when something listens, and cloning is ~10x faster (13 ms instead of 132 ms at 1,000,000 entries).
- Reaction emoji match with or without the U+FE0F variation selector.

### Security
- Management functions (`$editGiveaway`, `$endGiveaway`, `$rerollGiveaway`, `$cancelGiveaway`, `$pauseGiveaway`, `$resumeGiveaway`, `$extendGiveaway`, `$shortenGiveaway`, `$addGiveawayEntry`, `$removeGiveawayEntry`, `$deleteGiveaway`) only act on giveaways of the given guild, or the current guild when none is given. `$editGiveaway`'s existing guild argument must now match.
- Validation for winners, duration, prize and role IDs.
- Default messages use explicit `allowedMentions`.

### Performance
- Active giveaways cached in memory; no database read per click.
- Entry writes coalesced (`entryFlushDelay`, default 1 s).
- Live entry counter refresh is debounced (`messageUpdateDelay`, default 5 s).
- Winner draw fetches only as many members as needed.
- Indexes on `messageID` and `(guildID, hasEnded)`.

### Added
- `$pauseGiveaway`, `$resumeGiveaway`, `$extendGiveaway`, `$shortenGiveaway`, `$cancelGiveaway`
- `$addGiveawayEntry`, `$removeGiveawayEntry`, `$getGuildGiveaways`
- Requirements: `$setRequiredRolesMode`, `$setMinimumAccountAge`, `$setMinimumMemberAge`, `$setMaxEntries`
- Bonus entries: `$addBonusEntries` (weighted draw)
- Display: `$setGiveawayDescription`, `$setGiveawayColor`, `$setGiveawayImage`, `$setGiveawayThumbnail`, `$setGiveawayPingRole`
- Info button (`showInfoButton`): private status, tickets, win chance and deny reason for the clicker
- `$excludeGiveawayHost`, `$giveawayWinChance`, `$giveawayIsWinner`, `$giveawayURL`; deny reasons `bot` and `host`; options `showInfoButton`, `entryCooldown`
- Getters: `$giveawayEndTimestamp`, `$giveawayTimeLeft`, `$giveawayIsPaused`, `$giveawayIsCancelled`, `$giveawayEndedAt`, `$giveawayEntriesCount`, `$giveawayTotalTickets`, `$giveawayMaxEntries`, `$giveawayDescription`, `$giveawayMinAccountAge`, `$giveawayMinMemberAge`, `$giveawayRequiredRolesMode`, `$giveawayBonusEntries`, `$giveawayHasEntered`, `$giveawayEntryWeight`, `$giveawayDenyReason`, plus matching properties for `$getGiveaway`
- `$wipeGiveaways[guild]` wipes one guild only
- Events: `giveawayCancel`, `giveawayPause`, `giveawayResume`; `giveawayEntryRevoke` carries the reason
- Options: `emoji`, `buttonLabel`, `buttonStyle`, `showEntryCount`, `dmWinners`, `colors`, `messages`, `entryFlushDelay`, `messageUpdateDelay`, `deleteEndedAfter`, `handleSignals`
- A deadline reached while the bot is disconnected is retried a minute later instead of ending with no winners
- Test suite (`npm test`): scheduler, locking, draw fairness, requirements, and end-to-end runs on SQLite including a restart

### Changed
- Renamed to **ReForgeGiveaways**: package `@tryforge/reforge.giveaways`, class `ReForgeGiveaways` (`ForgeGiveaways` is no longer exported), extension name `reforge.giveaways`, options type `IReForgeGiveawaysOptions`, log prefix `[ReForgeGiveaways]`.
- Persistence uses TypeORM `EntitySchema` per driver instead of decorators; table names and stored formats are unchanged, so existing databases upgrade in place.
- `@tryforge/forgescript`, `@tryforge/forge.db` and `discord.js` are peer dependencies.
- The generated typedoc HTML (`docs/`) is no longer committed; run `npm run docs`.

## 1.1.0 and earlier

See [metadata/changelogs.json](metadata/changelogs.json) and the upstream repository.
