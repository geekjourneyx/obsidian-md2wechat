# MD2WeChat Publisher

<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="MD2WeChat Publisher：在 Obsidian 写作，交给 Agent 排版，预览并确认创建微信公众号草稿。">
</p>

在 Obsidian 写文章，交给 Agent 排版，在笔记旁预览，确认后创建微信公众号草稿。

[下载安装](#下载和安装) · [第一次使用](docs/FIRST-RUN.md) · [接入 Agent](#接入你的-agent) · [更新日志](CHANGELOG.md)

**桌面端 Obsidian 1.12.7+** · **手动安装** · **AGPL-3.0-only**

## 它能帮你做什么

- **写作与预览放在一起**：在笔记旁查看排版，调整主题与字号，也可复制排版。
- **复用你自己的 Agent**：按通用技能约定接入，插件不预选或绑定某个 Agent。
- **确认后再创建草稿**：选择公众号、封面和文章信息，确认后才上传与创建。
- **继续维护同一篇文章**：刷新预览读取最新原文，按文章、账号和版本查看本地创建记录。

2.0 基于 [md2wechat](https://github.com/geekjourneyx/md2wechat-skill)。插件负责预览和确认，排版、图片上传和草稿创建由已安装的 md2wechat 完成。插件内无需填写接口地址或密钥。

## 使用前须知：费用、联网与本地文件

插件源码免费开源；当前内置预览与刷新使用 md2wechat 专业 API，**需要另行购买并配置 API Key**。价格及获取方式见 [md2wechat 服务说明](https://www.md2wechat.cn/api-docs)。创建草稿还需要具有相应接口权限的微信公众号及凭证；可选 Agent 的订阅/API 费用由其提供商另行收取。

- **外部程序**：用户手动安装和更新 md2wechat。插件只调用已安装的程序，不自动下载安装或更新自身、CLI 或 Agent 技能。
- **排版联网**：点击预览/刷新或让 Agent 执行排版时，文章正文及排版选项会经 md2wechat 发送到配置的排版 API（默认 md2wechat 服务）。这一步发生在草稿确认之前，不能理解为全文始终离线。
- **远程图片**：捕获文章时会下载正文中引用的 HTTPS 图片，图片服务器会收到请求。预览使用固定的本地图片副本；最终确认之前不上传本地图片到微信。
- **微信接口**：确认创建草稿后，CLI 将文章、封面及正文图片发送至微信接口；如果配置了代理或固定出口服务，请同时核对该服务的数据处理方式。
- **可选 Agent**：用户选择的 Agent 可能将文章、工具输出和图片发送给其模型供应商；插件不预选供应商，也不代替 Agent 管理权限。
- **笔记库外的文件**：为保护原文并与外部 CLI/Agent 交换文件，插件将文章副本、图片、HTML、请求和草稿记录保存在系统用户数据目录下的 `md2wechat/obsidian-results/<vault-hash>/`。macOS 使用 `~/Library/Application Support`，Windows 使用 `LOCALAPPDATA`（未设置时为用户主目录），Linux 使用 `XDG_DATA_HOME` 或 `~/.local/share`。这些副本不由 Obsidian Sync 管理，卸载插件不会自动删除；不再需要时可在关闭插件后自行删除对应目录。
- **凭证与统计**：公众号/API 凭证由外部 CLI 配置管理；旧插件 `data.json` 可能保留旧凭证。当前插件源码未包含客户端遥测。外部服务的日志、保存期限和隐私条款由服务提供商负责，不能据此推断服务端不保留数据。md2wechat 的 API 内容传输与网站统计说明见 [隐私政策](https://www.md2wechat.cn/privacy)；自定义 API、发布代理及 Agent 服务需分别查看其隐私政策。

## 下载和安装

### 1. 准备 md2wechat

首次使用，在终端依次运行，按配置向导完成配置：

```sh
npm install -g @geekjourneyx/md2wechat
md2wechat version --json
md2wechat config init --json
md2wechat config validate --json
```

本版本以 md2wechat 3.5.0 验证。配置校验通过后，再安装插件。公众号账号和排版服务的配置方法见 [md2wechat 项目说明](https://github.com/geekjourneyx/md2wechat-skill)。已有配置的用户先检查版本并校验，不必重复初始化。

### 2. 安装 Obsidian 插件

1. 下载 [最新 Release](https://github.com/geekjourneyx/obsidian-md2wechat/releases/latest) 中的 `md2wechat-publisher-<版本号>.zip`，不要下载 GitHub 自动生成的 Source code。
2. 解压，把其中的 **md2wechat-publisher** 文件夹放进笔记库的 `.obsidian/plugins/`。
3. 重启 Obsidian，在“设置 → 第三方插件”启用 **MD2WeChat Publisher**。

需要桌面 Obsidian 1.12.7+。安装后路径应为 `.obsidian/plugins/md2wechat-publisher/main.js`，不要多套一层目录。当前提供手动安装包，官方社区目录申请准备中，尚未上架。

[完整安装与旧版升级说明](INSTALL.md) · [第一次使用](docs/FIRST-RUN.md)

## 排版到草稿箱

1. 打开文章，打开“公众号排版”面板。
2. 对已接入的 Agent 说：**“排版 Obsidian 当前文章，完成后展示给我。”** 也可点击“先预览当前文章”。
3. 查看正文，按需换主题；字号和复制排版在“更多”菜单中。
4. 修改原文后点击“刷新排版”，沿用当前主题和字号读取最新原文。需要 Agent 继续润色或重新组织内容时，请再交给 Agent。
5. 点击顶部“创建草稿”，选择公众号与封面，核对标题、作者、摘要，最后确认。

创建成功后弹框关闭，面板保留查看入口。切换文章或重新排版后，可看到曾创建草稿的公众号、时间，以及当前版本是否已经创建。

插件排版流程不会覆盖原文，最终确认前不上传图片。插件会阻止同一次请求重复创建。

## 接入你的 Agent

插件不指定或自动选择 Agent。Claude Code、Codex、WorkBuddy、ZCode 等具备本地命令执行、文件读写与技能支持的工具，可使用相同接入约定；没有逐个承诺宿主兼容。

- 启用 Obsidian 官方命令行；这需要 Obsidian 和安装程序均支持该功能。
- 将安装包中的 `skills/obsidian-md2wechat` 安装到所用 Agent 的技能目录，并保留 md2wechat 自带技能。社区市场安装只包含三个插件文件；上架后经市场安装的用户，需另从同版本 Release ZIP 手动提取技能，插件不会自动安装。
- 多个笔记库同时打开时，告诉 Agent 要使用哪一个。

[Agent 技能说明](skills/obsidian-md2wechat/SKILL.md) · [兼容范围](docs/AGENT-COMPATIBILITY.md)

## 兼容性与验证范围

| 环境或能力 | 当前状态 |
| --- | --- |
| macOS | 已实测预览、刷新、文档切换、主题兼容与真实草稿创建 |
| Windows / Linux | 尚未在对应系统实测 |
| 独立 Agent 首次接入 | 提供通用约定，尚未逐个完成验收 |
| Obsidian 移动端 | 不支持，仅桌面端 |

手动预览和创建草稿不依赖 Obsidian 命令行；Agent 接入需要官方命令行支持。自动检查不创建真实草稿。完整证据见[兼容范围](docs/AGENT-COMPATIBILITY.md)与[验收记录](docs/verification/experience-matrix.md)。

## 常见问题

**刷新排版会更新微信后台的旧草稿吗？**

不会。刷新只更新本地预览；“创建新版草稿”会新增一篇，并再次要求确认。插件不会自动正式发布文章。

**创建结果不确定，可以再点一次吗？**

请先核对公众号草稿箱，不要盲目重试。本地成功记录不代表草稿在微信后台仍然存在，后台修改也不会反向同步。

**插件里需要填写 API Key 吗？**

不需要。账号和排版服务由 md2wechat 配置管理，插件不直接提供接口与密钥设置。

## 开发与贡献

```sh
npm ci
npm run check
npm run package
```

检查需要本机已安装 md2wechat。打包结果在 `artifacts/release/`。推送与版本号一致的标签（例如 `2.0.1`，不带 `v`）后，GitHub Actions 自动检查、打包并上传 ZIP、三个插件文件和校验文件到 Release。

[开发指南](dev.md) · [发布流程](RELEASE.md) · [更新日志](CHANGELOG.md) · [验收记录](https://github.com/geekjourneyx/obsidian-md2wechat/blob/main/docs/verification/experience-matrix.md)

反馈问题请提交 [Issue](https://github.com/geekjourneyx/obsidian-md2wechat/issues)，附上插件与 Obsidian 版本、操作系统、复现步骤和脱敏截图。提交代码前请阅读 [协作约定](AGENTS.md)，并运行上述检查。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE)。
