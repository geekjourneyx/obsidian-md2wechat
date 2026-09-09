# MD2WeChat Publisher 官方目录提交审计

核查日期：2026-09-09。源码基线：`0d17e518402721f0ec648b850c6adf1b1e1dcdb4`。本次准备版本：`2.0.1`，尚未发布。

## 结论与提交入口

官方提交机制已改为 Obsidian Community 目录。当前文档要求使用 Obsidian 账号登录、绑定 GitHub 验证仓库所有权，然后在 Plugins → New plugin 填写仓库地址并提交。obsidian-releases 当前的工作流定时从 community.obsidian.md 镜像插件列表；修改该仓库 JSON 的旧 PR 流程不应继续照搬。[1][2][3]

本次 PR 应提交到插件自身仓库，交付发布标签修复、必要披露与申请材料；它不是官方上架申请，也不代表获得批准。合并并发布后，再通过目录提交。账户登录和 GitHub 绑定须使用维护者自己的身份。

## 前次受阻记录

仓库内 `obsidian-plugin-pr-review.md` 保存了 2025-08-22 的三轮审核复盘，记录过 Release 缺失 main.js/manifest.json、ID/name 不一致、标签不匹配、模板及条目位置问题。[4] 本次未取得原始 PR 编号及完整审核线程：GitHub 搜索无匹配，旧模板路径返回 404。因此这些属于仓库维护者的历史记录，不能把当时关于“缓存/误报”的猜测当作审核方认定。

当前重新核查发现：`manifest.json.version = 2.0.0`，最新公开 Release 却是 `v2.0.0`，查询无前缀的 `2.0.0` Release 返回 404。该 Release 已具备 main.js、manifest.json、styles.css 和 ZIP，故资产缺失已不是同一个问题；标签与 manifest 不一致仍是确定阻塞。[5] 修复不能只改 README：工作流触发条件、release job 条件、打包器和发布示例都要统一。

## 当前规范与源码对应

| 要求 | 核查依据 | 处理与边界 |
| --- | --- | --- |
| 版本使用 x.y.z，Release tag 精确匹配 | 官方提交文档；发布工作流、package-release.mjs | 准备 2.0.1，无 v；保留旧 v2.0.0，不移动旧标签 |
| 根目录 README、LICENSE、manifest | 根目录三个文件存在，AGPL-3.0-only | 保留插件 ID 和名称；新版本同步四个版本文件 |
| 简短描述，250 字符内，以英文句点结束 | 官方提交要求 | 英文动作描述，直接说明独立 CLI 与付费 Key |
| Node/Electron 必须 desktop only | main.ts、runner.ts、remote-image.ts 使用 Node API | manifest 已为 true；不扩大移动端兼容承诺 |
| 付费与账号必须在 README 披露 | 当前 CLI 文档；catalog-service.ts 仅列 API 主题 | 明确内置预览/刷新需要专业 API Key，公众号草稿需要对应账号权限 |
| 联网及库外文件必须披露 | capture、previewOriginal、draft-service、result-store | 列出排版 API、图片下载、微信/配置代理、可选 Agent 与各系统缓存根目录 |
| 禁止自行安装/更新及客户端遥测 | 检视运行时代码及 CLI 调用路径 | 用户手动安装 CLI；本轮未发现插件自身下载依赖或遥测代码。未审计第三方服务内部实现 |
| 原文读写与清理 | main.ts source；stage-source、result-store；onunload | 原文读取走 Vault/编辑器，库外工作副本走 Node；子进程由 registry 关闭。未在本轮桌面应用复验 |
| HTML 预览隔离 | prepare-preview.ts、view.ts | iframe 空 sandbox + CSP，禁止网络图片，固定图片摘要；保留既有测试。不是完整渗透测试 |
| 市场安装完整性 | 官方仅下载三个文件 | 原生流程无需技能；Agent 技能由用户从同版 ZIP 手动提取，不让插件自安装依赖 |
| 服务端统计 | md2wechat 隐私政策 | README 链接现有政策；不声称请求正文零留存。API 日志字段、期限及代理处理仍需服务负责人确认 |

政策允许披露清楚的付费/账号/联网服务；不保证所有依赖外部 CLI 的产品都通过。审核会结合具体行为判断。[6][7]

## 可复用的已上架案例

本次没有取得可核验的旧合并 PR 审核对话，因此不编造“某维护者这样写就被合并”的经验，采用当前目录内可观察的产品与披露作为对照。

**Claudian（ID realclaudian，YishenTu/claudian）**在当前目录可安装，并明确要求独立 CLI、兼容订阅或 API provider、桌面环境。README 列出发送到模型的内容和目标供应商，解释本地运行与联网边界。[8] 对本项目的可复用做法是把 CLI 安装、费用和数据流写在用户能看到的位置；不能据此推导“调用 CLI 可以免审”。注意 `/plugins/claudian` 对应另一个 ClaudianIA，页面显示 archived，不应混淆成同一成功案例。[9]

