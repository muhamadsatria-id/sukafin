'use strict';

const crypto = require('node:crypto');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let sqlClientPromise;
let databaseReady;

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(payload);
}

function fail(res, status, code, message) {
    return sendJson(res, status, { error: { code, message } });
}

function getDatabaseUrl() {
    const knownNames = [
        'DATABASE_URL',
        'POSTGRES_URL',
        'NEON_DATABASE_URL',
        'NEON_POSTGRES_URL',
        'DATABASE_URL_UNPOOLED',
        'POSTGRES_URL_NON_POOLING',
        'POSTGRES_PRISMA_URL',
        'POSTGRES_PRISMA_URL_NON_POOLING',
    ];
    for (const name of knownNames) {
        if (process.env[name]) return process.env[name];
    }

    const prefixedNames = Object.keys(process.env).filter(name =>
        /_(DATABASE_URL|POSTGRES_URL)$/.test(name) && process.env[name]
    );
    return prefixedNames.length === 1 ? process.env[prefixedNames[0]] : null;
}

async function getSqlClient() {
    if (!sqlClientPromise) {
        sqlClientPromise = import('@neondatabase/serverless').then(({ neon }) => neon(getDatabaseUrl()));
    }
    return sqlClientPromise;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
    const [algorithm, salt, expectedHex] = String(storedHash || '').split('$');
    if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(row) {
    return {
        id: Number(row.id),
        username: row.username,
        role: row.role,
        createdAt: row.created_at,
    };
}

function publicRecord(row) {
    return {
        id: Number(row.id),
        tipe: row.tipe,
        nama: row.nama,
        nominal: Number(row.nominal),
        pos: row.pos || null,
        tanggal: row.tanggal,
        alokasi: typeof row.alokasi === 'string' ? JSON.parse(row.alokasi) : row.alokasi || null,
    };
}

async function initializeDatabase(sql, adminUsername, adminPassword) {
    await sql`
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS records (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            tipe TEXT NOT NULL CHECK (tipe IN ('pemasukan', 'pengeluaran')),
            nama TEXT NOT NULL,
            nominal DOUBLE PRECISION NOT NULL,
            pos TEXT,
            tanggal TEXT NOT NULL,
            alokasi JSONB
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`;
    await sql`
        INSERT INTO meta(key, value) VALUES ('schema_version', '1')
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
    `;

    const username = adminUsername.trim().toLowerCase();
    await sql`
        INSERT INTO users(username, password_hash, role)
        VALUES (${username}, ${hashPassword(adminPassword)}, 'superadmin')
        ON CONFLICT(username) DO NOTHING
    `;
}

async function ensureDatabase(sql, adminUsername, adminPassword) {
    if (!databaseReady) {
        databaseReady = initializeDatabase(sql, adminUsername, adminPassword).catch(error => {
            databaseReady = null;
            throw error;
        });
    }
    await databaseReady;
}

function requestBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return {};
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

async function currentUser(req, sql) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return null;

    const rows = await sql`
        SELECT u.id, u.username, u.role, u.created_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()
    `;
    return rows[0] || null;
}

async function requireAuth(req, res, sql) {
    const user = await currentUser(req, sql);
    if (!user) fail(res, 401, 'UNAUTHENTICATED', 'Silakan login terlebih dahulu.');
    return user;
}

async function requireSuperadmin(req, res, sql) {
    const user = await requireAuth(req, res, sql);
    if (!user) return null;
    if (user.role !== 'superadmin') {
        fail(res, 403, 'FORBIDDEN', 'Hanya superadmin yang bisa melakukan ini.');
        return null;
    }
    return user;
}

