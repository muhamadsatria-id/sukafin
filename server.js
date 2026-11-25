'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'db', 'sukafin.sqlite');
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');
const SEEDS_DIR = path.join(ROOT, 'db', 'seeds');
const PUBLIC_DIR = ROOT;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

const sessions = new Map(); // token -> userId (demo session, hilang saat server restart)

// ---------- Database bootstrap: migrasi + seeder ----------
function initializeDatabase() {
    db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    let currentVersion = row ? Number(row.value) : 0;

    const migrations = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    for (const file of migrations) {
        const version = Number(path.basename(file).split('_')[0]);
        if (!Number.isFinite(version) || version <= currentVersion) continue;

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        db.exec('BEGIN');
        try {
            db.exec(sql);
            db.prepare(`INSERT INTO meta(key, value) VALUES('schema_version', ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(version));
            db.exec('COMMIT');
            currentVersion = version;
            console.log(`[db] migrasi ${file} diterapkan (v${version})`);
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
    }

    const seeds = fs.readdirSync(SEEDS_DIR).filter(f => f.endsWith('.sql')).sort();
    for (const file of seeds) {
        db.exec(fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8'));
        console.log(`[db] seeder ${file} siap`);
    }

    const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
    console.log(`[db] siap • schema v${currentVersion} • ${users} akun • ${DB_PATH}`);
}

// ---------- Helpers ----------
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function publicUser(row) {
    return { id: row.id, username: row.username, role: row.role, createdAt: row.created_at };
}

function publicRecord(row) {
    return {
        id: row.id,
        tipe: row.tipe,
        nama: row.nama,
        nominal: row.nominal,
        pos: row.pos || null,
        tanggal: row.tanggal,
        alokasi: row.alokasi ? JSON.parse(row.alokasi) : null,
    };
}

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-store',
    });
    res.end(payload);
}

function fail(res, status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    sendJson(res, status, { error });
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 1024 * 1024) reject(new Error('Payload terlalu besar'));
        });
        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (err) {
                reject(new Error('JSON tidak valid'));
            }
        });
        req.on('error', reject);
    });
}

function currentUser(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    const userId = sessions.get(token);
    if (!userId) return null;
    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}

function requireAuth(req, res) {
    const user = currentUser(req);
    if (!user) {
        fail(res, 401, 'UNAUTHENTICATED', 'Silakan login terlebih dahulu.');
        return null;
    }
    return user;
}

function requireSuperadmin(req, res) {
    const user = requireAuth(req, res);
    if (!user) return null;
    if (user.role !== 'superadmin') {
        fail(res, 403, 'FORBIDDEN', 'Hanya superadmin yang bisa melakukan ini.');
        return null;
    }
    return user;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

// ---------- API ----------
async function handleApi(req, res, url) {
    const method = req.method;
    const route = url.pathname;

    if (method === 'POST' && route === '/api/login') {
        const body = await readBody(req);
        if (!isNonEmptyString(body.username) || !isNonEmptyString(body.password)) {
            return fail(res, 422, 'VALIDATION_ERROR', 'Username dan password wajib diisi.');
        }
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(body.username.trim());
        if (!user || user.password_hash !== hashPassword(body.password)) {
            return fail(res, 401, 'INVALID_CREDENTIALS', 'Username atau password salah.');
        }
        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, user.id);
        return sendJson(res, 200, { token, user: publicUser(user) });
    }

    if (method === 'POST' && route === '/api/logout') {
        const header = req.headers.authorization || '';
        if (header.startsWith('Bearer ')) sessions.delete(header.slice(7));
        return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && route === '/api/me') {
        const user = requireAuth(req, res);
        if (!user) return;
        return sendJson(res, 200, { user: publicUser(user) });
    }

    if (method === 'GET' && route === '/api/records') {
        const user = requireAuth(req, res);
        if (!user) return;
        const rows = db.prepare(`
            SELECT id, tipe, nama, nominal, pos, tanggal, alokasi
            FROM records WHERE user_id = ? ORDER BY id DESC
        `).all(user.id);
        return sendJson(res, 200, { data: rows.map(publicRecord) });
    }

    if (method === 'POST' && route === '/api/records') {
        const user = requireAuth(req, res);
        if (!user) return;
        const body = await readBody(req);
        const allowedPos = ['kebutuhan_pokok', 'investasi', 'dana_darurat', 'uang_bebas'];

        if (!['pemasukan', 'pengeluaran'].includes(body.tipe)) {
            return fail(res, 422, 'VALIDATION_ERROR', 'Tipe transaksi tidak valid.');
        }
        if (!isNonEmptyString(body.nama)) {
            return fail(res, 422, 'VALIDATION_ERROR', 'Nama transaksi wajib diisi.');
        }
        const nominal = Number(body.nominal);
        if (!Number.isFinite(nominal) || nominal <= 0) {
            return fail(res, 422, 'VALIDATION_ERROR', 'Nominal harus lebih dari 0.');
        }
        if (body.tipe === 'pengeluaran' && !allowedPos.includes(body.pos)) {
            return fail(res, 422, 'VALIDATION_ERROR', 'Pos pengeluaran tidak valid.');
        }

        const alokasi = body.tipe === 'pemasukan'
            ? {
                kebutuhan_pokok: nominal * 0.5,
                investasi: nominal * 0.3,
                dana_darurat: nominal * 0.15,
                uang_bebas: nominal * 0.05,
            }
            : null;

        const id = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM records').get().id;
        const tanggal = isNonEmptyString(body.tanggal) ? body.tanggal.trim() : new Date().toISOString();
        db.prepare(`
            INSERT INTO records(id, user_id, tipe, nama, nominal, pos, tanggal, alokasi)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            user.id,
            body.tipe,
            body.nama.trim(),
            nominal,
            body.tipe === 'pengeluaran' ? body.pos : null,
            tanggal,
            alokasi ? JSON.stringify(alokasi) : null,
        );

        const created = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
        return sendJson(res, 201, { data: publicRecord(created) });
    }

    const deleteRecordMatch = route.match(/^\/api\/records\/(\d+)$/);
    if (method === 'DELETE' && deleteRecordMatch) {
        const user = requireAuth(req, res);
        if (!user) return;
        const result = db.prepare('DELETE FROM records WHERE id = ? AND user_id = ?')
            .run(Number(deleteRecordMatch[1]), user.id);
        if (result.changes === 0) {
            return fail(res, 404, 'NOT_FOUND', 'Transaksi tidak ditemukan.');
        }
        return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && route === '/api/users') {
        if (!requireSuperadmin(req, res)) return;
        const rows = db.prepare(`
            SELECT u.id, u.username, u.role, u.created_at,
                   (SELECT COUNT(*) FROM records r WHERE r.user_id = u.id) AS record_count
            FROM users u ORDER BY u.id
        `).all();
        return sendJson(res, 200, {
            data: rows.map(row => ({ ...publicUser(row), recordCount: row.record_count })),
        });
    }

    if (method === 'POST' && route === '/api/users') {
        if (!requireSuperadmin(req, res)) return;
        const body = await readBody(req);
        if (!isNonEmptyString(body.username) || !isNonEmptyString(body.password)) {
            return fail(res, 422, 'VALIDATION_ERROR', 'Username dan password wajib diisi.');
        }
        const username = body.username.trim();
        const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
        if (exists) return fail(res, 409, 'CONFLICT', 'Username sudah dipakai.');

        const info = db.prepare(`
            INSERT INTO users(username, password_hash, role, created_at)
            VALUES(?, ?, 'user', ?)
        `).run(username, hashPassword(body.password), new Date().toISOString());
        const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        return sendJson(res, 201, { data: publicUser(created) });
    }

    const deleteUserMatch = route.match(/^\/api\/users\/(\d+)$/);
    if (method === 'DELETE' && deleteUserMatch) {
        const actor = requireSuperadmin(req, res);
        if (!actor) return;
        const targetId = Number(deleteUserMatch[1]);
        if (targetId === actor.id) {
            return fail(res, 400, 'INVALID_OPERATION', 'Tidak bisa menghapus akun sendiri.');
        }
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
        if (!target) return fail(res, 404, 'NOT_FOUND', 'User tidak ditemukan.');
        if (target.role === 'superadmin') {
            return fail(res, 403, 'FORBIDDEN', 'Superadmin lain tidak bisa dihapus.');
        }
        db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
        return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && route === '/api/meta') {
        const user = requireAuth(req, res);
        if (!user) return;
        const version = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value || '0';
        const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
        const records = db.prepare('SELECT COUNT(*) c FROM records').get().c;
        return sendJson(res, 200, {
            schemaVersion: version,
            users,
            records,
            database: 'SQLite',
            backupAvailable: true,
        });
    }

    if (method === 'GET' && route === '/api/backup') {
        if (!requireSuperadmin(req, res)) return;
        const file = fs.readFileSync(DB_PATH);
        res.writeHead(200, {
            'Content-Type': 'application/x-sqlite3',
            'Content-Disposition': 'attachment; filename="sukafin.sqlite"',
            'Content-Length': file.length,
        });
        return res.end(file);
    }

    return fail(res, 404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
}

// ---------- Static files ----------
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

function serveStatic(req, res, url) {
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^([/\\])+/, ''));
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
}

// ---------- Server ----------
initializeDatabase();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url);
        } else {
            serveStatic(req, res, url);
        }
    } catch (err) {
        console.error(err);
        if (!res.headersSent) fail(res, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server.');
        else res.end();
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[server] SUKAFIN siap di http://localhost:${PORT}`);
});
