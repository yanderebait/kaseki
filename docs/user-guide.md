# Kaseki — User Guide

Kaseki is a private, self-hosted dashboard for your working life. It keeps tasks, schedules, notes, documents, and sensitive files for one person, on one machine, with nothing synced to the cloud. This guide walks through using it day to day.

## First run

The first time you open Kaseki it asks for a name and a login password, then walks you through a short setup:

1. **Your name** — used for the "Hi, [Name]" greeting. Nothing more.
2. **Your profession** — search the 50+ built-in profession presets (type "lawyer", "vet", "plumber"…) or **Build my own** for a custom space. The preset seeds sensible task fields, statuses, a cheatsheet, and suggested app links.
3. **Customize** — theme (dark / light / auto), an accent colour, font size, and background.
4. **The launcher and the Orb** — a quick introduction to the app dock and Kaseki's friendly mascot.
5. **A guided tour** — optional; it points out each part of the dashboard. You can re-run it any time from the Orb menu.

Before the dashboard unlocks you'll be asked to accept the legal documents (shown in full — a plain-language version and the formal version side by side). On later launches you just enter your login password.

## The home screen

The home screen is your overview across everything:

- **Profession cards** — one per space, colour-coded, showing how many active tasks each has. Click a card to open its dashboard.
- **Activity feed** — a running log of recent changes across all spaces ("Marked done", "File uploaded", "2h ago").
- **Calendar strip** — the next seven days of events from every space.
- **Widgets** — small panels you choose and arrange (see below).
- **Knowledge** — opens your personal wiki (see below).

The Orb sits in the bottom-right corner throughout.

### Widgets

The widget area under the calendar strip holds a few small panels. A new install shows four; the fifth (Weather) is yours to add:

- **Upcoming** — overdue tasks first, then tasks due and events starting in the next seven days, across every active space. Done and archived tasks, completed events, and archived spaces are left out. Click a task to open it, or an event to open its space.
- **Quick Notes** — a plain-text scratchpad, saved as you type. It isn't attached to any task or page; it's for the phone number you need to write down mid-call.
- **World Clocks** — up to six time zones, each with how far ahead or behind you it is. Add one by zone (`Asia/Tokyo`) or by city name (`Tokyo`).
- **Bookmarks** — web links that open in your own browser. Only `http` and `https` addresses are accepted; a bare `example.com` becomes `https://example.com`.
- **Weather** — current conditions and a short forecast for one place. It does nothing until you switch it on and choose a location in **Settings → Weather widget**, because it's the one widget that uses the network (see the self-hosting guide).

Press **Edit** above the widgets to reorder (the arrows), remove (×), or **Add widget**, and to add or remove clocks and bookmarks. Press **Done** when finished. The two buttons beside it switch between a single column (list) and two columns (grid).

## Profession spaces and the dashboard

A *space* is one area of work — "Legal", "Home", "Freelance". Each space has its own dashboard with the same layout but its own tasks, calendar, fields, and accent colour. The dashboard has:

- **A task list** down the left, scoped to this space, with search and quick-add.
- **A calendar** showing this space's events.
- **A cheatsheet** — a collapsible panel of quick-reference notes (the legal space ships with section references, for instance).
- **An application launcher dock** in the header — one-click links to the apps and websites you use for this kind of work.
- **A density toggle** to compact the layout.
- **Space settings** (the gear in the header) — rename the space, change its accent and icon, edit the cheatsheet and status set, archive it, or delete it and everything in it. Archived spaces can be restored (or permanently deleted) from **Settings → Profession spaces**.

Switch spaces by returning home (back arrow, or **Cmd/Ctrl+H**) and picking another card, or jump straight to a space with **Cmd/Ctrl+1** through **9**.

## Tasks

Add a task from the box at the top of the list, or press **Shift+N** anywhere for *quick capture* (a title, a space, an optional due date). Each task card shows its accent strip, status, due date, and indicators for pinned, blocked, and stale tasks. Click a card to open the **task detail** panel, which slides in from the right with tabs:

- **Details** — description, priority, the space's custom fields (client, matter reference, hearing date…), tags, and billing.
- **Subtasks** — a simple checklist.
- **Time** — logged time and a manual-entry form (see below).
- **Files** — attachments (deduplicated by content; the same file attached twice is stored once).
- **Notes** — a rich-text editor for long-form notes.
- **Activity** — the task's full change history.
- **Dependencies** — what this task is waiting on and what it blocks. Kaseki prevents circular dependencies and warns if you complete a task whose blockers aren't done.

Select several tasks (Cmd/Ctrl/Shift-click) to act on them in bulk — change status, tag, pin, archive, move to another space, or delete. Archived tasks live in a collapsible **Archived** shelf under the list — open it to unarchive or revisit them. Save a task's structure as a **template** for repeatable workflows.

## Time tracking and billing

