
'use strict';

const debug = require('debug')('httpClient');
const async = require('async');
const http = require('http');
const https = require('https');
const querystring = {
    single: require('querystring'),
    multiple: require('qs')
};
const mimetypes = require('mime-types');
const path = require('path');
const fs = require('fs');
const stream = require('stream');
const FormData = require('form-data');
const EventEmitter = require('events');

class HttpClientEvent extends EventEmitter {}
const httpClientEvent = new HttpClientEvent();

httpClientEvent.on('init', (options = {}, callback) => {

    options.protocol = options.protocol || 'http:';
    options.host = options.host || 'localhost';
    options.port = options.port || 80;
    options.method = options.method || 'get';
    options.path = options.path || '/';
    options.headers = options.headers || {};
    options.encoding = options.encoding || 'utf8';
    options.timeout = options.timeout || 120000;

    const query = options.query || null;

    if (query !== null) {
        options.path = `${options.path}?${querystring.multiple.stringify(query)}`;
    }

    const body = options.body || null;

    if (body !== null) {
        let contentType = options.headers['Content-Type'] || 'application/x-www-form-urlencoded';
        const isMultipart = contentType.indexOf('multipart/form-data') !== -1 ? true : false;

        if (isMultipart === false) {
            options.body = querystring.multiple.stringify(body);
            options.headers['Content-Type'] = contentType;
            options.headers['Content-Length'] = Buffer.byteLength(options.body);

            return httpClientEvent.emit('request', options, null, callback);
        }

        if (isMultipart === true) {
            const form = new FormData();
            options.headers = form.getHeaders();
            options.body = querystring.single.parse(
                querystring.multiple.stringify(body)
            );

            Object.keys(options.body).forEach((key, index) => {

                let value = options.body[key] || '';

                if (typeof value === 'string' && value.substring(0, 8) === 'file:///') {
                    value = fs.createReadStream(value.substring(8));
                    console.log(value);
                }

                form.append(key, value);
            });

            delete options.body;

            return httpClientEvent.emit('request', options, form, callback);
        }

        return;
    }

    httpClientEvent.emit('request', options, null, callback);
});

httpClientEvent.on('request', (options, form, callback) => {

    const req = options.protocol === 'http:' ? http.request(options) : https.request(options);

    if (form !== null) {
        form.pipe(req);
    }

    req.on('socket', (socket) => {
        socket.setTimeout(options.timeout);
        socket.on('timeout', () => {
            req.abort();
        });
    });

    req.on('response', (res) => {

        let buffer = '';

        res.setEncoding(options.encoding);

        res.on('data', (chunk) => {
            buffer += chunk;
        });

        res.on('end', () => {
            httpClientEvent.emit('end', null, buffer, callback);
        });
    });

    req.on('error', (e) => {
        httpClientEvent.emit('end', e, null, callback);
    });

    if (options.body !== undefined && form === null) {
        req.write(options.body);
    }

    if (form === null) {
        req.end();
    }
});

httpClientEvent.on('end', (err, body, callback) => {

    if (err) {
        return callback(err);
    }

    callback(null, body);
});

class HttpClient {

    static request(options, callback) {

        httpClientEvent.emit('init', options, callback);
    }
}

module.exports = HttpClient;


HttpClient.request({
    host: 'www.naver.com',
    method: 'get',
    path: '/',
    encoding: 'utf8',
}, (err, body) => {

    if (err) {
        throw err;
    }

    console.log(body);
});
