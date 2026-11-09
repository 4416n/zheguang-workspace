# 上传 GitHub

建议仓库名：`zheguang-workspace`。

建议简介：`折光：带动态交互的项目与任务协作工作台，包含管理后台，基于原生 JavaScript、Node.js 和 SQLite。`

## 首次上传

1. 在 GitHub 创建空仓库，按需要选择公开或私有；不要勾选自动生成 README、`.gitignore` 或许可证，本项目已包含前两项。
2. 在项目根目录运行以下命令：

   ```bash
   npm run verify
   git init -b main
   git add .
   git diff --cached --check
   git diff --cached --stat
   git status --short
   ```

3. 查看暂存文件清单。源码、文档、测试、`.env.example` 和 `.github/workflows/ci.yml` 应在其中；`.env`、`data/`、数据库备份、`node_modules/`、`dist/` 和个人配置应被忽略。
4. 提交并推送，将示例远端地址替换为新仓库的真实地址：

   ```bash
   git commit -m "feat: add Zheguang project workspace"
   git remote add origin https://github.com/YOUR_USERNAME/zheguang-workspace.git
   git push -u origin main
   ```

若 Git 提示缺少作者信息，先按自己的信息配置 `git config user.name` 和 `git config user.email`；不要把访问令牌写入源码或远端地址。

## 上传后

- 检查仓库首页的 README 和文档链接。
- 查看 Actions 页中的 CI 结果；它会运行语法检查和自动化测试。
- 在实际浏览器中完成 [验收清单](验收清单.md)，再补充真实截图。

当前没有声明开源许可证；是否添加 `LICENSE` 以及使用哪种许可证，由项目所有者决定。

如果使用源码 ZIP，请先解压，再上传里面的文件，并确认包含 `.github`、`.gitignore` 和 `.env.example` 等隐藏项。不要只把整个 ZIP 文件作为仓库内容上传。

## 后续更新

```bash
npm run verify
git add .
git diff --cached --check
git diff --cached --stat
git commit -m "描述这次改动"
git push
```

上传代码后，服务仍需单独部署。此项目依赖 Node.js API 和 SQLite，完整应用需要运行 Node.js 服务；部署方式见 [配置与部署](DEPLOYMENT.md)。
