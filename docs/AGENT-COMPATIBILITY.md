# 2.1 创作助手与宿主边界

插件内支持主动选择 Claude Code 或 Codex，不预选、不自动切换。文字任务通过独立 CLI 进程执行，原始笔记只读；图片独立使用 md2wechat 中已有的火山生图配置。

| 项目 | 当前证据 |
| --- | --- |
| Codex，本机 macOS | 独立文字任务、只读保护探针与进程取消等检查通过 |
| Claude Code，本机 macOS | 继承用户明确指定的既有智谱环境后，独立文字与结构化排版请求通过 |
| 火山本地生图，本机 macOS | 一张真实图片生成并保存、打开检查通过，没有微信上传 |
| 插件 2.1 宿主操作 | macOS / Obsidian 1.13.7 已完成主要创作流程实测，具体操作与未测边界见[宿主验收](verification/creation-host.md)；不声称全部环境通过 |
| Windows、Linux | 未在对应系统实际运行本次升级 |
| 移动端 | 插件仅支持桌面端 |

插件继承 Obsidian 主进程环境，不自动执行 shell 函数或读取任意 shell 配置。终端中的自定义登录包装函数不会自动成为插件可用配置。没有把密钥存入插件设置或笔记库。

外部 Agent 仍可通过官方 Obsidian 命令行和包内技能完成 capture → preview → present。该方式需要支持官方命令行的 Obsidian 安装程序；插件内连接助手不需要这个额外入口。Claudian、WorkBuddy、ZCode 等不属于本次插件内新增接入范围，不承诺逐个宿主兼容。

2.0 曾完成的 macOS 预览、主题和真实草稿检查属于历史记录，不能代替 2.1 验收。

[安装说明](../INSTALL.md) · [文字验证](verification/creation-agent.md) · [图片验证](verification/creation-image.md)
