import type { Database } from 'better-sqlite3-multiple-ciphers'
import { log } from '../logger'

// Forward-only migrations. PRAGMA user_version records the last applied
// index + 1. Never edit a shipped migration — append a new one.
const migrations: string[] = [
  // 001 — core schema from Appendix C of the spec
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    login_password_hash TEXT NOT NULL,
    sensitive_passcode_hash TEXT,
    preferences JSON
  );

  CREATE TABLE spaces (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    preset_id TEXT,
    accent_color TEXT,
    icon TEXT,
    position INTEGER,
    archived BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    preferences JSON
  );

  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    space_id INTEGER REFERENCES spaces(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT,
    pinned BOOLEAN DEFAULT 0,
    archived BOOLEAN DEFAULT 0,
    due_date TIMESTAMP,
    priority TEXT,
    estimated_time INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE custom_field_definitions (
    id INTEGER PRIMARY KEY,
    space_id INTEGER REFERENCES spaces(id),
    name TEXT NOT NULL,
    field_type TEXT NOT NULL,
    options JSON,
    position INTEGER
  );

  CREATE TABLE custom_field_values (
    id INTEGER PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id),
    field_id INTEGER REFERENCES custom_field_definitions(id),
    value TEXT
  );

  CREATE TABLE subtasks (
    id INTEGER PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id),
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    position INTEGER
  );

  CREATE TABLE task_dependencies (
    upstream_id INTEGER REFERENCES tasks(id),
    downstream_id INTEGER REFERENCES tasks(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (upstream_id, downstream_id)
  );

  CREATE TABLE task_notes (
    id INTEGER PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id),
    content JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    space_id INTEGER REFERENCES spaces(id),
    global BOOLEAN DEFAULT 0
  );

  CREATE TABLE task_tags (
    task_id INTEGER REFERENCES tasks(id),
    tag_id INTEGER REFERENCES tags(id),
    PRIMARY KEY (task_id, tag_id)
  );

  CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    hash TEXT UNIQUE NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sensitive BOOLEAN DEFAULT 0
  );

  CREATE TABLE task_files (
    task_id INTEGER REFERENCES tasks(id),
    file_id INTEGER REFERENCES files(id),
    PRIMARY KEY (task_id, file_id)
  );

  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    space_id INTEGER REFERENCES spaces(id),
    title TEXT NOT NULL,
    description TEXT,
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP,
    all_day BOOLEAN DEFAULT 0,
    location TEXT,
    recurrence_rule TEXT,
    recurrence_parent_id INTEGER REFERENCES events(id)
  );

  CREATE TABLE knowledge_pages (
    id INTEGER PRIMARY KEY,
    parent_id INTEGER REFERENCES knowledge_pages(id),
    title TEXT NOT NULL,
    content JSON,
    position INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE links (
    id INTEGER PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE bundles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    space_id INTEGER REFERENCES spaces(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE bundle_files (
    bundle_id INTEGER REFERENCES bundles(id),
    file_id INTEGER REFERENCES files(id),
    position INTEGER,
    PRIMARY KEY (bundle_id, file_id)
  );

  CREATE TABLE document_annotations (
    id INTEGER PRIMARY KEY,
    file_id INTEGER REFERENCES files(id),
    page INTEGER,
    type TEXT,
    position JSON,
    content TEXT,
    color TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE time_entries (
    id INTEGER PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id),
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP,
    duration INTEGER,
    is_pomodoro BOOLEAN DEFAULT 0,
    note TEXT
  );

  CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE launcher_items (
    id INTEGER PRIMARY KEY,
    space_id INTEGER REFERENCES spaces(id),
    name TEXT NOT NULL,
    path_or_url TEXT NOT NULL,
    icon TEXT,
    position INTEGER
  );

  CREATE TABLE widgets (
    id INTEGER PRIMARY KEY,
    widget_type TEXT NOT NULL,
    position INTEGER,
    config JSON
  );
  `,
  // 002 — launcher items gain a kind ('url' | 'app') and, for apps, the
  // platform the path was set on, so an item set on another OS can be shown
  // as unavailable rather than launched blindly (Part 20 cross-platform
  // paths). path_or_url and icon are unchanged.
  `
  ALTER TABLE launcher_items ADD COLUMN kind TEXT;
  ALTER TABLE launcher_items ADD COLUMN platform TEXT;
  `,
  // 003 — events gain per-occurrence support (Part 16). An override/exception
  // child (recurrence_parent_id set) records original_start_at, the series
  // slot it replaces; cancelled marks a deleted occurrence; completed marks
  // an event (or a single occurrence via its override) done.
  `
  ALTER TABLE events ADD COLUMN original_start_at TIMESTAMP;
  ALTER TABLE events ADD COLUMN cancelled BOOLEAN DEFAULT 0;
  ALTER TABLE events ADD COLUMN completed BOOLEAN DEFAULT 0;
  `,
  // 004 — the sensitive folder (Part 11). A single vault row holds the salts
  // and the Data Encryption Key wrapped twice (by the passcode-derived key and
  // by the recovery-phrase-derived key); the passcode itself is never stored.
  // Each sensitive file's bytes live encrypted in sensitive/ under a random
  // blob name; its name and MIME are stored encrypted under the DEK (so a
  // leaked login password still reveals nothing), with the plaintext size and
  // content hash kept only inside this already-SQLCipher-encrypted database.
  `
  CREATE TABLE vault (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    passcode_salt BLOB NOT NULL,
    recovery_salt BLOB NOT NULL,
    dek_wrapped_passcode BLOB NOT NULL,
    dek_wrapped_recovery BLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE vault_files (
    id INTEGER PRIMARY KEY,
    name_enc BLOB NOT NULL,
    mime_enc BLOB NOT NULL,
    size INTEGER NOT NULL,
    content_hash TEXT UNIQUE NOT NULL,
    blob_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `,

  // Migration 005 (Phase 8, onboarding). One row per acceptance of the bundled
  // legal documents: doc_version is a fingerprint of the exact text shown, so a
  // later revision asks for fresh acceptance while old rows remain as history.
  //
  // The second statement backfills the onboarded flag for databases that
  // predate onboarding. It is safe to run on a fresh database because
  // createDatabase() runs migrations *before* inserting the user row — so on a
  // new install the users table is still empty here and the UPDATE matches
  // nothing, leaving onboarding to run. On an existing install the user row is
  // already present and gets stamped, so returning users are never re-onboarded.
  `
  CREATE TABLE legal_acceptance (
    id INTEGER PRIMARY KEY,
    doc_version TEXT NOT NULL,
    accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  UPDATE users
  SET preferences = json_set(COALESCE(preferences, '{}'), '$.onboardedAt', CURRENT_TIMESTAMP)
  WHERE json_extract(COALESCE(preferences, '{}'), '$.onboardedAt') IS NULL;
  `,

  // Migration 006 (Phase 10a, tasks). Task templates capture a task's structure
  // (title, description, status, priority, default subtasks, tags, field values)
  // as a JSON blob for repeatable workflows; they are space-scoped. Everything
  // else the task system needs already exists from migration 001.
  `
  CREATE TABLE task_templates (
    id INTEGER PRIMARY KEY,
    space_id INTEGER REFERENCES spaces(id),
    name TEXT NOT NULL,
    content JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `,

  // Migration 007 (Phase 10b, time tracking and billing). A task may override
  // its space's default billing pattern: billing_mode is one of
  // time/job/unit/none (NULL = inherit the space default); billing_rate is the
  // hourly rate, fixed price, or per-unit value depending on the mode; and
  // billing_units is the count for unit-based billing. The space default lives
  // in spaces.preferences.billing, so no new column is needed there. The
  // time_entries table already exists from migration 001.
  `
  ALTER TABLE tasks ADD COLUMN billing_mode TEXT;
  ALTER TABLE tasks ADD COLUMN billing_rate REAL;
  ALTER TABLE tasks ADD COLUMN billing_units INTEGER;
  `
]

export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i])
      db.pragma(`user_version = ${i + 1}`)
    })()
    log.info(`Applied migration ${i + 1}`)
  }
}
