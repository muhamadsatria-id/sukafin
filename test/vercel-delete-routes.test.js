'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('flat delete routes forward to the existing API handler paths', async () => {
    const handlerPath = require.resolve('../api/[...path].js');
    const routes = [
        ['../api/delete-user.js', '/api/delete-user?id=17', '/api/users/17'],
        ['../api/delete-record.js', '/api/delete-record?id=29', '/api/records/29'],
    ];
    const previousHandler = require.cache[handlerPath];

    try {
        for (const [modulePath, requestUrl, expectedUrl] of routes) {
            let forwardedUrl;
            require.cache[handlerPath] = {
                id: handlerPath,
                filename: handlerPath,
                loaded: true,
                exports: req => { forwardedUrl = req.url; },
            };
            const resolvedRoute = require.resolve(modulePath);
            delete require.cache[resolvedRoute];
            const handler = require(modulePath);
            await handler({ url: requestUrl, headers: { host: 'example.test' } }, {});
            assert.equal(forwardedUrl, expectedUrl);
            delete require.cache[resolvedRoute];
        }
    } finally {
        if (previousHandler) require.cache[handlerPath] = previousHandler;
        else delete require.cache[handlerPath];
    }
});
