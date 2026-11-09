# 配置与部署

应用由一个 Node.js 进程提供前端静态资源与后端 API，使用本地 SQLite 保存数据。部署环境需要 Node.js 22.13 或更高版本，以及可持久化、可写入的数据库目录。

## 环境变量

复制根目录的 `.env.example` 为 `.env` 后按需修改；启动命令会自动读取 `.env`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | 未设置，使用开发模式 | 正式部署必须设为 `production` |
| `HOST` | `127.0.0.1` | HTTP 监听地址；本机反向代理保持默认即可 |
| `PORT` | `3000` | HTTP 监听端口 |
| `DB_PATH` | 开发：`./data/zheguang.sqlite`；正式：`./data/zheguang.production.sqlite` | 相对路径以项目根目录为基准 |
| `PUBLIC_ORIGIN` | 开发环境根据请求 Host 校验 | 正式环境必须设置为用户访问的 HTTPS 来源，不带路径或末尾斜杠 |
| `ADMIN_EMAIL` | 开发：`admin@zheguang.local` | 首次正式初始化必填 |
| `ADMIN_PASSWORD` | 开发演示密码 | 首次正式初始化必填，至少 12 位且包含字母和数字 |

## 正式环境

`.env` 示例：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DB_PATH=./data/zheguang.production.sqlite
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=替换为至少12位且含字母和数字的强密码
PUBLIC_ORIGIN=https://work.example.com
```

替换邮箱、密码和域名后启动：

```bash
npm ci
npm run verify
npm start
```

首次启动会创建用户名为 `admin` 的管理员，不创建演示成员或项目，默认关闭注册。`ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 只用于首次初始化，不会在重启时修改已有账号。应用会拒绝在正式模式下使用演示数据库。

使用反向代理为应用提供 HTTPS，并保留原始 Host；将 `PUBLIC_ORIGIN` 设置为浏览器实际访问的来源。正式会话使用 `Secure` Cookie。域名、证书和进程托管需要在服务器上配置。健康检查接口为 `GET /api/health`。

数据库目录应放在持久化存储中，更新源码时保留该目录和 `.env`。应用适合单个团队、单进程运行；多进程部署需要重新设计进程内限流以及数据库并发方案。

## 备份与恢复

默认配置下，停止服务后备份整个 `data/` 目录；自定义 `DB_PATH` 时，备份实际数据库及其同目录的 `-wal`、`-shm` 文件。运行中备份应使用 SQLite 的备份机制，不要仅复制正在写入的主数据库文件。

恢复时先停止服务，再放回完整备份并启动。备份中包含账号和业务数据，应单独保存，不上传到源码仓库。

如果要重置本地演示，先停止服务并保留需要的数据备份，再删除演示数据库及对应的 `-wal`、`-shm` 文件，重启后会重新生成演示数据。不要对正式数据库执行这一操作。

## 常见启动问题

- **端口占用（`EADDRINUSE`）**：在 `.env` 中更改 `PORT`，例如 `3001`，随后重启。
- **监听被拒绝（`EPERM` / `EACCES`）**：当前执行环境不允许监听该地址或端口。请在允许运行本地服务的系统终端或服务器中启动。
- **不支持 `node:sqlite` 或启动参数**：检查 `node --version`，升级到满足要求的 Node.js。
- **正式环境登录后未保持会话**：确认通过 HTTPS 访问，且 `PUBLIC_ORIGIN` 与浏览器来源一致。
- **直接打开 HTML 无法使用**：通过 Node.js 服务地址访问；页面依赖同源 API。
