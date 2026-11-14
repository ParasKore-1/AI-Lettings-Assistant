import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS: string[] = [
  /* 1 */ `
  CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    shared      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX conversations_order ON conversations (pinned DESC, updated_at DESC, id DESC);

  CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_id       TEXT,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    tool_results    TEXT NOT NULL DEFAULT '[]',
    attachment_ids  TEXT NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL,
    feedback        TEXT,
    error           TEXT,
    model           TEXT,
    provider_trace  TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX messages_by_conversation ON messages (conversation_id, created_at);

  CREATE TABLE attachments (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    size        INTEGER NOT NULL,
    data        BLOB NOT NULL,
    created_at  TEXT NOT NULL
  );
  `,
];

export type Database = DatabaseSync;

export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db: Database) {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
