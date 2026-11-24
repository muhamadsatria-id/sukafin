#!/usr/bin/env python3
"""Buat/mengisi db/sukafin.sqlite dari file migrasi + seeder."""
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "db" / "sukafin.sqlite"
MIGRATIONS = ROOT / "db" / "migrations"
SEEDS = ROOT / "db" / "seeds"


def apply_sql_files(conn, folder):
    for path in sorted(folder.glob("*.sql")):
        conn.executescript(path.read_text(encoding="utf-8"))
        print(f"Applied {path.relative_to(ROOT)}")


def main():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        apply_sql_files(conn, MIGRATIONS)
        apply_sql_files(conn, SEEDS)
        conn.commit()

        version = conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0]
        users = conn.execute("SELECT username, role FROM users ORDER BY id").fetchall()
        print(f"Database siap: {DB_PATH.relative_to(ROOT)}")
        print(f"Schema version: {version}")
        print(f"Users: {users}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
