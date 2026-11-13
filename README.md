<div align="center">

<img height="150" width="150" src="https://raw.githubusercontent.com/Demonic1594/ReForgeGiveaways/main/assets/ReForgeGiveaways.png" alt="ReForgeGiveaways">

# ReForgeGiveaways
ReForgeGiveaways is a reworked, hardened and feature-rich giveaway extension for ForgeScript. Run giveaways of any length, survive restarts and crashes, keep cheaters out, and customize every message.

<a href="https://github.com/Demonic1594/ReForgeGiveaways/"><img src="https://img.shields.io/github/package-json/v/Demonic1594/ReForgeGiveaways/main?label=@tryforge/reforge.giveaways&color=5c16d4" alt="@tryforge/reforge.giveaways"></a>
<a href="https://github.com/tryforge/ForgeScript/"><img src="https://img.shields.io/github/package-json/v/tryforge/ForgeScript/main?label=@tryforge/forgescript&color=5c16d4" alt="@tryforge/forgescript"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-5c16d4" alt="License: GPL-3.0"></a>

</div>

---

## Contents

1. [Why ReForgeGiveaways](#why-reforgegiveaways)
2. [Installation](#installation)
3. [Options](#options)
4. [Starting Giveaways](#starting-giveaways)
5. [Functions](#functions)
6. [Custom Messages](#custom-messages)
7. [Handling Interactions](#handling-interactions)
8. [Events](#events)
9. [Downtime, Restarts and Crashes](#downtime-restarts-and-crashes)
10. [Abuse Protection](#abuse-protection)
11. [Switching from ForgeGiveaways](#switching-from-forgegiveaways)
12. [Upgrading](#upgrading)
13. [Notes and Limits](#notes-and-limits)
14. [Development](#development)
15. [Credits and License](#credits-and-license)

<h3 align="center">Why ReForgeGiveaways</h3><hr>

- ⏳ **No duration limit.** Run a giveaway for a month, a year or longer. The original ended anything over ~24.8 days right after it started.
- 🛡️ **Survives downtime.** Restarts, crashes at any point, Discord outages, database hiccups and host sleep are all recovered from.
- 🚫 **Abuse protection.** Join/leave spam cooldown, requirement and bonus-role re-checks at the draw, no bots, optional host exclusion, no mass pings.
- 🎲 **Fair draws.** Cryptographically secure, unbiased and tested statistically, with weighted draws for bonus entries.
- ⚡ **Fast at any size.** 100,000 entrants join, draw and save in well under a second.
- ✨ **Feature rich.** Pause and resume, extend and shorten, cancel, bonus entries, entry caps, account and member age requirements, replacing a single winner, an info button with win chances, winner DMs, live entry counter, and every text translatable.

<details>
<summary><b>Everything fixed compared to ForgeGiveaways 1.1.0</b></summary>

- Durations over ~24.8 days ended immediately (Node timer overflow).
- Times overflowed 32-bit `INTEGER` columns on Postgres and MySQL; MySQL entries were capped at 64 KB.
- Winners were drawn only from cached members, so without the `GuildMembers` intent giveaways often had no winners.
- Concurrent clicks could lose entries, and a timer racing `$endGiveaway` could announce winners twice.
- A giveaway whose message was deleted never ended.
- `oldGiveaway` in events lost all of its methods.
- The reaction handler fired `giveawayEntryRemove` for users who never entered.
- Reroll ignored requirements, and a unique reroll silently reused previous winners.
- The winner shuffle was biased.
- A prize containing `@everyone` pinged everyone.
- Clicks on ended giveaways showed "This interaction failed".
- Any command could end or edit another server's giveaway by its ID.

Found while stress-testing the rework, and fixed: joins that cost O(n) each (a mass-join raid could freeze the bot), a queued write that could bring an ended giveaway back to life, removing a winner's entry after the end, and a bonus-role trick that kept extra tickets after dropping the role. The full list is in the [changelog](CHANGELOG.md).

</details>

<h3 align="center">Installation</h3><hr>

> ⚠️ **Warning**\
> **ReForgeGiveaways** requires the extension [**ForgeDB**](https://docs.botforge.org/p/ForgeDB/) installed in order to operate.

1. Run the following command to install the required `npm` packages:
    ```bash
    npm i github:Demonic1594/ReForgeGiveaways @tryforge/forge.db
    ```

    > ℹ️ **Note**\
    > The compiled code is committed, so no build step is needed. The command above follows `main`; to pin a release, add its tag, e.g. `npm i github:Demonic1594/ReForgeGiveaways#v2.1.0`. All releases are listed under [tags](https://github.com/Demonic1594/ReForgeGiveaways/tags), starting with `v2.1.0`.

2. Here's an example of how your main file should look:
    ```js
    const { ForgeClient } = require("@tryforge/forgescript")
    const { ReForgeGiveaways } = require("@tryforge/reforge.giveaways")
    const { ForgeDB } = require("@tryforge/forge.db")

    const giveaways = new ReForgeGiveaways({
        events: [
            "giveawayStart",
            "giveawayEnd"
        ],
        useDefault: true
    })

    const client = new ForgeClient({
        ...options, // The options you currently have
        extensions: [
            giveaways,
            new ForgeDB()
        ]
    })

    client.commands.load("commands")
    giveaways.commands.load("giveaways")

    client.login("YourToken")
    ```

    > ℹ️ **Note**\
    > `@tryforge/forgescript`, `@tryforge/forge.db` and `discord.js` are peer dependencies: your bot provides them, so only one copy of each is loaded.

<h3 align="center">Options</h3><hr>

| Option | Default | What it does |
|---|---|---|
| `events` | `[]` | Giveaway events to listen to |
| `useDefault` | `true` | Send and update the built-in giveaway messages |
| `useReactions` | `false` | Enter by reacting instead of clicking a button |
| `emoji` | `🎉` | Emoji on the button, or the reaction used to enter |
| `buttonLabel` | `Join` | Button label |
| `buttonStyle` | `ButtonStyle.Success` | Button style |
| `showEntryCount` | `true` | Show the live entry count on the button, e.g. "Join (42)" |
| `showInfoButton` | `true` | Add an "ℹ️" button that privately shows a member their status, tickets, win chance and why they can't enter |
| `entryCooldown` | `3000` | Minimum ms between two joins or leaves of one member on one giveaway, by button or reaction; `0` disables it |
| `dmWinners` | `false` | Send winners a direct message |
| `colors` | green, yellow, red, grey | Embed colors for `active`, `paused`, `ended`, `cancelled` |
| `messages` | see `DEFAULT_MESSAGES` | Override any text of the default messages, including every line of the embed |
| `entryFlushDelay` | `1000` | Write entry changes at most this often (ms) per giveaway; `0` writes on every click |
| `messageUpdateDelay` | `5000` | Refresh the entry counter at most this often (ms) |
| `deleteEndedAfter` | off | Delete ended giveaways this many ms after they ended |
| `handleSignals` | `true` | Save pending writes on `SIGINT`/`SIGTERM` |

> ⚠️ **Warning**\
> Reaction mode (`useReactions: true`) needs the `GuildMessageReactions` intent and the `Message` and `Reaction` partials.

Texts in `messages` can use these placeholders: `{prize}`, `{mentions}`, `{count}`, `{s}` (plural "s"), `{reason}`, `{guild}`, `{link}`, `{tickets}`, `{ping}`, `{entryMethod}`, `{roles}`, `{time}`, `{bonuses}`. Each text only fills the placeholders its default uses.

```js
new ReForgeGiveaways({
    dmWinners: true,
    deleteEndedAfter: 30 * 24 * 60 * 60 * 1000, // keep ended giveaways for 30 days
    messages: { joined: "You're in for **{prize}**! Good luck.{tickets}" }
})
```

Every text of the giveaway message is in `messages` too, so it can be translated completely:

```js
new ReForgeGiveaways({
    buttonLabel: "Teilnehmen",
    messages: {
        title: "🎉 VERLOSUNG 🎉",
        embedPrize: "🎁 **Preis:** {prize}",
        embedWinnersCount: "🏆 **Gewinner:** {count}",
        fieldEnds: "Endet",
        fieldHost: "Veranstaltet von",
        fieldEntries: "Teilnahmen",
        entryMethodButton: "Knopf",
        footer: "Klick auf den {entryMethod}, um teilzunehmen!"
    }
})
```

> ℹ️ **Note**\
> The full list of keys is `DEFAULT_MESSAGES` in [src/structures/messages.ts](src/structures/messages.ts).

<h3 align="center">Starting Giveaways</h3><hr>

Requirement and display functions apply to the `$startGiveaway` or `$editGiveaway` that follows them in the same command.

#### Example
```js
module.exports = {
  name: "gstart",
  code: `
  $addRequiredRoles[123456789012345678]
  $setMinimumAccountAge[30d]
  $setMinimumMemberAge[7d]
  $addBonusEntries[234567890123456789;2]
  $setMaxEntries[500]
  $excludeGiveawayHost
  $setGiveawayDescription[Thanks for being part of the community!]
  $setGiveawayColor[#5865F2]
  $let[id;$startGiveaway[$channelID;$authorID;Discord Nitro;60d;3]]
  Started giveaway $get[id]
  `
}
```

> ℹ️ **Note**\
> There is no maximum duration: `30d`, `1y` and longer all work. Role arguments accept role IDs or role mentions such as `<@&123...>`; user and channel mentions are refused.

<h3 align="center">Functions</h3><hr>

#### Builders
Use these before `$startGiveaway` or `$editGiveaway`.

| Function | Effect |
|---|---|
| `$addRequiredRoles[roles...]` | Members need these roles |
| `$setRequiredRolesMode[all\|any]` | Need all of them (default) or any one |
| `$addRestrictedRoles[roles...]` | Members with any of these roles can't enter |
| `$addRestrictedMembers[users...]` | These users can't enter |
| `$setMinimumAccountAge[time]` | Discord account must be at least this old |
| `$setMinimumMemberAge[time]` | Must have been in the server this long |
| `$addBonusEntries[role;amount]` | Members with the role get `amount` extra tickets (bonuses add up) |
| `$excludeGiveawayHost[exclude?]` | The host can't enter or win |
| `$setMaxEntries[amount]` | Cap the number of entrants (`0` removes the cap) |
| `$setGiveawayDescription[text]` | Extra text in the giveaway message |
| `$setGiveawayColor[color]` | Embed color |
| `$setGiveawayImage[url]` / `$setGiveawayThumbnail[url]` | Embed image and thumbnail |
| `$setGiveawayPingRole[role]` | Role pinged when the giveaway starts |
| `$clearGiveawayRequirements` | With `$editGiveaway`: remove all requirements; ones added after it start from scratch |
| `$clearBonusEntries` | With `$editGiveaway`: remove all bonus entry roles |

#### Managing
All return `true` on success. The optional last `guild ID` argument is explained under [Guild Scoping](#guild-scoping).

| Function | Effect |
|---|---|
| `$startGiveaway[channel;host;prize;duration;winners?]` | Start a giveaway; returns its ID |
| `$endGiveaway[id;guild?]` | End now and draw the winners |
| `$rerollGiveaway[id;unique?;amount?;guild?]` | Draw new winners; `unique` excludes everyone who already won |
| `$rerollGiveawayWinner[id;user;guild?]` | Replace one winner (e.g. an unclaimed prize); the others keep their win |
| `$editGiveaway[id;guild;host?;prize?;winners?]` | Change a running giveaway |
| `$extendGiveaway[id;time;guild?]` / `$shortenGiveaway[id;time;guild?]` | Move the end time |
| `$pauseGiveaway[id;guild?]` / `$resumeGiveaway[id;guild?]` | Freeze and unfreeze the timer and entries |
| `$cancelGiveaway[id;guild?]` | End without winners |
| `$addGiveawayEntry[id;user;bypass?;guild?]` / `$removeGiveawayEntry[id;user;guild?]` | Manage entries by hand |
| `$deleteGiveaway[id;guild?]` | Delete permanently |
| `$wipeGiveaways[guild?]` | Delete all giveaways of a guild (default: the current one); outside any guild, e.g. in `ready`, all of them |

#### Reading

| Function | Returns |
|---|---|
| `$getGiveaway[id;property?;sep?]` | One giveaway, as JSON or a single property |
| `$getAllGiveaways[property?;sep?]` | All giveaways |
| `$getGuildGiveaways[guild;all\|active\|paused\|ended;property?;sep?]` | A guild's giveaways, newest first |
| `$giveawayExists[id]` | Whether a giveaway exists |
| `$giveawayHasEntered[id;user]` / `$giveawayEntryWeight[id;user]` | Whether a user entered, and with how many tickets |
| `$giveawayWinChance[id;user]` | Estimated win chance in percent |
| `$giveawayIsWinner[id;user]` | Whether a user is a current winner |
| `$giveawayURL[id?]` | Link to the giveaway message |
| `$newGiveaway[property]` / `$oldGiveaway[property]` | Giveaway data inside events |
| `$giveawayDenyReason` | Why an entry was refused, inside `giveawayEntryRevoke` |

Every field also has its own `$giveawayX[id?]` function: `ID`, `Prize`, `Duration`, `Timestamp`, `EndTimestamp`, `TimeLeft`, `EndedAt`, `HasEnded`, `IsPaused`, `IsCancelled`, `WinnersCount`, `Winners`, `PreviousWinners`, `Entries`, `EntriesCount`, `TotalTickets`, `MaxEntries`, `HostID`, `GuildID`, `ChannelID`, `MessageID`, `RequiredRoles`, `RequiredRolesMode`, `RestrictedRoles`, `RestrictedMembers`, `MinAccountAge`, `MinMemberAge`, `BonusEntries`, `Description`.

> ℹ️ **Note**\
> The full list with every argument is in [metadata/functions.json](metadata/functions.json).

#### Guild Scoping
Management functions only act on giveaways of the guild given as the last argument or, if you leave it out, of the guild the command runs in, so one server can never end or edit another server's giveaway. In contexts nobody outside the bot can trigger (giveaway events, `ready`) they are unrestricted.

> ⚠️ **Warning**\
> In direct messages there is no guild, so management functions do nothing there unless you pass the guild argument yourself. Only do that in commands restricted to people you trust, for example `$onlyForUsers[;$botOwnerID]`.

<h3 align="center">Custom Messages</h3><hr>

You can disable the default messages by setting `useDefault: false` in the client options, and override them with custom messages emitted through events. Use the functions above to retrieve information about the current giveaway.

> ⚠️ **Warning**\
> Only **one** `giveawayStart` event is allowed per client instance!

`$startGiveaway` waits for your `giveawayStart` event and returns nothing if it did not return a valid message ID, so `$if[$get[id]==;...]` tells you whether the giveaway really started.

#### Examples
When using custom start messages, your event **must return the message ID** of the sent giveaway message. To ensure that only the message ID is returned (and no additional text), use the `$return[]` function.

```js
module.exports = {
  type: "giveawayStart",
  code: `
  $return[
    $sendMessage[$giveawayChannelID;
      $addContainer[
        $addTextDisplay[### 🎉 Giveaway 🎉]
        $addSeparator
        $addTextDisplay[**Prize:** $giveawayPrize\n**Winners:** $giveawayWinnersCount]
        $addSeparator
        $addActionRow
        $addButton[giveawayEntry;Join;Secondary;🎉]
      ;Green]
    ;true]
  ]
  `
}
```

```js
module.exports = {
  type: "giveawayEnd",
  code: `
  $sendMessage[$giveawayChannelID;
    $reply[$giveawayChannelID;$giveawayMessageID;true]
    🏆 **Winners:** <@$newGiveaway[winners;>, <@]>
  ]
  `
}
```

<h3 align="center">Handling Interactions</h3><hr>

The custom ID for giveaway entry buttons must follow this exact format:
```
giveawayEntry
```
Anything after a `-` is ignored, so `giveawayEntry-1` works too. The info button uses `giveawayInfo`.
<sub>*See the `giveawayStart` example above for reference.*</sub>

\
Through the entry-related events, you can send custom responses directly to the current interaction context. With `useDefault: false`, a click is answered by your `giveawayEntryAdd`, `giveawayEntryRemove` or `giveawayEntryRevoke` event; for any of them you don't listen to, the built-in reply is sent, so a click never ends in "This interaction failed".

#### Examples
```js
module.exports = {
  type: "giveawayEntryAdd",
  code: `
  $interactionReply[
    $ephemeral
    You have joined this giveaway as participant **#$giveawayEntriesCount**!
  ]
  `
}
```

```js
module.exports = {
  type: "giveawayEntryRevoke",
  code: `
  $interactionReply[
    $ephemeral
    You can't join this giveaway: $giveawayDenyReason
  ]
  `
}
```

`$giveawayDenyReason` is one of `bot`, `host`, `missingRoles`, `restrictedRole`, `restrictedMember`, `accountTooNew`, `memberTooNew`, `entriesFull`, `ended`, `paused`.

<h3 align="center">Events</h3><hr>

| Event | Fired when |
|---|---|
| `databaseConnect` | The database has connected |
| `giveawayStart` | A giveaway has started |
| `giveawayEnd` | A giveaway has ended and its winners were drawn |
| `giveawayReroll` | A giveaway was rerolled |
| `giveawayEdit` | A giveaway was edited, extended or shortened |
| `giveawayEntryAdd` | Someone entered |
| `giveawayEntryRemove` | Someone left |
| `giveawayEntryRevoke` | Someone tried to enter but was refused |
| `giveawayCancel` | A giveaway was cancelled |
| `giveawayPause` / `giveawayResume` | A giveaway was paused or resumed |

<h3 align="center">Downtime, Restarts and Crashes</h3><hr>

Everything about a giveaway lives in the database, so the bot can stop at any moment. On the next start, once both the database and Discord are ready:

| What happened | What ReForgeGiveaways does |
|---|---|
| The bot restarted | Re-arms every running giveaway for its original end time. Paused giveaways stay paused, with the same time left |
| A giveaway ended while the bot was offline | Draws and announces it right away, one giveaway at a time. The result shows the scheduled end time |
| The bot crashed after drawing winners but before announcing them | Announces them and fires `giveawayEnd`, exactly once, without drawing again |
| The bot crashed after saving a new giveaway but before posting it | Posts the message (with custom messages: runs your `giveawayStart` event again) |
| Members can't be looked up while drawing (network error) | The draw fails and is retried a minute later, instead of ending with "no winners" |
| Reactions changed while offline (reaction mode) | Counts them on restart and again right before every draw |
| Entry counters went stale while offline | Refreshes the giveaway messages |
| The database is unreachable at boot | Retries with backoff; commands give up after 30 s instead of hanging |
| A Discord outage at the end time | Retries every minute instead of ending with no winners; after a day it ends anyway |
| The bot is disconnected at the end time | Retries every minute until it is back |
| A database write fails while ending, pausing or cancelling | Nothing changes: the giveaway keeps running with its timer; an overdue draw is retried every minute |
| A database write of an entry fails | The entry stays in memory and the write is retried every 5 s |
| The host slept or its clock jumped | Ends are never more than 30 s late |
| A click arrives while the giveaway is busy | The click is acknowledged in time, so users never see "This interaction failed" |

> ℹ️ **Note**\
> Two things can't be recovered: up to one second of entry clicks if the process is killed hard (see `entryFlushDelay`), and button clicks made while the bot was offline, which Discord rejects on its side.

<h3 align="center">Abuse Protection</h3><hr>

| Abuse | Protection |
|---|---|
| Spamming join/leave | Per-member cooldown (`entryCooldown`) for buttons and reactions; writes are batched and message refreshes debounced |
| Holding a bonus role only while joining | Picked members' tickets are re-checked at the draw and the draw is redone with the real count |
| Dropping a required role, leaving or getting restricted after joining | Every winner is re-checked against all requirements at the draw |
| Adding bots or the host by hand | Bots never win; an excluded host never wins |
| Prizes with `@everyone`, role pings or `{placeholders}` | Only winners are ever pinged; placeholders inside a prize are not expanded |
| Huge prizes or winner counts | Prizes up to 1,024 characters, counts up to 2^31 - 1; announcements always fit Discord's limits |
| Mass joins on big giveaways | Joining takes constant time; 100,000 joins take well under a second |
| Touching another server's giveaway by ID | Management functions are scoped to their own guild, and refuse to act from direct messages |

<h3 align="center">Switching from ForgeGiveaways</h3><hr>

1. Uninstall the original and install ReForgeGiveaways:
    ```bash
    npm uninstall @tryforge/forge.giveaways
    npm i github:Demonic1594/ReForgeGiveaways
    ```
2. Change `require("@tryforge/forge.giveaways")` to `require("@tryforge/reforge.giveaways")`, and `ForgeGiveaways` to `ReForgeGiveaways`.
3. Keep your database: existing giveaways are upgraded in place on first start. Your commands, events and function calls keep working.

> ℹ️ **Note**\
> The extension registers itself as `reforge.giveaways`, which only matters if another extension lists it by name in `requireExtensions`.

<h3 align="center">Upgrading</h3><hr>

Install the new release over the old one; there is nothing to migrate by hand. On the first start the database is upgraded in place, and only nullable columns are ever added, so your giveaways and entries are kept.

```bash
npm i github:Demonic1594/ReForgeGiveaways#v2.1.0
```

#### From 2.0.0 to 2.1.0
Your commands keep working. Three things behave differently:

- **Direct messages:** management functions (`$endGiveaway`, `$editGiveaway`, `$deleteGiveaway`, ...) do nothing in a DM unless you pass the guild argument. Before, any command usable in DMs could manage any server's giveaway by its ID. See [Guild Scoping](#guild-scoping).
- **Network errors at the draw:** if members can't be looked up, `$endGiveaway` returns `false` and the giveaway keeps running (a timed end retries every minute), instead of ending with no winners.
- **Custom messages (`useDefault: false`):** `$startGiveaway` waits for your `giveawayStart` event and returns nothing if it gave no valid message ID. Clicks your entry events don't answer now get the built-in reply instead of "This interaction failed".

New in 2.1.0: `$rerollGiveawayWinner`, `$clearGiveawayRequirements`, `$clearBonusEntries`, a translatable embed (see [Options](#options)), more `$getGiveaway` properties and sharding support. The full list is in the [changelog](CHANGELOG.md#210-november-2026).

<h3 align="center">Notes and Limits</h3><hr>

- Running giveaways are kept in memory, which assumes one bot process owns each giveaway. Don't point two different bots at the same giveaway database.
- Sharding: when the bot runs as several processes, each process only times, draws and caches the giveaways of its own guilds. This follows Discord's shard formula and is covered by a test, but has not been run on a live sharded bot.
- Bonus entries count the roles a member has at the time of the draw.
- Entries of an ended giveaway can't be changed; they are the record the winners were drawn from.
- In reaction mode, entries added with `$addGiveawayEntry` are kept even though they have no reaction.
- Giveaways must end before the year 10000, the latest date Discord can display.
- SQLite and PostgreSQL are tested. MySQL and MongoDB follow the same code paths but have not been tested against a live server.
- `$startGiveaway` only posts in channels of the server the command runs in. Contexts without a server (giveaway events, `ready`, direct messages) can pick any channel, so keep commands that take a channel from user input in a server.

<h3 align="center">Development</h3><hr>

```bash
npm install
npm run build      # compile TypeScript to dist/
npm test           # build, then run all tests (SQLite)
npm run docgen     # regenerate metadata/*.json
```

The test suite covers the scheduler, locking, statistical fairness, multi-process restart and crash scenarios, upgrading a database of the original extension, and a seeded fuzzer that runs thousands of random concurrent operations with injected database failures. Run a specific fuzz seed with `FUZZ_SEED=42 npm test`.

To run the single-process test files against PostgreSQL instead of SQLite, point them at an empty database:

```bash
npm i --no-save pg
export GIVEAWAYS_TEST_DB='{"type":"postgres","host":"127.0.0.1","username":"postgres","database":"giveaways_test"}'
node --test test/regression.test.js   # likewise adversarial, custom and hardening, each on an empty database
```

#### Releasing

1. Set the new version in `package.json` (`npm version <x.y.z> --no-git-tag-version` also updates `package-lock.json`).
2. Run `npm test` and `npm run docgen`, and commit `dist/` and `metadata/` with the sources: the package installs straight from GitHub, and CI fails when they are out of date.
3. Add the release to [CHANGELOG.md](CHANGELOG.md), with its upgrade notes, and to the [Upgrading](#upgrading) section.
4. Once it is merged into `main`, tag the merge commit and push the tag:
    ```bash
    git tag -a v<x.y.z> -m "ReForgeGiveaways <x.y.z>"
    git push origin v<x.y.z>
    ```

> ⚠️ **Warning**\
> Never change the type or length of an existing column in `src/structures/schema.ts`. ForgeDB lets TypeORM synchronize the schema, and on PostgreSQL and MySQL TypeORM changes a column by dropping and re-creating it. Adding nullable columns is safe.

<h3 align="center">Credits and License</h3><hr>

ReForgeGiveaways is a modified fork of [ForgeGiveaways](https://github.com/tryforge/ForgeGiveaways) by xNickyDev, forked at version 1.1.0 (commit `586fb15`). Modifications were made in November 2026 and are listed in the [changelog](CHANGELOG.md).

Licensed under the [GNU GPL v3](LICENSE), like the original.
