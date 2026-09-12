# 安装与升级 2.1

## 1. 安装并配置基础工具

先安装 [md2wechat](https://github.com/geekjourneyx/md2wechat-skill)：

```sh
npm install -g @geekjourneyx/md2wechat
md2wechat version --json
md2wechat config init --json
md2wechat config validate --json
```

已有配置时，不必重复初始化。校验不通过时，按 md2wechat 的提示完成账号与排版服务配置。2.0 不再使用插件内保存的旧接口密钥。

## 2. 安装插件

在 [Release](https://github.com/geekjourneyx/obsidian-md2wechat/releases/latest) 下载 `md2wechat-publisher-2.1.0.zip`。解压后将 `md2wechat-publisher` 文件夹复制到笔记库的 `.obsidian/plugins/`，最终结构：

```text
你的笔记库/
└── .obsidian/plugins/md2wechat-publisher/
    ├── main.js
    ├── manifest.json
    ├── styles.css
    └── skills/obsidian-md2wechat/SKILL.md
```

重启桌面 Obsidian 1.12.7+，在“设置 → 第三方插件”启用 MD2WeChat Publisher。无需编译源码。macOS 可用 Command+Shift+. 显示隐藏文件夹；Windows 可在资源管理器开启隐藏项目。

## 3. 从旧版升级

关闭 Obsidian，备份旧插件目录和其中的 `data.json`。将新包文件覆盖到 `md2wechat-publisher`，保留原有 `data.json`。若曾手动装在 `obsidian-md2wechat` 目录，先在设置中停用旧副本并将其移到笔记库外备份，避免同时启用两个版本。不要删除笔记。

2.0 是新流程：旧密钥保留用于回退，不会自动搬入 md2wechat。先完成基础工具配置，再启用新版。

## 4. 连接创作助手

不使用助手也能预览文章并进入已有草稿流程。需要智能增强、标题和润色时，在公众号排版面板主动选择 Claude Code 或 Codex 并测试连接。先在本机安装所选工具，并确认它的登录可用；插件不会自动选择或切换工具。

图片需要 md2wechat 中已有的火山生图配置。插件只读取现有配置，不提供新的密钥设置、不修改配置。每次生成会说明数量与可能的费用，确认创建草稿前不上传微信。

插件继承 Obsidian 主进程的环境，不加载任意 shell 配置。若工具依靠终端函数提供登录环境，请确认 Obsidian 启动时已具备相同环境，不能只凭终端测试判断插件连接成功。不要把密钥写入笔记或插件设置。

仍使用外部 Agent 技能接入时，需另启用 Obsidian 官方命令行并安装包内技能；插件内两种助手连接不需要该命令行。

详见 [第一次使用](docs/FIRST-RUN.md)。2.1.0 当前处于发布准备与宿主验收阶段，安装包是否已发布以 Release 页面为准；插件市场提交另行安排。
