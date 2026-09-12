# 2.1 开发指南

先按 [INSTALL.md](INSTALL.md) 安装并校验 md2wechat；本项目不修改其源码。Node.js 22，npm 与 zip 命令用于构建和打包。

```sh
npm ci
npm run check
npm run dev
```

入口为 main.ts，预览面板为 view.ts，业务逻辑位于 src。插件通过本地 md2wechat 执行排版与草稿操作，不增加直接调用公众号接口的旁路。文字创作通过用户选择的 Claude Code/Codex 独立进程执行；图片通过已有 md2wechat 火山配置生成本地文件，不能调用附带微信上传的直接生图命令。技能入口见 skills/obsidian-md2wechat。

自动检查包含真实 CLI 的只读样本，不使用真实公众号创建草稿。桌面界面需在 Obsidian 中核对，特别检查第三方主题、窄栏、原文变化和文章切换。

`npm run package` 生成可直接安装的 ZIP；版本和发布方法见 [RELEASE.md](RELEASE.md)。原生端到端辅助脚本位于 scripts，必须使用专用验收笔记库。

2.1 的原始笔记只读，改动进入独立 layout.md；标题和封面单独保存为文章发布资料。核对新旧成稿、过期任务、候选换批、部分失败、附件位置与段落插入，不能只凭测试通过宣称宿主体验已完成。独立验证见 docs/verification/creation-agent.md 与 creation-image.md；macOS / Obsidian 1.13.7 主要创作流程的真实结果与剩余边界见 [宿主验收](docs/verification/creation-host.md)。
