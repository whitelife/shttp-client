
# shttp-client

Simple Http Client

## Installation

```
npm install shttp-client
```

## Quick Example

```javascript
const shttpClient = require('shttp-client');

shttpClient.request({
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
```

## Options

- `protocol` - http: `http:`, https: `https:`, (default: http:)
- `host` - domain name or ip (ex: www.naver.com)
- `port` - port (default: 80)
- `method` - http request method (default: get)
- `path` - http request uri (default: /)
- `headers` - http request headers
- `query` - http request querystring object (ex: { a: 'b'. c: 'd' })
- `body` - http body object (ex: { a: 'b'. c: 'd', file: 'file:///path' })
- `encoding` - http encoding (default: utf8)
- `timeout` - http request timeout (default: 120000)