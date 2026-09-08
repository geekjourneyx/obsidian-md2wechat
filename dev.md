# 2.0 开发指南

先按 [INSTALL.md](INSTALL.md) 安装并校验 md2wechat；本项目不修改其源码。Node.js 22，npm 与 zip 命令用于构建和打包。

```sh
npm ci
npm run check
npm run dev
```

入口为 main.ts，预览面板为 view.ts，业务逻辑位于 src。插件通过本地 md2wechat 执行排版与草稿操作，不增加直接调用公众号接口的旁路。技能入口见 skills/obsidian-md2wechat。

自动检查包含真实 CLI 的只读样本，不使用真实公众号创建草稿。桌面界面需在 Obsidian 中核对，特别检查第三方主题、窄栏、原文变化和文章切换。

`npm run package` 生成可直接安装的 ZIP；版本和发布方法见 [RELEASE.md](RELEASE.md)。原生端到端辅助脚本位于 scripts，必须使用专用验收笔记库。
