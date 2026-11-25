'use strict';

const handler = require('./[...path].js');

module.exports = function deleteRecordHandler(req, res) {
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    req.url = `/api/records/${url.searchParams.get('id') || ''}`;
    return handler(req, res);
};
