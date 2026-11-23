# Changelog

## 0.3.3

A fix for 0.3.2, which did not start. Self-test suite: 425 to 435 checks.

- **0.3.2 did not start.** Double-clicking it did nothing: no window, no
  error. At startup it ran the new update check before you had unlocked, and
  reading the update setting from the still-locked database failed. The crash
  handler then tried to read the crash-reporting setting from the same locked
  database, failed too, and the app closed before its window appeared. Every
  launch hit this, on first run and with an existing database. Your data was
  never touched.
- **The fix.** The update check now runs only after you unlock (or create)
  the database, once per launch, as intended. Crash reporting counts as off
  while the database is locked, and the crash handlers can no longer fail.
- **A startup failure is never silent again.** If Kaseki hits an error before
  its window appears, it shows an error dialog naming the log folder and
  closes, instead of disappearing or leaving a hidden process behind.
- **Releases are checked before they ship.** The release build now runs the
  packaged Windows app, first with no data and then with a locked database,
  and fails unless it reaches a loaded window.
- Because 0.3.2 never got as far as the update prompt, it cannot update
  itself: install 0.3.3 from the releases page over the top of it.

## 0.3.2

Updates from inside the app. Self-test suite: 417 to 425 checks.

- **The update check is now on by default.** This is a change of default:
  through 0.3.1 it was off unless you turned it on. If you switched it off
  yourself, it stays off. It now runs once each time you start Kaseki, right
  after you unlock, instead of once a day, and it can be switched off in
  **Settings → Updates**. The request goes to GitHub only and carries your
  Kaseki version and nothing else.
- **Update now.** When a newer version exists, a small prompt says so, after
  onboarding, the legal documents and the tour, never on top of them.
  **Update now** downloads the installer inside the app with a progress bar,
  checks it against the hash published with the release, and offers
  **Restart to update**. Nothing is downloaded until you click. **Later**
  hides the prompt until the next launch. On a source build, or anywhere but
  the Windows installer, the button opens the release page instead.
- **The Privacy Policy changed to match**, so you will be asked to accept the
  legal documents once more on your first launch of 0.3.2. It also no longer
  says the weather provider, Open-Meteo, is in the United States; it is in
  Switzerland.
- The Windows installer is now named `Kaseki-Setup-<version>.exe`, and each
  release carries `latest.yml` and a `.blockmap` for the updater.

## 0.3.1

A first-run fix. Self-test suite: 409 to 417 checks.

- **The tour no longer opens on top of the legal documents.** Choosing
  "Yes, show me around" at the end of onboarding showed the tour and the
  Terms / Privacy / Acceptable Use acceptance at the same time, tangled
  together over the dashboard. The legal documents now come first and on
  their own; the tour starts only once you accept, and can't be started from
  the Orb while acceptance is pending. This has been there since 0.1.0: the
  app treated "still checking whether you've accepted" as "already accepted".
- **The settings tip shows after the tour.** The Orb's one-time "we're all
  set" tip was silently dropped whenever you took the tour; it now follows it.
- **Copy that still said "later".** The tour's first step said the task list
  "arrives in a later update" and the document viewer's Details pane said
  linked tasks, bundles, and annotations would appear "in later phases". All
  of those shipped long ago; the wording is fixed.

## 0.3.0

The placeholder release: everything 0.2.0 still showed as "coming soon" is
now real. The home-screen widgets work, and the six settings pages that said
they would "arrive in a later phase" have arrived. The self-test suite grew
from 296 to 409 checks, none of which touch the network.

### Home-screen widgets

- **Five working widgets** replace the five inert placeholders: **Upcoming**
  (overdue tasks, then the next seven days of due tasks and events across
  every active space), **Quick Notes** (a scratchpad saved as you type),
  **World Clocks** (up to six zones, with the offset from yours, correct
  across daylight-saving changes), **Bookmarks** (http/https links only,
  opened in your own browser), and **Weather**.
