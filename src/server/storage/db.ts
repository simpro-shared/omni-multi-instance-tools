import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH ?? './data/migrator.db';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      dest_ids TEXT NOT NULL,
      doc_ids TEXT NOT NULL,
      empty_first INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      parent_job_id TEXT,
      post_migration_actions TEXT
    );

    CREATE TABLE IF NOT EXISTS job_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      dest_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      doc_id TEXT,
      doc_name TEXT,
      status TEXT NOT NULL,
      error TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      export_hash TEXT
    );

    CREATE INDEX IF NOT EXISTS job_items_job ON job_items(job_id);
    CREATE INDEX IF NOT EXISTS job_items_status ON job_items(job_id, status);
  `);
  // add column for existing DBs that predate this field
  try { d.exec(`ALTER TABLE jobs ADD COLUMN post_migration_actions TEXT`); } catch { /* already exists */ }
  try { d.exec(`ALTER TABLE jobs ADD COLUMN post_migration_results TEXT`); } catch { /* already exists */ }
}
