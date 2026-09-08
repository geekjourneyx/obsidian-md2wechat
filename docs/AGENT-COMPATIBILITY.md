# 2.0 Agent 接入边界

统一入口是官方 Obsidian 命令行和普通文件。没有默认 Agent，没有对具名工具的私有依赖。具备本机命令执行、文件读写和技能支持的 Agent 可以按相同说明接入。

| 项目 | 当前证据 |
| --- | --- |
| macOS，Obsidian/安装器 1.12.7 | 正式 capture → md2wechat 3.5.0 preview → present 已实际通过 |
| Codex 当前开发环境 | 已执行真实命令回环；独立用户安装技能的首次使用仍未验收 |
| Claude Code、Claudian、WorkBuddy、ZCode | 已提供通用约定；未逐个完成真实宿主测试，不能宣称全部验收通过 |
| Windows、Linux | 未在对应系统实际运行 |
| Obsidian 最新稳定安装器 | 尚未单独测试 |

注册命令不等于获得后台任意访问权限。Agent 仍按自己的权限机制执行本地工具；插件不自动给宿主授权。

2.0 发布补充：macOS 的当前 Obsidian 1.13.7 已完成预览、刷新、文档切换、Baseline 主题及真实草稿创建验证；本机旧安装程序的官方命令行不可用，完整 Agent 回环证据来自此前隔离环境。手动预览和创建草稿不依赖 Obsidian 命令行。

先按 [安装说明](../INSTALL.md) 安装 `@geekjourneyx/md2wechat`，执行版本检查、配置初始化与校验。
