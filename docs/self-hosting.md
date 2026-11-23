# Kaseki — Self-Hosting Guide

Kaseki is built to be *yours*. It runs entirely on your machine, stores everything in one folder, and talks to no external service unless you switch one of its three optional network features on. This guide covers installing it, where your data lives, backing it up, and the privacy and encryption details.

## What "self-hosted" means here

- **No accounts, no cloud, no sync.** Kaseki never phones home. It does not sync to Google, Dropbox, Outlook, or anything else.
- **No telemetry, and nothing outbound by default.** Kaseki has exactly three optional network features, and all three are **off** until you turn them on:
  - **Crash reporting** — sanitised error reports to *your own* Sentry instance (see below).
  - **Update check** — once a day, asks GitHub whether a newer release exists (see [Updates](#updates)).
  - **Weather widget** — asks Open-Meteo for the forecast at a place you choose (see [Weather widget](#weather-widget-optional)).

  With all three off, Kaseki makes no network requests at all.
- **The file system is the source of truth.** To back up Kaseki you copy a folder. To move machines you copy that folder. To delete everything you delete that folder. You never need the app's UI to manage your data.

## Installing

Kaseki targets **Windows** (primary) and **Linux** (Fedora/KDE, Ubuntu, Debian — secondary). Packaged installers are produced with `electron-builder` (`npm run package:win` / `npm run package:linux`). Until prebuilt binaries are published, run from source:

```sh
git clone <repo> kaseki && cd kaseki
npm install          # rebuilds the native SQLCipher module for Electron
npm run build
./node_modules/.bin/electron out/main/index.js
```

A development run with hot reload is `npm run dev`.

## Where your data lives

Everything is under one platform-appropriate directory (the `KASEKI_DATA_DIR` environment variable overrides it, for portable installs):

| Platform | Location |
|---|---|
| Windows  | `%APPDATA%\Kaseki` |
| macOS    | `~/Library/Application Support/Kaseki` |
| Linux    | `$XDG_DATA_HOME/Kaseki` (default `~/.local/share/Kaseki`) |

Inside it:

```
kaseki.db        the encrypted SQLCipher database (tasks, events, notes, settings…)
uploads/         attached files, content-addressed by SHA-256
sensitive/       the encrypted sensitive-folder blobs
backgrounds/     custom background images
icons/           custom space/launcher icons
logs/            application logs
```

This directory *is* your Kaseki. It is comprehensible and self-contained on purpose.

## Encryption at rest

- **The main database is encrypted** with SQLCipher, keyed by your **login password**. Without it the `kaseki.db` file is unreadable. The key is derived at unlock and held only in the main process's memory.
- **The sensitive folder is encrypted separately**, with a different key derived from its own **passcode** (independent of your login password), using **scrypt** (memory-hard). Files are encrypted with a random per-install **Data Encryption Key (DEK)**; the DEK is wrapped by the passcode key *and* by a recovery key, so you can change the passcode without re-encrypting anything. Filenames and types are encrypted too — only the file size and a content hash sit in the (already-encrypted) database.
- **Recovery.** At passcode setup Kaseki shows a **24-word recovery phrase**. Write it down and keep it safe — it is generated on your machine, never stored or transmitted, and is the only way to reset a forgotten sensitive-folder passcode. A wrong passcode is detected by the decryption itself; no password hash is stored.
- While the sensitive folder is unlocked, decrypted contents exist only in memory and are served to the viewer over an in-process protocol — they are never written to disk (which is why vault files can't be printed, saved, or exported).

A caveat inherent to any desktop app: while Kaseki runs, decrypted data is in process memory, and the OS may page memory to a swap file under pressure. Kaseki never deliberately writes plaintext to disk.

## Backup and restore

Because the whole install is one directory, a backup is a copy of it. Kaseki can make that copy for you, or you can make it by hand.

### Built-in backup (Settings → Backup and export)

- **Back up now** copies the database and the `uploads/`, `sensitive/`, `backgrounds/`, and `icons/` folders into a new folder named `Kaseki-backup-YYYY-MM-DD-HHMMSS` inside the backup folder you choose (the first backup asks for one). It is safe to run while Kaseki is open: the database's write-ahead log is folded into the main file first, so the copy is complete. Logs are left out. Each backup carries a small `kaseki-backup.json` manifest (version, date, file count, size).
- **Back up automatically** — daily or weekly. Scheduled backups run while Kaseki is open and unlocked; if one fell due while the app was closed, it runs within a minute of the next unlock. A failed scheduled backup (a drive unplugged, a full disk) is shown in the pane and retried hourly.
- **Backups to keep** — after each backup, the oldest `Kaseki-backup-…` folders beyond this number are deleted. Nothing else in the backup folder is ever touched, so it can share a folder with other files.
- The backup folder must be **outside** the data directory (otherwise each backup would contain the last one); Kaseki refuses one inside it.
- Nothing is decrypted to make a backup. `kaseki.db` and `sensitive/` are copied exactly as they sit on disk, so the backup is as encrypted as the live data — and as useless without your login password.

**Restore from a backup…** asks for a backup folder (a built-in backup, or a hand-made copy of the data directory — anything with a `kaseki.db` in it), confirms, then replaces your data with the backup's and restarts. Unlock with the login password that backup was made under. Your current data is not deleted: it is moved into `restore-undo/before-restore-…` inside the data directory, so restoring the wrong backup can be undone. Only the most recent undo copy is kept. To restore *from* that undo copy, copy it out of the data directory first — Kaseki won't restore from a folder inside its own data directory.

### By hand

1. **Quit Kaseki** (so the database isn't mid-write).
2. **Copy the data directory** above to your backup location — an external drive, a NAS, an encrypted archive.
3. **Restore** by copying it back into place on any machine and launching Kaseki with the same login password (and sensitive-folder passcode, or recovery phrase).

Either way, keep your login password and the recovery phrase somewhere separate from the backup — without them an encrypted backup is just noise (which is the point).

### Export

Backups are only readable by Kaseki. For a copy other programs can read, **Settings → Backup and export** also exports **all tasks as CSV** (every space, archived tasks and spaces included and marked) and the **calendar as `.ics`**. These files are not encrypted.

## Crash reporting (optional)

Off by default. In **Settings → Crash reporting** you can turn it on and paste a **Sentry DSN** for your own Sentry instance. When enabled, an unhandled error sends a **sanitised** report — the app, OS, and Electron versions and the error's type, message, and stack — and nothing else. Your home directory and the data-directory path are scrubbed from every string, and no task content, notes, file contents, or names are ever included. **Review what would be sent** in the same pane shows the exact payload before you enable it. There is no default or shared endpoint; reports only ever go where you point them.

## Weather widget (optional)

Off by default, and not on the home screen until you add it. In **Settings → Weather widget** you switch it on and search for a place; the search sends the name you type to Open-Meteo's geocoding service. Once a place is chosen, the widget asks Open-Meteo for the current conditions and a short forecast at those coordinates, in your chosen units — no account, no API key, nothing from your data. A forecast is reused for half an hour. Switching the widget off stops all requests.

## Updates

Kaseki never downloads or installs updates itself. **Settings → Updates** has an optional **daily update check**, off by default: when on, Kaseki asks GitHub's public releases API (`api.github.com/repos/yanderebait/kaseki/releases/latest`) at most once a day whether a newer version exists. The request carries a `kaseki/<version>` User-Agent and nothing else. If there is a newer release, the pane says so and links to its release page; **Check now** runs the same check on demand.

To update, install the new version (or pull and rebuild from source). Your data directory is untouched by an update; if a release changes the database, its migration runs on first launch. Making a backup first is cheap insurance.

## Uninstalling

Remove the application, then delete the data directory listed above. That deletes everything Kaseki knows. (Empty your backups too, if you want it truly gone.)

## A note on longevity

Kaseki's data lives in standard formats — a SQLite database and plain files on disk — under a permissive licence, so your data outlives any one build of the app. That durability is a design goal, not an afterthought.
