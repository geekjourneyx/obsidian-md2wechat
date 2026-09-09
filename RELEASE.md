# 发布流程

2.0 使用标签自动发布，标签必须与 `manifest.json` 的版本完全一致，不得使用 `v` 前缀。

1. 更新 `package.json`、`package-lock.json`、`manifest.json`、`versions.json` 和 CHANGELOG；同步 README、INSTALL 中的版本示例。
2. 执行 `npm ci`、`npm run check`、`npm run package`，核对 ZIP 中只有一个 `md2wechat-publisher` 顶层目录，包含 main.js、manifest.json、styles.css 和配套技能。
3. 合并到 main，推送代码，再创建并推送版本标签：

```sh
git push origin main
git tag -a 2.0.1 -m "Release 2.0.1"
git push origin 2.0.1
```

`.github/workflows/release.yml` 将安装固定测试版 md2wechat、检查代码、校验标签和版本、生成 ZIP 与校验文件，然后发布 GitHub Release。工作流默认使用仓库 GITHUB_TOKEN，无需额外发布密钥；需允许工作流写入仓库内容。

Release 提供安装 ZIP、main.js、manifest.json、styles.css、SHA256SUMS.txt。ZIP 不含账号配置、笔记、node_modules 或开发测试数据。Source code 是 GitHub 自动提供的源码包，不能代替安装 ZIP。

失败时先查看 Actions 日志，修复后重新运行失败任务；不要移动已公开的版本标签。发布成功后下载 ZIP 校验。此流程不自动提交 Obsidian 插件市场，市场审核另行进行。

## 官方目录提交

按 [官方当前流程](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)，在 https://community.obsidian.md 登录 Obsidian 账号、连接拥有仓库的 GitHub 账号，再通过 Plugins → New plugin 提交。不要再修改 obsidian-releases 的 community-plugins.json：它现在从社区目录自动镜像。

首次申请前将此修复合并到默认分支并发布 `2.0.1`，回读该标签的 Release，下载验证三个独立资产、ZIP 和校验和。保留旧 `v2.0.0`，不覆盖旧标签。自动审查要求修改时，递增版本发布后在同一目录条目处理反馈，不创建重复条目。完整证据及待办见 [提交审计](docs/COMMUNITY-SUBMISSION.md)。
