# MD2WeChat Publisher 2.0

在 Obsidian 写文章，交给 Agent 排版，在笔记旁预览，确认后创建微信公众号草稿。

2.0 基于 [md2wechat](https://github.com/geekjourneyx/md2wechat-skill)。插件负责预览和确认，排版、图片上传和草稿创建由已安装的 md2wechat 完成。插件内无需填写接口地址或密钥。

## 先安装 md2wechat

在终端依次运行，按配置向导完成配置：

```sh
npm install -g @geekjourneyx/md2wechat
md2wechat version --json
md2wechat config init --json
md2wechat config validate --json
```

本版本以 md2wechat 3.5.0 验证。配置校验通过后，再安装插件。公众号账号和排版服务的配置方法见 [md2wechat 项目说明](https://github.com/geekjourneyx/md2wechat-skill)。已有配置的用户先检查版本并校验，不必重复初始化。

## 下载和安装

1. 下载 [最新 Release](https://github.com/geekjourneyx/obsidian-md2wechat/releases/latest) 中的 **md2wechat-publisher-2.0.0.zip**，不要下载 GitHub 自动生成的 Source code。
2. 解压，把其中的 **md2wechat-publisher** 文件夹放进笔记库的 `.obsidian/plugins/`。
3. 重启 Obsidian，在“设置 → 第三方插件”启用 **MD2WeChat Publisher**。

需要桌面 Obsidian 1.12.7+。安装后路径应为 `.obsidian/plugins/md2wechat-publisher/main.js`，不要多套一层目录。当前提供手动安装包，插件市场审核将另行提交。

[完整安装与旧版升级说明](INSTALL.md) · [第一次使用](docs/FIRST-RUN.md)

## 排版到草稿箱

1. 打开文章，打开“公众号排版”面板。
2. 对已接入的 Agent 说：**“排版 Obsidian 当前文章，完成后展示给我。”** 也可点击“先预览当前文章”。
3. 查看正文，按需换主题；字号和复制排版在“更多”菜单中。
4. 修改原文后点击“刷新排版”，沿用当前主题和字号读取最新原文。需要 Agent 继续润色或重新组织内容时，请再交给 Agent。
5. 点击顶部“创建草稿”，选择公众号与封面，核对标题、作者、摘要，最后确认。

创建成功后弹框关闭，面板保留查看入口。切换文章或重新排版后，可看到曾创建草稿的公众号、时间，以及当前版本是否已经创建。刷新预览不会自动覆盖微信草稿；“创建新版草稿”会新增一篇，仍需确认。

原文不会被覆盖，最终确认前不上传图片。创建结果不确定时，请先核对公众号草稿箱，插件会阻止同一次请求重复创建。记录表示本插件曾成功创建，不代表微信后台草稿仍存在；后台修改不会反向同步。

## 接入你的 Agent

插件不指定或自动选择 Agent。Claude Code、Codex、WorkBuddy、ZCode 等具备本地命令执行、文件读写与技能支持的工具，可使用相同接入约定；没有逐个承诺宿主兼容。

- 启用 Obsidian 官方命令行；这需要 Obsidian 和安装程序均支持该功能。
- 将安装包中的 `skills/obsidian-md2wechat` 安装到所用 Agent 的技能目录，并保留 md2wechat 自带技能。
- 多个笔记库同时打开时，告诉 Agent 要使用哪一个。

[Agent 技能说明](skills/obsidian-md2wechat/SKILL.md) · [兼容范围](docs/AGENT-COMPATIBILITY.md)

## 验证范围

macOS 已实际验证预览、刷新、切换文档、主题兼容及真实公众号草稿创建。Windows、Linux 和各独立 Agent 的完整首次使用流程尚未逐一实测；插件仅支持桌面端。自动检查不创建真实草稿。

## 开发与发布

```sh
npm ci
npm run check
npm run package
```

检查需要本机已安装 md2wechat。打包结果在 `artifacts/release/`。推送与版本号一致的标签（例如 `v2.0.0`）后，GitHub Actions 自动检查、打包并上传 ZIP、三个插件文件和校验文件到 Release。

[开发指南](dev.md) · [发布流程](RELEASE.md) · [更新日志](CHANGELOG.md) · [验收记录](https://github.com/geekjourneyx/obsidian-md2wechat/blob/main/docs/verification/experience-matrix.md)

MIT License.