- **Edit** reorders, removes, and adds widgets, and manages clocks and
  bookmarks. The layout and each widget's content are preferences, so no
  migration was needed. A new install shows Upcoming, Quick Notes, World
  Clocks, and Bookmarks; Weather is never on unless you add it.

### Settings pages

- **Application launcher** — edit any space's dock from Settings, with the
  same editor the dashboard uses.
- **Backup and export** — built-in backup (on demand, or daily / weekly while
  Kaseki is open), keep the newest *n*, restore with an undo copy, and plain
  exports of all tasks (CSV) and the calendar (`.ics`). Backups are copied
  as they sit on disk, so they stay encrypted. See the self-hosting guide.
- **Notifications** — off by default. Local desktop reminders before timed
  events and an optional daily summary of due and overdue tasks. Nothing
  leaves the machine.
- **Search** — choose which kinds of result Cmd/Ctrl+K shows and how many of
  each (the old fixed eight is still the default).
- **Updates** — an optional daily check against GitHub releases, off by
  default. It tells you about a new version and links to it; it never
  downloads or installs anything.
- **Weather widget** — the switch, a place search, and °C / °F. Off by
  default; no request is made until it is on and a place is chosen.

### Privacy

Kaseki now has three optional outbound features — crash reporting, the update
check, and the weather widget — and all three are **off by default**. With
them off, Kaseki makes no network requests. The update check sends only its
version in the User-Agent; the weather widget sends only the chosen
coordinates and units (or, while searching for a place, the name typed). A
release link from GitHub is only followed if it points at this project's own
releases page.

### Upgrade notes

No database migration. The privacy policy's "Last updated" date is now set
(23 November 2026), which changes the legal documents' fingerprint — so
existing users are asked to review and accept the legal documents once more
on first launch after upgrading.

## 0.2.0

A bug-fix and completeness release. Every change below came out of a full audit
of 0.1.0; the self-test suite grew from 237 to 296 checks, with the new ones
pinned to the specific bugs fixed here.

### Data-corruption fixes

- **Task notes no longer bleed between tasks.** Switching tasks inside the
  slide-out (e.g. opening a blocker from the Dependencies tab) could show the
  previous task's note and silently save it into the new task. The editor is
  now keyed by task, and every save carries the id of the document it was
  typed into. The knowledge wiki had a subtler variant of the same flaw with
  the same fix.
- **Deleted recurring-event occurrences stay deleted.** "Delete this and
  following" caps a series with an UNTIL that the edit form used to strip on
  the next save, resurrecting every deleted occurrence. The form now preserves
  rule components it doesn't display (UNTIL, COUNT, BYxxx). Editing a whole
  series also used to detach its per-occurrence exceptions (cancellations came
  back, edits reverted); exceptions now move with the series when its time
  changes, and are deliberately cleared only when the recurrence rule itself
  changes.
- **Archived tasks are reachable again.** Archiving was a one-way trapdoor —
  nothing could list, restore, or even find an archived task. Each space now
  has an Archived shelf under its task list, with unarchive. The decoy
  'Archived' *status* (which archived nothing and left tasks active and
  blocking) is gone; migration converts any status-archived tasks to the real
  mechanism.

### Correctness

- **Recurring events no longer drift across daylight-saving changes.** Events
  store their timezone and repeat at the same wall-clock time in it; a weekly
  14:00 London call stays at 14:00 on both sides of the October clock change
  instead of shifting to 13:00. Calendar exports emit proper `TZID` wall
  times so other calendar apps expand them correctly too.
- **Completing one occurrence of a series records that occurrence's own end**,
  not the series' first-ever end (which produced occurrences that "ended"
  weeks before they started).
- **Billing reports count fixed-price work once** — in the month the task is
  marked Done — instead of re-counting the full price in every month that
  happened to contain a time entry. Fixed-price and per-unit tasks with no
  tracked time now appear in the report at all. Tasks record a `completed_at`
  timestamp on entering Done.
