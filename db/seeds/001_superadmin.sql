-- Seeder superadmin (password: superadmin123, SHA-256)
INSERT INTO users (username, password_hash, role, created_at)
SELECT
    'superadmin',
    'e34f92a20532a873cb3184398070b4b82a8fa29cf48572c203dc5f0fa6158231',
    'superadmin',
    datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'superadmin');
