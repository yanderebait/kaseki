# Kaseki — Developer Guide

This guide is for working on Kaseki itself. For using the app, see the [user guide](./user-guide.md); for running and backing up an install, the [self-hosting guide](./self-hosting.md).

## Stack

- **Electron 41** (Chromium + Node), packaged with **electron-vite** / **Vite 7**.
- **React 19** + **TypeScript 6** (strict) in the renderer.
- **better-sqlite3-multiple-ciphers** (SQLCipher-compatible) for the encrypted database.
- A handful of focused libraries: `pdfjs-dist` (viewer), Tiptap + ProseMirror (rich text), `marked` + `DOMPurify` (Markdown), `rrule` (recurrence). The Orb and all icons are hand-rolled — no icon-font or animation dependency.

## Process model

Three processes, three source roots:

- **`src/main`** — the Node/Electron main process: the database, the file system, OS dialogs, IPC handlers, and all privileged work. The decrypted SQLCipher key and the sensitive-folder DEK live only here, in memory.
- **`src/preload`** — a `contextBridge` that exposes a single typed object, `window.kaseki`, to the renderer. Nothing else crosses the boundary; there is no raw `ipcRenderer` in the renderer.
- **`src/renderer/src`** — the React UI. It never sees a file path, a database handle, or a key — it works with ids and calls `window.kaseki.*`.
- **`src/shared`** — types and pure helpers imported by all three (the IPC contract in `types.ts`, the profession presets, the billing math, the legal parser).

### The IPC contract

`src/shared/types.ts` is the single source of truth for the shapes that cross processes. A main-process `db` function returns an object structurally matching a type there; `src/main/ipc.ts` registers a handler; `src/preload/index.ts` re-exposes it on `window.kaseki`; the renderer consumes it. `export type KasekiApi = typeof api` in the preload types the whole surface. Add a feature by extending all four in lockstep.

## Data layer

- **One SQLCipher database** at `<data>/kaseki.db`, opened with the login password as the key. The renderer can't reach it.
- **Forward-only migrations** in `src/main/db/migrations.ts`, tracked by `PRAGMA user_version`. Never edit a shipped migration — append a new one. (There are seven: core schema, launcher columns, calendar recurrence, the vault, legal acceptance, task templates, and task billing columns.)
- **`src/main/db/*.ts`** — one module per domain (`tasks`, `spaces`, `events`, `knowledge`, `files`, `bundles`, `links`, `launcher`, `search`, `prefs`, `connection`). Each owns its SQL.
- **Content-addressed files** — uploads are stored under `<data>/uploads/<sha256>`; the DB holds metadata, so duplicates dedupe automatically.
- The schema is documented in Appendix C of `kaseki-spec.md`.

## Conventions

- **Id-indirection at the IPC boundary.** The renderer passes ids; the main process resolves them to paths and bytes. A custom `kaseki-file://` protocol streams file contents to the renderer by id.
- **The sensitive folder's plaintext never touches disk.** Decrypted bytes are read into memory and served over a protocol namespace only while unlocked; there is no print/save/export for vault files for this reason.
- **`window.kaseki` is the only surface.** If the renderer needs something from the OS or DB, add an explicit bridge method — never widen the boundary.
- **Design tokens, not literals.** Colours, spacing, radii, and the type scale are CSS variables in `src/renderer/src/styles/tokens.css`; components consume the variables.
- **`kaseki-spec.md` is the design record.** Each phase ends by reconciling the spec with what shipped, so the spec stays an accurate account, not a wish list.

## Project layout

```
src/
  main/        Electron main: db/, vault/, ipc.ts, index.ts, *Actions.ts
  preload/     the window.kaseki bridge
  renderer/src components/, screens/, hooks/, styles/, *.ts(x)
  shared/      types.ts, presets.ts, billing.ts, legal.ts
kaseki-spec.md the full design specification (Parts 1–20, Appendices A–C)
docs/          these guides
```

## Commands

```sh
npm install            # native module is rebuilt for Electron via postinstall
npm run dev            # electron-vite dev with HMR
npm run typecheck      # tsc --noEmit for the node and web tsconfigs
npm run build          # production build into out/
npm run selftest       # build, then run the self-test suite headless
```

To run a production build directly: `./node_modules/.bin/electron out/main/index.js` (the bare `electron` binary may not be on `PATH`).

## The self-test suite

Kaseki's tests are a single self-contained harness, not a test runner. `src/main/selftest.ts` exercises the data layer and pure logic in a real (temporary) SQLCipher database and prints `PASS`/`FAIL` per check. Run it with `npm run selftest`, or:

```sh
KASEKI_DATA_DIR=/tmp/kaseki-test KASEKI_SELFTEST=1 ./node_modules/.bin/electron out/main/index.js
```

It covers migrations, task CRUD and the DAG cycle guard, tags and custom fields, scoped and global search, time tracking and the billing math, the vault crypto primitives, recurrence expansion, Markdown serialization, crash-report sanitisation, and more. Add a check next to the related ones when you add data-layer behaviour; UI is verified by screenshot.

## Development seams

Gated behind `!app.isPackaged`, several environment variables make the app launchable and screenshottable without manual setup:

- `KASEKI_DEV_PASSWORD` / `KASEKI_DEV_NAME` — create or unlock a dev database and skip the login screen.
- `KASEKI_DEV_SEED=<n>` — seed `n` realistic profession spaces (with tasks, events, files).
- `KASEKI_DEV_FILES=1` — ingest sample documents.
- `KASEKI_DEV_ONBOARD=1` — leave the database unmarked so onboarding runs.
- `KASEKI_DEV_SHOT=<path>` / `KASEKI_DEV_SHOT_DELAY=<ms>` — capture a screenshot via `webContents.capturePage` (occlusion-immune under Wayland) and exit.
- `KASEKI_SELFTEST=1` — run the self-test suite and exit.
- `KASEKI_DATA_DIR=<path>` — point the data directory anywhere (used by the seams above).

## Adding a feature

The repeatable pattern: read the relevant spec section; build the data layer first (a `db/` module + self-tests) so it's verified before any UI; extend `types.ts`, `ipc.ts`, and the preload bridge together; build the UI in small commits, each leaving the app working and screenshot-verified; then reconcile `kaseki-spec.md` with what shipped.
