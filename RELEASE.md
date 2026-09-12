# 发布流程

2.1 使用标签自动发布，标签使用 `v` 前缀，其后版本必须与 `manifest.json` 完全一致。

当前 2.1.0 为发布准备版本：主要真实宿主流程与本地包已核验，尚未发布。已验证操作与剩余范围见 [宿主验收](docs/verification/creation-host.md)；文字与生图独立验证不能替代具体宿主流程证据。

1. 更新 `package.json`、`package-lock.json`、`manifest.json`、`versions.json` 和 CHANGELOG；同步 README、INSTALL 中的版本示例。
2. 执行 `npm ci`、`npm run check`、`npm run package`，核对 ZIP 中只有一个 `md2wechat-publisher` 顶层目录，包含 main.js、manifest.json、styles.css 和配套技能。
3. 在真实 Obsidian 中检查连接、排版候选采用、标题/封面批次、正文配图、文章切换、窄栏与主题。记录没有通过或尚未覆盖的范围。最终确认前不得上传微信；真实草稿测试需要单独授权。
4. 合并到 main，推送代码，再创建并推送版本标签：

```sh
git push origin main
git tag -a v2.1.0 -m "Release 2.1.0"
git push origin v2.1.0
```

`.github/workflows/release.yml` 将安装固定测试版 md2wechat、检查代码、校验标签和版本、生成 ZIP 与校验文件，然后发布 GitHub Release。工作流默认使用仓库 GITHUB_TOKEN，无需额外发布密钥；需允许工作流写入仓库内容。

Release 提供安装 ZIP、main.js、manifest.json、styles.css、SHA256SUMS.txt。ZIP 不含账号配置、笔记、node_modules 或开发测试数据。Source code 是 GitHub 自动提供的源码包，不能代替安装 ZIP。

失败时先查看 Actions 日志，修复后重新运行失败任务；不要移动已公开的版本标签。发布成功后下载 ZIP 校验。此流程不自动提交 Obsidian 插件市场，市场审核另行进行。
