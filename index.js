
'use strict';

const debug = require('debug')('shttp-client');
const async = require('async');
const http = require('http');
const https = require('https');
const querystring = {
    single: require('querystring'),
    multiple: require('qs')
};
const mimetypes = require('mime-types');
const path = require('path');
const parseurl = require('parseurl');
const fs = require('fs');
const os = require('os');
const uuid = require('uuid');
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

    if (query !== undefined && query !== null) {
        options.path = `${options.path}?${querystring.multiple.stringify(query)}`;
    }

    const body = options.body || null;

    if (body !== undefined && body !== null) {
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

            async.forEachOf(options.body, (value, key, iterateeCallback) => {

                value = value || '';

                if (typeof value === 'string' && value.substring(0, 8) === 'file:///') {
                    value = fs.createReadStream(value.substring(8));
                    form.append(key, value);
                    return iterateeCallback();
                }

                if (typeof value === 'string' && value.substring(0, 7) === 'url:///') {

                    httpClientEvent.emit('downloadImage', value.substring(7), (err, imagePath) => {
                        if (err) {
                            debug('downloadImage callback err: ', err);
                            return iterateeCallback();
                        }

                        // invalid imagePath
                        if (imagePath === null) {
                            return iterateeCallback();
                        }

                        debug('downloadImage callback path: %o', imagePath);

                        value = fs.createReadStream(imagePath);

                        debug('downloadImage callback createReadStream %o', imagePath);

                        const imagePathParts = path.parse(imagePath);

                        form.append(key, value, {
                            filename: imagePathParts.base.substring(imagePathParts.base.indexOf('_') + 1),
                            contentType: mimetypes.lookup(imagePath)
                        });

                        options._tmpFiles = options._tmpFiles || [];
                        options._tmpFiles.push(imagePath);

                        return iterateeCallback();
                    });

                    return;
                }

                form.append(key, value);
                iterateeCallback();
            }, (err) => {

                if (err) {
                    debug('body data err: ', err);
                    httpClientEvent.emit('end', err, options, null, null, callback);
                }

                delete options.body;
                return httpClientEvent.emit('request', options, form, callback);
            });
        }

        return;
    }

    httpClientEvent.emit('request', options, null, callback);
});

httpClientEvent.on('downloadImage', (url, callback) => {

    const info = parseurl.original({
        originalUrl: url
    });

    const pathParts = path.parse(info.path);

    if (info.port === null) {
        info.port = info.protocol === 'http:' ? 80 : 443;
    }

    const options = {
        protocol: info.protocol,
        host: info.host,
        port: info.port,
        path: info.path
    }

    const req = options.protocol === 'http:' ? http.request(options) : https.request(options);

    req.on('response', (res) => {

        if (res.statusCode !== 200) {
            return callback(null, null);
        }

        mkdirp(`${os.tmpdir()}/tmp`, (err) => {

            if (err) {
                debug('downloadImage request err: ', err);
                return callback(null, null);
            }

            const uuidv4 = uuid.v4();
            const tmpImageStream = fs.createWriteStream(`${os.tmpdir()}/tmp/${uuidv4}_${pathParts.base}`, {
                encoding: 'binary'
            });

            res.setEncoding('binary');

            res.on('data', (chunk) => {
                tmpImageStream.write(chunk);
            });

            res.on('end', () => {
                tmpImageStream.end();
                return callback(null, tmpImageStream.path);
            });
        });
    });

    req.on('error', (err) => {
        debug('downloadImage request err: ', err);
        return callback(null, null);
    });

    req.end();
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

            httpClientEvent.emit('end', null, options, res, buffer, callback);
        });
    });

    req.on('error', (err) => {
        debug('request err: ', err);
        httpClientEvent.emit('end', err, options, null, null, callback);
    });

    if (options.body !== undefined && form === null) {
        req.write(options.body);
    }

    if (form === null) {
        req.end();
    }
});

httpClientEvent.on('end', (err, options, res, body, callback) => {

    res = res || {};

    if (options._tmpFiles !== undefined && options._tmpFiles.length > 0) {

        debug('file system unlink %o', options._tmpFiles);

        async.forEachOf(options._tmpFiles, (value, key, iterateeCallback) => {

            fs.unlink(value, (_err) => {
                iterateeCallback();
            });
        }, (_err) => {

            if (err) {
                return callback(err);
            }

            return callback(null, res, res.statusCode || null, res.statusMessage || null, res.headers || {}, body);
        });

        return;
    }

    if (err) {
        return callback(err);
    }

    return callback(null, res, res.statusCode || null, res.statusMessage || null, res.headers || {}, body);
});

class HttpClient {

    static request(options, callback) {

        httpClientEvent.emit('init', options, callback);
    }
}

module.exports = HttpClient;
