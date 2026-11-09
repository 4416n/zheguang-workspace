# 开发说明

需要 Node.js 22.13 或更高版本，推荐使用 `.nvmrc` 指定的 Node.js 24。

## 本地开发

```bash
npm ci
npm run dev
```

应用没有第三方运行依赖。`npm ci` 用于核对依赖锁文件，首次运行也可以直接执行 `npm start`。演示账号和功能说明见 [README](README.md)。

- 前端视图和交互放在 `public/app.js`，样式和动效放在 `public/styles.css`。
- 后端路由和权限校验放在 `server/app.js`，数据结构与初始化放在 `server/db.js`。
- 修改接口时同步更新 [API 文档](docs/API.md)，涉及权限或数据写入时补充相应回归测试。
- 沿用 UTF-8、LF 换行和两个空格缩进；配置见 `.editorconfig`。

## 提交前验证

```bash
npm run verify
git diff --check
```

测试使用内存或临时数据库，不需要启动 HTTP 服务。界面改动还需按 [浏览器验收清单](docs/验收清单.md) 检查相关页面、手机布局和键盘操作。

提交说明写清问题、改动和验证结果。不要提交 `.env`、本地数据库、数据库备份、访问令牌或个人 IDE 配置。新增依赖时同时更新 `package-lock.json`。

自动检查配置在 `.github/workflows/ci.yml`，会在推送和 Pull Request 时检查 Node.js 22 / 24，以及 Linux / Windows 环境。
