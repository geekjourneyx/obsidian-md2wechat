# 安装与升级 2.0

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

在 [Release](https://github.com/geekjourneyx/obsidian-md2wechat/releases/latest) 下载 `md2wechat-publisher-2.0.1.zip`。解压后将 `md2wechat-publisher` 文件夹复制到笔记库的 `.obsidian/plugins/`，最终结构：

```text
你的笔记库/
└── .obsidian/plugins/md2wechat-publisher/
    ├── main.js
    ├── manifest.json
    ├── styles.css
    └── skills/obsidian-md2wechat/SKILL.md
```

重启桌面 Obsidian 1.12.7+，在“设置 → 第三方插件”启用 MD2WeChat Publisher。无需编译源码。macOS 可用 Command+Shift+. 显示隐藏文件夹；Windows 可在资源管理器开启隐藏项目。

## 3. 从 1.x 或测试版升级

关闭 Obsidian，备份旧插件目录和其中的 `data.json`。将新包文件覆盖到 `md2wechat-publisher`，保留原有 `data.json`。若曾手动装在 `obsidian-md2wechat` 目录，先在设置中停用旧副本并将其移到笔记库外备份，避免同时启用两个版本。不要删除笔记。

2.0 是新流程：旧密钥保留用于回退，不会自动搬入 md2wechat。先完成基础工具配置，再启用新版。

## 4. 接入 Agent

仅使用“先预览当前文章”、刷新和确认草稿时，不要求 Agent。让 Agent 自动取文章并送回排版时，需要启用 Obsidian 官方命令行，并将包内技能安装到 Agent 支持的技能目录。旧安装程序即使更新了 Obsidian 内部版本，也可能需要从 Obsidian 官网重新下载安装程序才能启用命令行。

详见 [第一次使用](https://github.com/geekjourneyx/obsidian-md2wechat/blob/main/docs/FIRST-RUN.md)。目前尚未在插件市场上架 2.0。

## 社区市场与手动 ZIP 的区别

当前尚未上架。官方社区市场只下载 `main.js`、`manifest.json` 和 `styles.css`，不会安装 ZIP 中的技能与文档。上架后，仅使用原生预览与草稿流程不需要技能文件；Agent 接入仍需手动从同版本 ZIP 提取 `skills/obsidian-md2wechat`。费用、网络请求和库外缓存位置见 [README 使用前须知](README.md#使用前须知费用联网与本地文件)。
