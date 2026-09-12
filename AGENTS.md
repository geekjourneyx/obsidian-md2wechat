# 项目协作约定 · 2.1

## 产品目标

当前文章 → 通用 Agent 排版 → Obsidian 预览 → 用户确认创建公众号草稿。视觉与操作体验优先，保持 Obsidian 原生设计，避免添加偏离主流程的设置和框架。

基础设施是 https://github.com/geekjourneyx/md2wechat-skill 。用户必须先安装并配置：

```sh
npm install -g @geekjourneyx/md2wechat
md2wechat version --json
md2wechat config init --json
md2wechat config validate --json
```

已有配置先校验，不擅自重新初始化。插件不直接暴露接口配置、不迁移旧密钥、不修改 md2wechat 仓库。按本轮用户确认，允许自动发现已安装的 Claude Code / Codex；由用户主动选择，不预选、不自动切换或强制绑定。所有创作修改只进入独立 layout.md，严禁写回用户原始 Markdown。

## 实现与验证

- 最终确认前不上传；创建结果不确定时禁止盲目重试。不自动正式发布。
- 保留原文与已确认排版，明确原文变化；刷新预览与创建微信草稿是独立操作。
- 创建记录按文章、账号和版本区分；不能把本地记录描述为微信后台实时状态。
- 修改后运行 npm run check。界面改动须打开 Obsidian，检查实际主题、按钮边距、对齐、窄栏与文章切换。禁止仅凭代码宣布体验达标。
- 验证范围与限制如实记录，不虚报宿主、操作系统兼容或体验评分。

## 发布与文档

版本同步 package.json、package-lock.json、manifest.json、versions.json。每次发布更新 CHANGELOG、README、INSTALL、RELEASE 及相关指南；历史方案保留但明确标注历史，不充当最新操作指南。

npm run package 产生安装包。推送 v + manifest.version 的标签触发 GitHub Release 工作流。保留 md2wechat-publisher 插件 ID；包内必须有三个插件文件与配套技能，不包含 data.json 或用户资料。发布后下载 ZIP 实际核验。插件市场提交需另行安排。

## 沟通

用简单直白的话说明做了什么、结果怎样；不要求用户逐项替你验收。先定义完成标准并尽可能实际验证，遇到问题先修复。未经授权不发送消息、不创建真实草稿、不正式发布文章。
