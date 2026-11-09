import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './server/db.js';
import { createApp } from './server/app.js';
const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const production = process.env.NODE_ENV === 'production';
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须为 1–65535 之间的整数');
if (production && !/^https:\/\/[^/]+$/.test(process.env.PUBLIC_ORIGIN || '')) throw new Error('正式环境必须设置 PUBLIC_ORIGIN，例如 https://work.example.com');
const dbPath = resolve(root, process.env.DB_PATH || (production ? './data/zheguang.production.sqlite' : './data/zheguang.sqlite'));
const db = await openDatabase(dbPath, {
  production: process.env.NODE_ENV === 'production',
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD
});
const server = createServer(createApp(db, {
  publicDir: resolve(root, 'public'),
  production: process.env.NODE_ENV === 'production',
  publicOrigin: process.env.PUBLIC_ORIGIN
}));
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.on('error', error => {
  console.error(`启动失败：${error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请修改 PORT` : error.message}`);
  db.close();
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`折光工作台已启动：http://${host}:${port}`));
const close = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
