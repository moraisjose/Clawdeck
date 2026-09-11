# Changelog

The widget and the companion version independently and are never guaranteed to be the same
version. The wire contract between them is `docs/STATE-CONTRACT.md`, which carries the per-version
detail of every additive field and is the source of truth; this file is the short view.

## Current

| Component | Version | Notes |
|---|---|---|
| widget (`widget/manifest.json`) | 0.28.2 | card type +17% (title 24.5 px, meta 18.4 px at 2560x720), titles wrap to two lines; question pinned at three whole lines; at most two subagent rows; badges keep their chip size. Plus 0.28.1: | idle blink every 8–10 s (was 60–180 s). Plus 0.28.0: | **the finish dance**: shades on and a four-beat shimmy when a session lands `working -> done` after a real turn (20 s+), once per 30 s, never beside a waiting session. Plus 0.27.1: | **0.27.0 rendered blank inside iCUE** (property/function name collision, a parse-time SyntaxError); fixed by renaming the reader. Otherwise 0.27.0: | **Approval Pairing Code** property; `decide` carries the code + `requestId`; unpaired taps are refused locally with a notice; 403/409/429 answers named on the panel |
| crabd (`companion/crabd.py`) | 0.31.1 | **finished subagents stay visible for five minutes**, marked `done`, and the badge reads live-over-launched. Plus 0.31.0: | **OpenCode sessions on the panel**: session cards carry a `client` member and the feed a top-level `opencode` usage block, read straight from OpenCode's SQLite db, read-only. Plus 0.30.4: | **a finished session stops alerting**, live AND on replay - a nudge already written to `history.jsonl` is no longer re-raised at every restart. Plus 0.30.3: | the live half: the idle reminder Claude Code fires 60 s after a turn ends is logged as `idle at the prompt`, not raised as a question. Plus 0.30.2: | **a restart stops losing your alerts**, and **a dead session stops reading `working`**: the activity clock is the transcript's own record timestamps, not the file mtime, so the undated metadata Claude Code appends later (`ai-title`, `last-prompt`, `atis-latch`) no longer resets a session's idle clock. Plus 0.30.1: | **a dispatcher stops alerting while it works**: a `SubagentStop` past the question stands a `needs_input` card down, so the CLI's 60 s idle Notification no longer strands a session whose subagents are running. A permission-raised alert is gated out. Plus 0.30.0: | **the gauges stop dying every morning**: an optional long-lived token (`claude setup-token`, stored DPAPI-protected by `Install-SideCrab.ps1 -LimitsToken`) is used whenever the CLI token has expired; `limits.tokenSource` says which answered. Plus 0.29.0: | **SEC-a + WID-a closed**: `decide` requires the pairing code (`~/.sidecrab/panel-token`, minted on first start) and the pending request's `requestId`; `approvals` block in `/v1/state`; `panelToken` diagnostics in `/v1/health` |
| notifier (`notifier/sidecrab_toast.py`) | 0.20.0 | shared DayLedger with the digest; budget-crossed toast; companion-gone-quiet toast |
| lighting (`lighting/sidecrab_glow.py`) | parked | ships disabled: the Corsair SDK crashes in every non-interactive console context tested |
| schema (`/v1/state`) | 5 | marks the last breaking shape; additive fields are feature-detected by presence |

## Highlights by wave (newest first)

- **0.31.1 crabd + widget (2026-09-11)** - you can finally see the subagents a session launched.
  Before this the panel listed only the ones running RIGHT NOW and hid the badge when none were, so
  a session that fanned out to eleven subagents and finished them showed nothing whatsoever - the
  count was in the feed and nothing on screen drew it. The badge now reads live over launched
  (`3/11 sub`) and stays up once anything has been launched; tapping the card lists the lanes, with
  the finished ones marked `done` and kept for five minutes before they drop off. Subagents are
  deliberately NOT shown as their own cards: they have no identity to act on, none of the card
  gestures can reach one, and one fan-out would bury the sessions that are actually yours to answer.
  On the iPad the running lanes are now listed ON the card too, without opening anything - and only
  a card that HAS running lanes grows to fit them, so the rest of the grid is untouched.

- **0.31.0 crabd + widget (2026-09-10)** - the panel shows OpenCode too. Session cards now say
  which agent they belong to with a small pixel mark beside the state dot - a crab for Claude Code,
  the OpenCode mark for OpenCode, the same two icons Orca shows beside these agents - and
  the mark is on BOTH kinds, because a card with no marking is
  ambiguous to anyone who has not memorised which agent is the default. Today's OpenCode tokens get
  their own muted line under the burn stats, deliberately NOT summed into the Claude figures: the
  gauges above measure the Anthropic account, and one merged total would read as if that account
  were being spent by both. Read straight from OpenCode's own database, read-only and verified not
  to touch it. An OpenCode card never alerts - no hook exists to raise one. See
  `docs/STATE-CONTRACT.md` v0.31.0 for everything such a card cannot carry, and why.

- **0.30.4 crabd (2026-09-10)** - the other half of 0.30.3, and the half that was actually keeping
  the false alerts on the glass. Stopping the panel from raising a new false alert did nothing for
  the ones already recorded: those live in the history file permanently, and every restart read them
  back as questions. Two cards survived restart after restart that way, each with a finished turn
  exactly 60 seconds before its "question". Replay now applies the same rule the live path does.