Kaseki tracks time per task three ways, set by the space's default and overridable per task:

- **Time-based** — an hourly rate.
- **Job-based** — a fixed price per task.
- **Unit-based** — a count × a per-unit value (e.g. units of dental activity).

Set the currency symbol in **Settings → General** and per-space defaults in **Settings → Profession spaces**.

Log time two ways: the **pomodoro timer** (start a 25-minute session against a task from its Time tab; it runs in the header with pause / +5 minutes / end, and logs automatically when it finishes), or **manual entry** (a date, a duration, a note). The **Reports** button in the dashboard header opens a time-and-billing report — hours per task per week, billable-this-month, a per-space / all-spaces toggle, and CSV export. Time-based work bills by the tracked minutes; fixed-price and per-unit work counts once, in the month the task is marked Done, and appears in the report whether or not any time was tracked against it.

## Calendar

Each dashboard shows its space's calendar; the home strip shows everything for the next week. Page the dashboard calendar backwards and forwards a week at a time with the **‹ Today ›** controls. Add events with a title, date, time, location, and recurrence (none / hourly / 6-hour / 12-hour / daily / weekly / monthly / yearly / custom). An end time earlier than the start rolls to the next day, so overnight sessions work. Recurring events repeat at the same wall-clock time in the timezone they were created in — a weekly 14:00 call stays at 14:00 through daylight-saving changes. Export a calendar to `.ics` from the calendar's download button.

## Knowledge area

A personal wiki, opened from the home screen or the Orb menu. Pages nest into a tree, are edited with a rich-text editor, and can cross-link to tasks, files, and each other. Search pages by title or body.

## Documents

Attach files to tasks, or open the document viewer directly. It renders PDFs (with page navigation, zoom, thumbnails, and find-in-document), images, text, code, Markdown, and CSV (as a sortable table). Annotate documents (highlights span multiple lines cleanly; notes; bookmarks), print, save a copy, rename or delete files from the sidebar's right-click menu, and group related files into **bundles** you can page through.

## The sensitive folder

A separately-encrypted vault for documents and credentials you want extra protection on. It has its own **passcode** (independent of your login password) and a 24-word **recovery phrase** written down at setup. While unlocked you can view files without their decrypted contents ever being written to disk; lock it instantly with **Cmd/Ctrl+L**. (See the self-hosting guide for the encryption details.)

## The Orb

The Orb is Kaseki's mascot in the corner — a face that reacts to what you do (a nod when a task is done, a focused look while a timer runs, a lock when the vault locks). It's decorative and friendly, not an AI assistant. Tap it for a menu: settings, help, the tour, switching theme, and quick links. Drag it to any corner, or hide it from **Settings → Orb**.

## Search, commands, and shortcuts

Press **Cmd/Ctrl+K** anywhere to search across everything — tasks, subtasks, events, notes, knowledge pages, files, spaces, bundles, and (when unlocked) the sensitive folder. **Settings → Search** switches any of those kinds off and sets how many results each kind shows. Results are grouped by type; arrow keys and Enter navigate. Type **`>`** to switch to *commands* (New task, New space, Switch to a space, Toggle theme…). Press **Cmd/Ctrl+/** for the full keyboard-shortcut reference.

## Settings

Reach settings from the Orb menu or **Cmd/Ctrl+,**. Highlights: theme / font size / currency and **changing your login password** (General), per-space billing and archived-space management (Profession spaces), accent and background (Customization), the Orb, the sensitive folder passcode, the keyboard-shortcut reference, and **Crash reporting** (off by default — see the self-hosting guide). Also:

- **Application launcher** — edit any space's dock (add apps and links, rename, change icons, reorder) without opening that space.
- **Backup and export** — back up now or on a daily / weekly schedule, choose how many backups to keep, restore from a backup, and export all tasks (CSV) or the calendar (`.ics`). The self-hosting guide covers what a backup contains and how restore works.
- **Notifications** — off by default. When on, a desktop notification a set time before each timed event (5 to 60 minutes), and optionally one summary a day, from an hour you choose, of tasks due today and overdue. They come from your own computer while Kaseki is open and unlocked; nothing is sent anywhere. **Send a test notification** checks your system will show them.
- **Search** — which kinds of thing Cmd/Ctrl+K looks through, and how many results per kind.
- **Updates** — your installed version and an optional daily check for a newer release (off by default). Kaseki never downloads or installs anything itself.
- **Weather widget** — switch the widget on, search for your town, choose °C or °F.

## Your data

Everything Kaseki knows lives in one folder on your machine, encrypted at rest. There are no accounts, no servers, and no telemetry. Three optional features use the network — crash reporting, the update check, and the weather widget — and all three are off until you turn them on. Back up from **Settings → Backup and export**, or copy that folder by hand; to move to a new machine, copy it across. The [self-hosting guide](./self-hosting.md) explains where it is and how to back it up.