async function handleApi(req, res, url, sql) {
    const { method } = req;
    const route = url.pathname;

    if (method === 'GET' && route === '/api/health') {
        await sql`SELECT 1`;
        return sendJson(res, 200, { status: 'ok' });
    }

    if (method === 'POST' && route === '/api/login') {
        const body = requestBody(req);
        if (!isNonEmptyString(body.username) || !isNonEmptyString(body.password)) {
            return fail(res, 422, 'VALIDATION_ERROR', 'Username dan password wajib diisi.');
        }
        const rows = await sql`
            SELECT * FROM users WHERE username = ${body.username.trim().toLowerCase()}
        `;
        const user = rows[0];
        if (!user || !verifyPassword(body.password, user.password_hash)) {
            return fail(res, 401, 'INVALID_CREDENTIALS', 'Username atau password salah.');
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        await sql`
            INSERT INTO sessions(token_hash, user_id, expires_at)
            VALUES (${hashToken(token)}, ${user.id}, ${expiresAt})
        `;
        return sendJson(res, 200, { token, user: publicUser(user) });
    }

    if (method === 'POST' && route === '/api/logout') {
        const header = req.headers.authorization || '';
        if (header.startsWith('Bearer ')) {
            await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(header.slice(7))}`;
        }
        return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && route === '/api/me') {
        const user = await requireAuth(req, res, sql);
        if (!user) return;
        return sendJson(res, 200, { user: publicUser(user) });
    }

    if (method === 'GET' && route === '/api/records') {
        const user = await requireAuth(req, res, sql);
        if (!user) return;
        const rows = await sql`
            SELECT id, tipe, nama, nominal, pos, tanggal, alokasi
            FROM records WHERE user_id = ${user.id} ORDER BY id DESC
        `;
        return sendJson(res, 200, { data: rows.map(publicRecord) });
    }

    if (method === 'POST' && route === '/api/records') {
        const user = await requireAuth(req, res, sql);
        if (!user) return;
        const body = requestBody(req);
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
        const tanggal = isNonEmptyString(body.tanggal) ? body.tanggal.trim() : new Date().toISOString();
        const rows = await sql`
            INSERT INTO records(user_id, tipe, nama, nominal, pos, tanggal, alokasi)
            VALUES (
                ${user.id},
                ${body.tipe},
                ${body.nama.trim()},
                ${nominal},
                ${body.tipe === 'pengeluaran' ? body.pos : null},
                ${tanggal},
                ${alokasi ? JSON.stringify(alokasi) : null}
            )
            RETURNING id, tipe, nama, nominal, pos, tanggal, alokasi
        `;
        return sendJson(res, 201, { data: publicRecord(rows[0]) });
    }

    const deleteRecordMatch = route.match(/^\/api\/records\/(\d+)$/);
    if (method === 'DELETE' && deleteRecordMatch) {
        const user = await requireAuth(req, res, sql);
        if (!user) return;
        const rows = await sql`
            DELETE FROM records WHERE id = ${Number(deleteRecordMatch[1])} AND user_id = ${user.id}
            RETURNING id
        `;
        if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Transaksi tidak ditemukan.');
        return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && route === '/api/users') {
        if (!await requireSuperadmin(req, res, sql)) return;
        const rows = await sql`
            SELECT u.id, u.username, u.role, u.created_at,
                   (SELECT COUNT(*) FROM records r WHERE r.user_id = u.id) AS record_count
            FROM users u ORDER BY u.id
        `;
        return sendJson(res, 200, {
            data: rows.map(row => ({ ...publicUser(row), recordCount: Number(row.record_count) })),
        });
    }

    if (method === 'POST' && route === '/api/users') {
        if (!await requireSuperadmin(req, res, sql)) return;
        const body = requestBody(req);
        if (!isNonEmptyString(body.username) || !isNonEmptyString(body.password)) {
            return fail(res, 422, 'VALIDATION_ERROR', 'Username dan password wajib diisi.');
        }
        const username = body.username.trim().toLowerCase();
        try {
            const rows = await sql`
                INSERT INTO users(username, password_hash, role)
                VALUES (${username}, ${hashPassword(body.password)}, 'user')
                RETURNING id, username, role, created_at
            `;
            return sendJson(res, 201, { data: publicUser(rows[0]) });
        } catch (error) {
            if (error.code === '23505') return fail(res, 409, 'CONFLICT', 'Username sudah dipakai.');
            throw error;
        }
    }

    const deleteUserMatch = route.match(/^\/api\/users\/(\d+)$/);
    if (method === 'DELETE' && deleteUserMatch) {
        const actor = await requireSuperadmin(req, res, sql);
        if (!actor) return;
        const targetId = Number(deleteUserMatch[1]);
        if (targetId === Number(actor.id)) {
            return fail(res, 400, 'INVALID_OPERATION', 'Tidak bisa menghapus akun sendiri.');
        }
        const rows = await sql`SELECT id, role FROM users WHERE id = ${targetId}`;
        const target = rows[0];
        if (!target) return fail(res, 404, 'NOT_FOUND', 'User tidak ditemukan.');
        if (target.role === 'superadmin') {
            return fail(res, 403, 'FORBIDDEN', 'Superadmin lain tidak bisa dihapus.');
        }
        await sql`DELETE FROM users WHERE id = ${targetId}`;
        return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && route === '/api/meta') {
        if (!await requireAuth(req, res, sql)) return;
        const meta = await sql`SELECT value FROM meta WHERE key = 'schema_version'`;
        const users = await sql`SELECT COUNT(*) AS count FROM users`;
        const records = await sql`SELECT COUNT(*) AS count FROM records`;
        return sendJson(res, 200, {
            schemaVersion: meta[0]?.value || '1',
            users: Number(users[0].count),
            records: Number(records[0].count),
            database: 'PostgreSQL',
            backupAvailable: false,
        });
    }

    if (method === 'GET' && route === '/api/backup') {
        if (!await requireSuperadmin(req, res, sql)) return;
        return fail(res, 501, 'BACKUP_UNAVAILABLE', 'Gunakan fitur backup database dari Neon.');
    }

    return fail(res, 404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');
}

module.exports = async function handler(req, res) {
    try {
        const databaseUrl = getDatabaseUrl();
        if (!databaseUrl) {
            return fail(res, 503, 'DATABASE_NOT_CONFIGURED', 'Connection string Neon tidak ditemukan. Pastikan DATABASE_URL, POSTGRES_URL, atau POSTGRES_PRISMA_URL tersedia untuk environment deployment ini, lalu redeploy.');
        }
        const adminUsername = process.env.SUPERADMIN_USERNAME;
        const adminPassword = process.env.SUPERADMIN_PASSWORD;
        if (!adminUsername || !adminPassword) {
            return fail(res, 503, 'ADMIN_NOT_CONFIGURED', 'Atur SUPERADMIN_USERNAME dan SUPERADMIN_PASSWORD di environment Vercel.');
        }

        const sql = await getSqlClient();
        await ensureDatabase(sql, adminUsername, adminPassword);
        const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
        return await handleApi(req, res, url, sql);
    } catch (error) {
        console.error('[api] request failed:', error);
        if (!res.headersSent) return fail(res, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server.');
        return res.end();
    }
};