**Summarize Video To Text**出现在目录当前新增列表，简介直接声明需要服务账号。[10] 它支持“先讲清账号前置条件”的呈现方式；本轮未取得其完整审核历史，也不据此认定相同商业模式一定通过。

相比模仿旧 PR 模板，现在更有价值的是保持默认分支 manifest、精确标签 Release、独立安装资产、用户披露和自动审查的版本一致。

## 提交资料

- Repository: https://github.com/geekjourneyx/obsidian-md2wechat
- Owner: 拥有并维护该项目的 geekjourneyx 对应社区个人身份；需 GitHub 绑定验证。
- Plugin ID: md2wechat-publisher
- Name: MD2WeChat Publisher
- Candidate version: 2.0.1
- Minimum app: 1.12.7（沿用既有验证边界，未降低要求）
- Platform: Desktop only
- License: AGPL-3.0-only
- Payment: 当前内置 API 预览需要付费 Key，插件源码本身开源。

可用于目录详情的英文说明：

> Preview Markdown layouts beside your notes, then explicitly confirm before creating a WeChat Official Account draft. Requires the separately installed md2wechat CLI and a paid md2wechat API key for the built-in preview workflow. Draft creation requires a WeChat Official Account with the necessary API permissions. Optional agents are configured by the user. Rendering sends article content to the configured API; capturing remote images contacts their hosts. Working copies and draft records are stored outside the vault. See the README for network, payment, credentials, privacy and local-storage details.

## 申请顺序与退出条件

1. 合并修复 PR，使默认分支 manifest 指向新版本；更新 CHANGELOG 的 Unreleased 为实际日期。
2. 创建 `2.0.1` 标签，等待 Check and release 成功。不得发布 `v2.0.1`。
3. 下载该标签 main.js/manifest.json/styles.css/ZIP；校验 SHA256SUMS，确认 ZIP 不含 data.json、凭证或笔记；对照 manifest。
4. 在桌面 Obsidian 用三个文件的社区安装布局检查加载、打开面板、无 CLI 错误提示和已有配置下预览。真实草稿测试只在明确授权后执行。本轮没有创建草稿。
5. 登录社区目录，绑定 GitHub，检查已有条目；若存在，沿用条目处理反馈，避免重复提交。
6. 通过 New plugin 提交仓库，按真实情况确认开发者政策和持续维护承诺。截图不是插件提交表单列出的必填项，不使用旧版截图充数。[2]
7. 阅读自动审查结果，逐项修复，递增版本重发，再检查同一条目。Publish 按钮或公开详情页不等于已经可从 Obsidian 安装；官方文档明确需解决自动审查错误。[1]
8. 确认目录可安装后才将 README 改为社区市场安装指引。保留手动 ZIP 路径与 Agent 技能安装说明。

不承诺免审、审核时限或一次通过。当前待完成事项是 PR 合并、新版公开 Release、实际社区安装布局验证、账号登录/绑定及官方自动审查。服务端 API 日志/保留期限的事实核查建议在申请前完善；不能为了合规自行编造服务隐私承诺。

## 验证记录

本地生产构建及 npm run package 通过；ZIP/三个独立资产/四项 SHA256/manifest 一致性通过；RELEASE_TAG=v2.0.1 被正确拒绝，2.0.1 打包通过；git diff --check 通过。npm run check 中 49 项通过、2 项缺少外部 CLI 失败；CLI 安装受网络审批取消阻塞。完整 CI 结果以 PR 最新提交为准。未进行 Windows/macOS 桌面 UI 或正式微信发布实测。

## 来源

所有在线来源于 2026-09-09 核查；仓库源码基线见文首。

1. Obsidian, [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).
2. Obsidian, [Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim).
3. Obsidian, [社区目录镜像工作流](https://github.com/obsidianmd/obsidian-releases/tree/master/.github/workflows)；本地读取基线 6c81d10。
4. geekjourneyx, [历史提交复盘](https://github.com/geekjourneyx/obsidian-md2wechat/blob/0d17e518402721f0ec648b850c6adf1b1e1dcdb4/obsidian-plugin-pr-review.md).
5. geekjourneyx, [v2.0.0 Release](https://github.com/geekjourneyx/obsidian-md2wechat/releases/tag/v2.0.0).
6. Obsidian, [Developer policies](https://docs.obsidian.md/community-directory/developer-policies).
7. Obsidian, [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).
8. Obsidian Community, [Claudian / realclaudian](https://community.obsidian.md/plugins/realclaudian).
9. Obsidian Community, [ClaudianIA / claudian](https://community.obsidian.md/plugins/claudian).
10. Obsidian Community, [当前新增插件列表](https://community.obsidian.md/).
11. md2wechat, [API 文档](https://www.md2wechat.cn/api-docs)；[隐私政策](https://www.md2wechat.cn/privacy).
12. geekjourneyx, [当前 CLI README](https://github.com/geekjourneyx/md2wechat-skill).