- **Events that span midnight work.** An end time at or before the start rolls
  to the next day, and the calendar shows anything *overlapping* a day, not
  only things that *start* on it.
- **Date-only values parse as local dates.** Due dates no longer display a day
  early west of Greenwich, and editing a time entry logged late at night no
  longer shifts it back a day.
- One malformed recurrence rule can no longer take down the whole calendar —
  expansion failures are logged per-event and skipped.

### New capabilities

- **Change the login password** (Settings → General). The database is
  re-encrypted in place; previously the master password was set once at
  account creation and frozen forever.
- **Space management.** Rename a space, change its accent and icon, edit the
  cheatsheet (the dashboard promised an editor that never existed) and status
  set, archive it, or delete it with a full cascade. Archived spaces restore
  from Settings → Profession spaces. Duplicate space names auto-suffix.
- **File management.** Rename and delete ingested files from the viewer's
  context menu — files were previously permanent. Deleting removes
  attachments, annotations, links, and the blob on disk. Re-ingesting
  identical bytes under a new name now takes the new name.
- **Calendar paging** — step the dashboard calendar backwards and forwards a
  week at a time; yesterday's missed event is no longer invisible.
- **The activity feed says what happened to what** — entries carry the task's
  title and space, click through to the task, and refresh on focus. Deleted
  tasks clean up their feed entries.
- Search hits for events open the event for editing directly; vault hits open
  the folder straight onto the file.

### Reliability & behaviour

- **One Escape closes one layer.** Escape used to fire every open overlay's
  handler at once — dismissing the PDF find bar closed the whole viewer;
  closing a vault confirm closed the whole vault. All overlays now share a
  layer stack; Escape closes the top one only.
- **Launching apps on Linux reports failures** instead of returning success
  and doing nothing (the spawn error fired past the old error handling), and
  `.desktop` entries launch properly via `gio launch`. Launch errors surface
  through the Orb.
- **Vault auto-lock tells the interface.** The sensitive folder flips to its
  locked pane the moment the inactivity timer fires, instead of showing a
  stale unlocked view over a locked vault. Changing the auto-lock interval
  applies immediately.
- Unlocking the vault no longer freezes the whole app for the duration of the
  key derivation (the KDF is unchanged, just off the main thread), and every
  key copy is zeroed after use in the passcode-change and recovery paths.
- A render error shows a recovery screen with a reload button instead of a
  permanently blank window.
- Double-pressing Enter no longer creates duplicate tasks or events; typing
  'b' or arrows in the PDF find bar no longer toggles the sidebar or flips
  files; PDF documents are released from memory when you move on; multi-line
  PDF highlights hug each line instead of boxing the paragraph.
- Note autosave updates in place and throttles its activity entries (a minute
  of typing used to write dozens of identical "note updated" rows).
- Printing a CSV uses the same RFC-4180 parser as the on-screen viewer
  (quoted fields with commas no longer mangle), and export failures (locked
  file, full disk) report instead of vanishing.
- Electron hardening: renderer sandbox enabled, navigation locked to the app
  bundle, `openExternal` and launcher URLs restricted to http(s).
- Logs older than 30 days are pruned at startup; hot foreign-key lookups are
  indexed; the packaging scripts derive the Electron version and native-module
  ABI from what's installed instead of hardcoding them.

### Upgrade notes

Migration 008 runs automatically on first launch: it stamps existing events
with this machine's timezone, backfills `completed_at` for tasks already
marked Done (from their last-updated time — the best available
approximation), converts status-'Archived' tasks to the archived flag, and
strips 'Archived' from status sets. Existing per-occurrence exceptions created
before 0.2.0 remain keyed to their old slots; ones sitting across a future
DST boundary from their series' creation may detach — re-apply those edits if
you have any.
