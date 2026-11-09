import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
export function request(app, path, {
  method = 'GET',
  body,
  cookie,
  csrf,
  origin = 'http://test'
} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    req.method = method;
    req.url = path;
    req.headers = {
      host: 'test',
      origin,
      ...(payload ? {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(payload))
      } : {}),
      ...(cookie ? {
        cookie
      } : {}),
      ...(csrf ? {
        'x-csrf-token': csrf
      } : {})
    };
    req.socket = {
      remoteAddress: '127.0.0.1'
    };
    const headers = {};
    const chunks = [];
    const res = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
    res.headersSent = false;
    res.setHeader = (name, value) => {
      headers[name.toLowerCase()] = value;
    };
    res.writeHead = (status, extra = {}) => {
      res.statusCode = status;
      res.headersSent = true;
      Object.entries(extra).forEach(([name, value]) => res.setHeader(name, value));
    };
    res.on('finish', () => {
      const text = Buffer.concat(chunks).toString();
      let json = null;
      if (headers['content-type']?.includes('application/json') && text) {
        try {
          json = JSON.parse(text);
        } catch (error) {
          reject(error);
          return;
        }
      }
      resolve({
        status: res.statusCode,
        headers,
        json,
        text
      });
    });
    res.on('error', reject);
    Promise.resolve(app(req, res)).catch(reject);
  });
}
export async function fixture(options = {}) {
  const db = await openDatabase(':memory:', options);
  const app = createApp(db, {
    publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
    publicOrigin: 'http://test',
    ...options
  });
  return {
    db,
    app
  };
}
export function auth(response) {
  const setCookie = response.headers['set-cookie'];
  return {
    cookie: setCookie.split(';')[0],
    csrf: response.json.csrfToken
  };
}
