# Kaseki — Self-Hosting Guide

Kaseki is built to be *yours*. It runs entirely on your machine, stores everything in one folder, and talks to no external service. This guide covers installing it, where your data lives, backing it up, and the privacy and encryption details.

## What "self-hosted" means here

- **No accounts, no cloud, no sync.** Kaseki never phones home. It does not sync to Google, Dropbox, Outlook, or anything else.
- **No telemetry by default.** The only outbound network feature is crash reporting, which is **off** until you turn it on and point it at *your own* Sentry instance (see below).
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

Because the whole install is one directory, backup is a copy:

1. **Quit Kaseki** (so the database isn't mid-write).
2. **Copy the data directory** above to your backup location — an external drive, a NAS, an encrypted archive. The `kaseki.db` and `sensitive/` contents are already encrypted, so the backup is encrypted too.
3. **Restore** by copying it back into place on any machine and launching Kaseki with the same login password (and sensitive-folder passcode, or recovery phrase).

Keep your login password and the recovery phrase somewhere separate from the backup — without them an encrypted backup is just noise (which is the point).

> A built-in backup/restore and scheduled-backup UI is planned; until then, the copy-the-folder method above is the supported path and is all you need.

## Crash reporting (optional)

Off by default. In **Settings → Crash reporting** you can turn it on and paste a **Sentry DSN** for your own Sentry instance. When enabled, an unhandled error sends a **sanitised** report — the app, OS, and Electron versions and the error's type, message, and stack — and nothing else. Your home directory and the data-directory path are scrubbed from every string, and no task content, notes, file contents, or names are ever included. **Review what would be sent** in the same pane shows the exact payload before you enable it. There is no default or shared endpoint; reports only ever go where you point them.

## Updates

Kaseki does not auto-update from source builds. When packaged builds are published, update by installing the new version — your data directory is untouched by an update.

## Uninstalling

Remove the application, then delete the data directory listed above. That deletes everything Kaseki knows. (Empty your backups too, if you want it truly gone.)

## A note on longevity

Kaseki's data lives in standard formats — a SQLite database and plain files on disk — under a permissive licence, so your data outlives any one build of the app. That durability is a design goal, not an afterthought.