- **0.30.3 crabd (2026-09-10)** - the panel stopped crying wolf. Claude Code sends the same
  notification for three different things: a permission dialog, a question sheet, and - one minute
  after a turn ends - a reminder that a session is idle at the prompt. Only the first two mean the
  session is stuck, and the panel was treating all three as an alert. Reported with four alerting
  cards of which one was real; the three false ones had fired exactly 60 seconds after their turn
  finished. A notification arriving on a session that has already finished is now logged on the
  timeline as "idle at the prompt" and raises nothing. See `docs/STATE-CONTRACT.md` v0.30.3 for the
  one case this reads wrong.

- **0.30.2 crabd (2026-09-10)** - two ways the panel told you the wrong thing, both reported
  together. First: restarting the companion used to wipe every waiting session's alert - they came
  back reading `working`, so the panel claimed sessions were running while they sat on a question
  you had not answered. A waiting session now survives a restart (the card says "waiting on you";
  the question text itself is not kept in the history file, by design). Second: sessions that had
  stopped kept showing as running. The panel
  aged a session out on its transcript file's modification time, and Claude Code writes several
  things into a transcript after the turn is over - the generated title, the last prompt, an
  internal latch - none of which carries a timestamp and all of which touch the file. So a finished
  session kept resetting its own 15-minute idle clock. Measured on three live rows: file times
  running 12 minutes, 1 h 45 m and 2 h 56 m ahead of anything actually recorded in them. The clock
  is now the transcript's own record timestamps, falling back to the file time only where crabd
  could date nothing at all. See `docs/STATE-CONTRACT.md` v0.30.2 for what this does NOT fix.

- **0.30.1 crabd (2026-09-10)** - a dispatcher no longer sits on the panel saying it needs you
  while it is working flat out. A session that farms its work out to subagents parks its own model,
  so Claude Code's 60-second idle notification fires on a main loop that is legitimately quiet - and
  v0.19.0's clearing signal (a completed round-trip in the main transcript) cannot lift it, because
  the parent will not round-trip again until the whole batch lands. Measured on the reporting run:
  193 subagents, the card alerting with one second of age on it. A `SubagentStop` newer than the
  question now stands the card down - a Task returning into the parent's loop is the parent
  advancing, which cannot happen while the parent is what is being waited on. An alert the
  `PermissionRequest` hook raised is gated out and stays the broker's to clear. See
  `docs/STATE-CONTRACT.md` v0.30.1 for the residual this does not close.

- **0.30.0 crabd (2026-09-04)** - "token expired" every morning, fixed. The CLI's token lives
  ~6 h and only a terminal `claude` refreshes the file, so `claude setup-token` +
  `Install-SideCrab.ps1 -LimitsToken` stores a year-long token, DPAPI-encrypted, used only
  when the short-lived one is stale. The unavailable notes now say what actually fixes it.

- **0.28.2 widget (2026-09-02)** - the session cards are easier to read: type is about 17%
  larger and titles wrap to two lines instead of being cut. To pay for it, a question card pins
  its question at three whole lines and hides its subagent rows, an approval card keeps a
  one-line title, and a card shows at most two subagent rows. Compact density is unchanged.
- **0.28.1 widget (2026-09-02)** - the crab blinks every 8 to 10 seconds instead of every one to
  three minutes. Same gates: calm moods only, never under quiet hours or reduced motion.
- **0.28.0 widget (2026-09-02)** - the finish dance. When an agent finishes a real turn the crab
  puts its sunglasses on and does a little dance. Bounded: 20 s minimum turn, 30 s cooldown,
  never while a session is waiting on you, never under quiet hours or reduced motion.
- **0.27.1 widget (2026-09-02)** - fixes 0.27.0, which imported but rendered a blank panel: iCUE
  injects properties as `let` globals and the new `panelToken` property collided with a
  same-named function. Import this one instead.
- **0.29.0 crabd / 0.27.0 widget (2026-09-01)** - panel approvals are safe to turn on: the
  pairing code and per-request id close SEC-a and WID-a. `Install-SideCrab.ps1 -PairingCode`
  prints the code; it goes into the widget's iCUE settings. Older widgets cannot approve
  against this crabd (refused, terminal dialog decides) - update both sides.

- **0.28.x crabd (2026-09-01)** - two live incidents fixed: a session killed by an app restart
  stayed `working` and swallowed queued taps (GHOST-a, half closed, taps now refused with 409);
  finished sessions re-activated by the CLI's post-Stop bookkeeping (GHOST-b, closed).
- **0.26.0 widget / 0.28.0 crabd (2026-08-28)** - served context-window denominator, real layouts
  for the sub-3:2 slots, six design-audit findings closed.
- **0.26.0 crabd (2026-08-28)** - backend audit: Origin gate extended to reads (SEC-4), config
  atomic write, GitLookup bounded, needs_input row cap, two permission stand-down P1s fixed.
  SEC-a recorded as the one open security residual (see `SECURITY.md`).
- **0.20.0 crabd (2026-08-27)** - never-500, restart race fixed; widget drill-downs.
- **0.15.0 (2026-08-27)** - the control-surface wave: panel approvals (off by default),
  tap-to-continue, settings from the glass, session filter and density chips, verified live with
  the operator present.
- **0.9.0 (2026-08-26)** - internal-dashboard integration removed; repo genericised for publication; manifest
  id became `com.sidecrab.widget`.
- **0.6.1 (2026-08-26)** - versioning rework: `schema` pinned at 5, additive fields by presence.
- **0.1.0 (2026-08-26)** - first widget package.
