# 官方接力验证

2026-09-08，macOS，本机隔离 Obsidian 1.12.7 / 安装器 1.12.7，临时虚构 Vault。现用 1.8.10 未替换。

官方安装包 SHA256：`3b85c13b4ce55512e86e170a7cd2a494e2db695ac888c0601e153cb85b77881b`，下载与完整文件核对相同。

已实测：
- 官方 `registerCliHandler` 必须传完整命令名；不会自动加插件 ID。
- 设置 → 关于 → 高级 → 命令行界面；可跳过 PATH 注册，用安装器自带 `obsidian-cli`。
- 在编辑器实际输入 `EDITOR_VERSION`，测试夹具暂停该虚构文件自动落盘，使磁盘保持 `DISK_VERSION`。读取走实际 CLI 子进程，不使用浏览器读取替代。
- `scripts/native-bridge-smoke.mjs` 成功 JSON.parse 捕获输出，并发发送两个 present；每个 handler 延迟 200ms 并完成写入后再返回，各自标记正确。
- 中文空格文件名正确：`中文 空格.md`。

```json
{"capture":{"ok":true,"marker":"EDITOR_VERSION","source":"中文 空格.md"},"results":[{"ok":true,"marker":"ROUND_TRIP_A"},{"ok":true,"marker":"ROUND_TRIP_B"}],"sourceUnchanged":true}
```

未验收：当前稳定安装器、双 Vault、弹出窗口、Windows、Linux。上述基础接力通过只允许继续开发，不表示完整体验或所有兼容项通过。
