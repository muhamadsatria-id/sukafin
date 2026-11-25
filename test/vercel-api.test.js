'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/[...path].js');

const DATABASE_ENV_NAMES = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'NEON_DATABASE_URL',
    'NEON_POSTGRES_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_PRISMA_URL_NON_POOLING',
    'SUPERADMIN_USERNAME',
    'SUPERADMIN_PASSWORD',
];

async function invokeHealthCheck() {
    const response = {
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value;
        },
        end(payload) {
            this.payload = payload;
        },
    };
    await handler({ method: 'GET', url: '/api/health', headers: {} }, response);
    return response;
}

function setEnvironment(t, values) {
    const previous = Object.fromEntries(DATABASE_ENV_NAMES.map(name => [name, process.env[name]]));
    for (const name of DATABASE_ENV_NAMES) delete process.env[name];
    Object.assign(process.env, values);
    t.after(() => {
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    });
}

test('reports missing Neon connection configuration', async t => {
    setEnvironment(t, {});
    const response = await invokeHealthCheck();
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.payload).error.code, 'DATABASE_NOT_CONFIGURED');
});

test('reports missing initial admin credentials', async t => {
    setEnvironment(t, { DATABASE_URL: 'postgres://placeholder' });
    const response = await invokeHealthCheck();
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.payload).error.code, 'ADMIN_NOT_CONFIGURED');
});

test('accepts a Neon-prefixed connection string', async t => {
    setEnvironment(t, { NEON_DATABASE_URL: 'postgres://placeholder' });
    const response = await invokeHealthCheck();
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.payload).error.code, 'ADMIN_NOT_CONFIGURED');
});

test('accepts Vercel Neon POSTGRES_PRISMA_URL', async t => {
    setEnvironment(t, { POSTGRES_PRISMA_URL: 'postgres://placeholder' });
    const response = await invokeHealthCheck();
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.payload).error.code, 'ADMIN_NOT_CONFIGURED');
});
