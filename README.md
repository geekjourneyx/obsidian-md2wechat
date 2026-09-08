# MD2WeChat Publisher · Agent 排版候选版

把当前 Obsidian 文章交给你常用的 Agent，在笔记旁查看排版，确认后创建公众号草稿。

**当前版本：2.0.0-beta.1。** 主流程已在 macOS 隔离环境验证，真实公众号草稿、多宿主和跨系统验收尚未完成，不作为正式发布版。

## 使用流程

1. 打开文章，对 Agent 说：“排版 Obsidian 当前文章，完成后展示给我。”
2. 在插件里查看结果，可调整主题、字号或复制排版。
3. 点击创建草稿，选择公众号和封面，确认后创建。

原文不被覆盖。原文更新时保留上次排版，重新排版后才能继续创建。插件不直接调用转换或公众号接口，所有转换与创建交给现有 md2wechat CLI。

## 安装与接入

需要桌面 Obsidian 和安装程序 1.12.7+、启用官方命令行、现有 md2wechat 3.5.0。无需修改 md2wechat 源码或技能。

- [首次使用](docs/FIRST-RUN.md)
- [通用 Agent 技能](skills/obsidian-md2wechat/SKILL.md)
- [兼容范围与尚未验证项](docs/AGENT-COMPATIBILITY.md)
- [实际验证记录](docs/verification/experience-matrix.md)

现有 1.x 用户的旧设置会保留，便于回退；候选版不会自动迁移密钥。

## 开发

```sh
npm ci
npm run check
```

测试中的本机 CLI 集成样本需要安装 md2wechat。真实草稿测试不包含在自动检查内。`scripts/workbench-e2e.mjs` 可在隔离测试笔记库中运行真实捕获、排版和结果接收；不会创建草稿。

开发从 main 单独建立 `codex/agent-publishing`，没有合入旧版模块工作台。
