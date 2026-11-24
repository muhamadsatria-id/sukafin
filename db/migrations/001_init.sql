-- Sukafin migration 001: skema awal SQLite (idempoten)
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipe TEXT NOT NULL CHECK (tipe IN ('pemasukan', 'pengeluaran')),
    nama TEXT NOT NULL,
    nominal REAL NOT NULL,
    pos TEXT,
    tanggal TEXT NOT NULL,
    alokasi TEXT
);

CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);

INSERT INTO meta(key, value) VALUES ('schema_version', '1')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
