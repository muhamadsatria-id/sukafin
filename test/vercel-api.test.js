'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/[...path].js');

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

test('reports missing Neon connection configuration', async t => {
    const previousUrl = process.env.DATABASE_URL;
    const previousPostgresUrl = process.env.POSTGRES_URL;
    const previousUsername = process.env.SUPERADMIN_USERNAME;
    const previousPassword = process.env.SUPERADMIN_PASSWORD;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.SUPERADMIN_USERNAME;
    delete process.env.SUPERADMIN_PASSWORD;
    t.after(() => {
        if (previousUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousUrl;
        if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
        else process.env.POSTGRES_URL = previousPostgresUrl;
        if (previousUsername === undefined) delete process.env.SUPERADMIN_USERNAME;
        else process.env.SUPERADMIN_USERNAME = previousUsername;
        if (previousPassword === undefined) delete process.env.SUPERADMIN_PASSWORD;
        else process.env.SUPERADMIN_PASSWORD = previousPassword;
    });

    const response = await invokeHealthCheck();
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.payload).error.code, 'DATABASE_NOT_CONFIGURED');
});

test('reports missing initial admin credentials', async t => {
    const previousUrl = process.env.DATABASE_URL;
    const previousPostgresUrl = process.env.POSTGRES_URL;
    const previousUsername = process.env.SUPERADMIN_USERNAME;
    const previousPassword = process.env.SUPERADMIN_PASSWORD;
    process.env.DATABASE_URL = 'postgres://placeholder';
    delete process.env.POSTGRES_URL;
    delete process.env.SUPERADMIN_USERNAME;
    delete process.env.SUPERADMIN_PASSWORD;
    t.after(() => {
        if (previousUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousUrl;
        if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
        else process.env.POSTGRES_URL = previousPostgresUrl;
        if (previousUsername === undefined) delete process.env.SUPERADMIN_USERNAME;
        else process.env.SUPERADMIN_USERNAME = previousUsername;
        if (previousPassword === undefined) delete process.env.SUPERADMIN_PASSWORD;
        else process.env.SUPERADMIN_PASSWORD = previousPassword;
    });

    const response = await invokeHealthCheck();
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.payload).error.code, 'ADMIN_NOT_CONFIGURED');
});
