> 历史设计/验收记录，保留当时上下文。2.0 当前安装、配置和使用方法以 README.md、INSTALL.md 和 CHANGELOG.md 为准。

# Obsidian 插件官方提交 PR 复盘记录

## 项目信息

- **插件名称**: MD2WeChat Publisher (公众号排版助手)
- **插件 ID**: md2wechat-publisher
- **当前版本**: v1.0.3
- **提交仓库**: obsidianmd/obsidian-releases
- **提交时间**: 2025-08-22

## PR 审核问题汇总

### 第一次审核问题 ❌

#### 问题描述
```
Hello!
I found the following issues in your plugin submission

Errors:

❌ Your latest release is missing the main.js file.
❌ Your latest release is missing the manifest.json file.
```

#### 问题分析
- **根本原因**: 只创建了 Git tag，但没有创建 GitHub Release
- **具体问题**: 
  1. GitHub Release 缺失 `main.js` 文件
  2. GitHub Release 缺失 `manifest.json` 文件

#### 解决方案
1. 使用 `gh` CLI 创建 GitHub Release
2. 上传必需的文件到 Release assets:
   - `main.js` (构建产物)
   - `manifest.json` (插件清单)
   - `obsidian-md2wechat-v1.0.3.zip` (完整插件包)

#### 触发重新检查
- 对 PR 分支进行小的更改并推送
- 更新了 README.md 中的版本徽章: `v1.0.1` → `v1.0.3`

---

### 第二次审核问题 ❌

#### 问题描述
```
Hello!
I found the following issues in your plugin submission

Errors:

❌ Please don't use the word obsidian in the plugin ID. The ID is used for your plugin's folder so keeping it short and simple avoids clutter and helps with sorting.
❌ Plugin name mismatch, the name in this PR (MD2WeChat Publisher) is not the same as the one in your repo (公众号排版助手). If you just changed your plugin name, remember to change it in the manifest.json in your repo and your latest GitHub release.
❌ Unable to find a release with the tag 1.0.2. Make sure that the version in your manifest.json file in your repo points to the correct Github Release.
```

#### 问题分析

##### 1. 插件 ID 包含 "obsidian" 关键词 ❌
- **当前 ID**: `md2wechat-publisher` (实际正确)
- **问题**: 可能检查系统误报，或之前版本中包含了 obsidian 关键词

##### 2. 插件名称不一致 ❌  
- **PR 中的名称**: MD2WeChat Publisher
- **仓库中的名称**: 公众号排版助手
- **问题**: 中英文名称不统一导致的匹配失败

##### 3. Release 版本标签问题 ❌
- **当前版本**: v1.0.3  
- **系统查找**: 1.0.2 (可能是缓存或时间差问题)
- **问题**: 版本标签不匹配

#### 解决方案
1. **统一插件名称**: 在所有地方使用一致的英文名称
2. **确认版本标签**: 确保 GitHub Release 标签与 manifest.json 版本号一致
3. **检查插件 ID**: 确认不包含 "obsidian" 关键词

---

### 第三次审核问题 ❌

#### 问题描述
```
Hello!
I found the following issues in your plugin submission

Errors:

❌ You did not follow the pull request template. The PR template can be found here: https://raw.githubusercontent.com/obsidianmd/obsidian-releases/refs/heads/master/.github/PULL_REQUEST_TEMPLATE/plugin.md
❌ The newly added entry is not at the end, or you are submitting on someone else's behalf. The last plugin in the list is: bao-tg/kindle-vocab. If you are submitting from a GitHub org, you need to be a public member of the org.
```

#### 问题分析

##### 1. PR 模板未遵循 ❌
- **模板地址**: https://raw.githubusercontent.com/obsidianmd/obsidian-releases/refs/heads/master/.github/PULL_REQUEST_TEMPLATE/plugin.md
- **问题**: 提交的 PR 格式不符合官方模板要求

##### 2. 插件条目位置错误 ❌
- **要求**: 新插件条目必须添加到列表末尾
- **当前状态**: 条目位置不正确
- **参考**: 最后一个插件是 `bao-tg/kindle-vocab`

#### 解决方案
1. **使用官方 PR 模板**: 按照模板格式重新编辑 PR 描述
2. **调整条目位置**: 将插件信息添加到 community-plugins.json 的末尾
3. **确认组织成员身份**: 如果从组织账号提交，确保是公开成员

---

## 经验教训总结

### 🔧 技术层面

1. **Release 管理**
   - ✅ 必须创建 GitHub Release，不仅仅是 Git tag
   - ✅ Release 中必须包含 `main.js` 和 `manifest.json`
   - ✅ 版本号必须在所有地方保持一致

2. **文件结构要求**
   ```
   GitHub Release Assets:
   ├── main.js              # 必需
   ├── manifest.json        # 必需  
   └── plugin-name-vX.Y.Z.zip # 可选但推荐
   ```

3. **版本管理**
   - Tag 格式: `X.Y.Z` (不带 v 前缀)
   - 所有文件中的版本号必须一致
   - Release 标签必须与 manifest.json 中的版本匹配

### 📝 流程层面

1. **PR 提交规范**
   - ✅ 必须使用官方 PR 模板
   - ✅ 插件条目必须添加到列表末尾
   - ✅ 确认提交者身份和权限

2. **命名规范**
   - ✅ 插件 ID 不能包含 "obsidian" 关键词
   - ✅ 插件名称在所有地方必须保持一致
   - ✅ 建议使用英文名称避免编码问题

3. **触发重新检查**
   - 对 PR 分支进行小的更改并推送
   - 或者关闭并重新打开 PR
   - 不要创建新的 PR

### 🎯 最佳实践

1. **发布前检查清单**
   ```markdown
   - [ ] 更新所有文件中的版本号
   - [ ] 执行 npm run build 构建
   - [ ] 创建 GitHub Release 并上传文件
   - [ ] 验证 Release 中包含必需文件
   - [ ] 确认插件名称一致性
   - [ ] 检查 PR 模板和格式
   ```

2. **版本发布流程**
   ```bash
   # 1. 更新版本号
   npm run version
   
   # 2. 构建项目  
   npm run build
   
   # 3. 创建 GitHub Release
   gh release create X.Y.Z main.js manifest.json plugin.zip
   
   # 4. 提交 PR 使用官方模板
   ```

3. **问题排查顺序**
   1. 检查 GitHub Release 是否存在且包含必需文件
   2. 验证版本号在所有地方是否一致
   3. 确认插件名称和 ID 符合规范
   4. 检查 PR 格式是否符合模板要求

## 相关资源

- **官方 PR 模板**: https://raw.githubusercontent.com/obsidianmd/obsidian-releases/refs/heads/master/.github/PULL_REQUEST_TEMPLATE/plugin.md
- **插件开发文档**: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- **社区插件列表**: https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json
- **插件发布指南**: https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin

## 后续行动计划

1. **立即修复**
   - [ ] 按照官方模板重新编辑 PR 描述
   - [ ] 确认插件条目位置正确
   - [ ] 统一所有地方的插件名称

2. **长期改进**
   - [ ] 建立标准的发布流程文档
   - [ ] 创建发布前自动检查脚本
   - [ ] 完善版本管理和 CI/CD 流程

---

**创建时间**: 2025-08-22  
**最后更新**: 2025-08-22  
**状态**: 进行中 🔄