# 通用 Agent 排版发布重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 默认在当前任务逐项执行，不自动创建子智能体。

**Goal:** 不改动现有 md2wechat CLI，让不同 Agent 排版当前 Obsidian 文章，插件展示、恢复并在最终确认后创建草稿。

**Architecture:** Obsidian 官方命令行提供捕获与接收，插件将当前内容转成独立工作文件；Agent 调用现有 md2wechat 命令处理。插件保存已审阅 HTML，最后编排现有 upload_image 与 create_draft，不重新转换，不直连公众号或转换 API。

**Tech Stack:** TypeScript、Obsidian Plugin API、Node、Vitest/jsdom/esbuild；外部只读依赖 md2wechat 3.5.0 的现有公开命令。

**Spec:** [体验与接口设计](../specs/2026-09-08-agent-publishing-design.md)。

**Status:** 正在当前任务实施；已完成基础官方接力、正式预览回环和离线最终确认。详细证据见 docs/verification/experience-matrix.md；完整体验及跨宿主验收仍未完成。此版本取代此前要求修改 CLI 的计划；不再执行 stdin、review-bundle、新发布命令或 CLI 分支开发。

## Global Constraints

- 本轮只修改插件仓库，CLI 仓库源码、skill、配置与版本均不修改。
- 拟定 Obsidian 桌面端 1.12.7+、安装器 1.12.7+、官方 CLI 已启用；Task 0 隔离实测，不替换当前 1.8.10 安装。
- 同机本地 Agent 通用接入，不选默认宿主，不依赖具名产品私有接口。
- 当前编辑内容通过插件副本接入，不写原笔记、不在原文旁新增派生稿。
- preview/inspect/layout/upload_image/create_draft 只使用现有命令及其公开输出。
- 不固定模块数、不复制完整 Markdown 解析器、布局 schema、上传／压缩／认证逻辑或平台 readiness。
- 用户配置完成、资料齐全时正常流程 3 次主动操作；一次最终确认前 0 上传／0 草稿。
- 已审阅 HTML 只允许素材地址替换和明确确认的资料变化，发布阶段不再次转换。
- 持久化当前／前一成品，关窗重启可恢复；原文变更不销毁旧成果。
- 未确定的草稿结果不自动重试；防重复由插件跨窗口锁与持久化记录负责。
- Markdown 10 MiB、HTML 20 MiB、单素材 20 MiB、单结果 200 MiB，与当前 CLI 更严格限制取交集。
- 原生界面、单主按钮、局部样式、预览优先；默认明暗和 Minimal 明暗、窄面板与弹出窗口实际检查。
- 20 项验收每项 5 分，全部 ★ 硬门槛通过且总分至少 90 才算完成。

---

## 工作区与文件边界

插件：`/Users/geekjourney/Workspace/web/obsidian-md2wechat`。CLI 只读参照：`/Users/geekjourney/Workspace/go/md2wechat-skill`。

- [ ] 核对两仓状态、main 提交、CLI 安装版本及公开命令帮助；保留用户未提交内容。
- [ ] 用 superpowers:using-git-worktrees 从插件 main 建 `codex/agent-publishing` 的持久工作区。CLI 不建立开发分支，不整体合入旧工作台分支。
- [ ] 旧 `codex/workbench-v2` 只供体复用 runner、隔离预览、账号摘要和测试经验；不搬入模块表单、会话操作栈及固定数量 gate。
- [ ] 每项执行失败用例、最小实现、针对检查与提交；真实外部操作按明确授权，不沿用历史文章授权。

| 文件 | 职责 |
|---|---|
| src/cli/runner.ts、contracts.ts、catalog-service.ts | 现有 CLI 调用／发现，只按当前任务能力启用 |
| src/bridge/commands.ts | 两个 Obsidian 原生命令 capture/present |
| src/source/stage-source.ts | 将当前正文和实际素材转成 CLI 可用副本 |
| src/results/contracts.ts、result-store.ts、result-reader.ts | 本地结果文件、验证、原子采用与恢复 |
| src/workbench/workbench-view.ts、workbench-controller.ts | 精简原生展示和用户动作 |
| src/ui/theme-menu.ts、copy-result.ts、publish-modal.ts | 原生主题、复制和确认 |
| src/metadata/metadata-service.ts | 原样消费 inspect 的资料限制与目标状态 |
| src/preview/local-resource-map.ts | 仅显示副本的本地素材映射 |
| src/publish/draft-service.ts、attempt-store.ts、asset-bindings.ts | 现有命令编排、跨窗口防重复与精确图片映射 |
| skills/obsidian-md2wechat/SKILL.md | 插件接力说明，复用现有 md2wechat 排版 skill |
| main.ts、view.ts、settings.ts、styles.css | 注册、旧入口兼容、迁移与宿主样式 |

以上 src/ 文件均在插件 main 中新建，相邻添加必要测试。实际职责可合并小文件，不新增空壳分层。

## Task 0：先证明官方接力可用

**交付：** 一个隔离测试 Vault 中，官方 Obsidian CLI 捕获未保存文章并接收结果的证据；尚不做产品界面。

**Files:**
- Create: `tests/fixtures/native-bridge/manifest.json`
- Create: `tests/fixtures/native-bridge/main.js`
- Create: `scripts/native-bridge-smoke.mjs`
- Create: `docs/verification/native-bridge.md`

**Interfaces:** 临时探针命令 `md2wechat-probe:capture` 与 `md2wechat-probe:present`；输出 `{ok:true, marker:string}`。该探针不进入最终发布资产。

- [ ] 下载／定位最低和当前稳定 Obsidian 安装器到隔离测试位置，记录校验值；不替换 `/Applications/Obsidian.app`，不打开真实 Vault。
- [ ] 建立虚构笔记，磁盘正文 `DISK_VERSION`，编辑器未保存正文 `EDITOR_VERSION`。
- [ ] 探针使用 `registerCliHandler` 返回 JSON；增加一次延迟 200ms 后写文件并返回的检查，证明宿主获取到完整异步结果。
- [ ] 执行实际原生命令，不以 `eval` 或浏览器直接读内部对象替代：

```text
obsidian vault="MD2Wechat Probe" md2wechat-probe:capture
obsidian vault="MD2Wechat Probe" md2wechat-probe:present marker=ROUND_TRIP
```

- [ ] `native-bridge-smoke.mjs` 对实际输出做 `JSON.parse`，断言 marker 为 `EDITOR_VERSION`／`ROUND_TRIP`；输出干扰或返回丢失都算失败。
- [ ] 验证中文空格文件、非 Markdown 焦点、弹出窗口、两个 Vault、同名笔记、两个并发请求；无法定位时明确拒绝，不能返回另一篇文章。
- [ ] 记录 Windows 原生重定向器与 Linux CLI 注册差异；没有相应运行环境就保留该平台未验收。
- [ ] 通过后把最低版本与实际命令返回样本固定在文档和 fixture。未通过只修这项，不开始大规模 UI 实现。

**检查代码核心：**

```js
const captured = JSON.parse(captureStdout);
assert.equal(captured.marker, 'EDITOR_VERSION');
assert.equal(captured.marker.includes('DISK_VERSION'), false);
assert.equal(JSON.parse(presentStdout).marker, 'ROUND_TRIP');
assert.equal(await readFile(sourceFile, 'utf8'), 'DISK_VERSION');
```

其中 captureStdout/presentStdout 为真实子进程完整 stdout，sourceFile 是探针在隔离 Vault 创建的磁盘文件。探针结果写入文档后独立提交。

## Task 1：当前正文和图片使用现有 CLI 预览

**交付：** 真实未保存正文能生成普通文件供现有 CLI 读取，不依赖 --source-path 或 stdin 扩展。

**Files:** Create `src/source/stage-source.ts`, `stage-source.test.ts`, `src/cli/{runner,contracts,catalog-service}.ts` 及相邻测试；建立 vitest/config 与 package scripts。

**Interfaces:**

```ts
type SourceAsset = { tokenStart: number; tokenEnd: number; originalTarget: string; localFile: string };
type StageInput = { markdown: string; sourcePath: string; assets: readonly SourceAsset[] };
type StageResult = { inputFile: string; workDir: string; bindings: readonly SourceAsset[] };
async function stageSource(input: StageInput, workDir: string): Promise<StageResult>;
```

SourceAsset 的位置来自 Obsidian 引用信息／成熟解析器的 token，不用全局正则猜。源路径定位、工作副本资源归一属于插件适配，不接管 CLI 业务。

- [ ] 先写失败测试：磁盘 DISK、缓冲 BUFFER；相对／中文空格／百分号编码／引用式图片、wiki 嵌入、同名附件、代码块中的图片示例。
- [ ] 用隔离工作目录保存正文副本、复制明确引用的素材为安全文件名；只改副本中准确目标地址，正文含义和源文件不变。
- [ ] 远程图片固定为本地输入，限定来自文章实际引用并设大小／协议／重定向边界；不下载或上传未引用资源。
- [ ] 引用无法解析时定位具体图片并保留旧结果；不伪造图片、不复制整个 Vault、不放宽宿主权限。
- [ ] 用当前安装的 `md2wechat inspect <staged-file> --json` 实测正文和 assets.exists，再用 `preview <staged-file> --output <unique-file> --json` 实测转换。
- [ ] 成功判据同时检查 envelope、本次 output_file、实际非空文件、inspect 数据；旧文件残留不能充当本次成功。
- [ ] 只读预览不要求公众号账号；catalog 不要求固定模块数，不先逐个读取模块详情。
- [ ] 如需复制完整 CLI 解析／素材规则才能支持真实输入，停止扩张，提交失败样本重审必要性；不顺手新增 CLI 接口。
- [ ] 针对测试和构建通过后提交。

**代表断言：**

```ts
expect(await readFile(staged.inputFile, 'utf8')).toContain('BUFFER');
expect(inspected.data.assets.every(asset => asset.exists)).toBe(true);
expect(await readFile(sourcePath, 'utf8')).toBe('DISK');
```

测试正文、源文件和图片均由 beforeEach 在临时目录建立；inspected 必须包含使用当前 CLI 的集成样本，不全部来自 fake。

## Task 2：捕获、结果接收与恢复

**Files:** Create `src/bridge/commands.ts`, `src/results/{contracts,result-store,result-reader}.ts` 与相邻测试；Modify `main.ts`。

**Interfaces:** Capture 和 ResultRecord 采用设计 §6.3。result-store 导出 `createResultStore(root)`，实例具有 `capture(input)`、`present(requestId, files)`、`current(sourcePath)`、`sourceChanged(sourcePath, markdown)`、`renameSource(oldPath,newPath)`；全部返回 Promise。

- [ ] capture 从实际 Editor 缓冲区调用 Task 1，保存插件可信的 sourceHash 和 requestId；已打开文章不重读磁盘替代。
- [ ] 原生命令返回与 Task 0 一致；输入歧义、错 Vault、多个窗口冲突时明确拒绝。
- [ ] present 只接收 request 目录内本次 formatted.md、preview.html 和真实 preview-response.json；核对路径、类型、限额、状态和上下文。
- [ ] 对正确候选生成插件本地记录，复制到不可变成品目录，持久化后才切换 current；不要求 CLI 理解成品记录。
- [ ] 相同请求重复接收幂等，旧请求晚回不覆盖较新结果；不同 Agent 和 Vault 互不串稿。
- [ ] 原文改动只标旧版本，保留结果、主题和资料；current/previous 在关窗和重启后恢复。
- [ ] rename 更新索引，源文件删除后仍可看旧结果但不能创建；磁盘满、写入中断不覆盖旧成功。
- [ ] 自动清理不删除未采用、正在处理和结果不确定的工作。
- [ ] 使用当前 CLI 真正输出的 HTML 完成一次 native capture→preview→present 回环，再提交。

**关键验证：** 新建 store 实例模拟重启，而不是继续使用同一个内存对象。源文字变化后 `current.state` 为 source_changed，html 文件仍在；重复 present 采用次数为 1。

## Task 3：原生预览界面与少量调整

**交付：** 与 Obsidian 一致、预览优先的完整空态／处理中／成品／旧版本／错误页面。

**Files:**
- Create: `src/workbench/{workbench-view,workbench-controller}.ts` 及相邻测试
- Create: `src/ui/{theme-menu,copy-result}.ts` 及相邻测试
- Create: `src/preview/local-resource-map.ts` 及测试（供体复用）
- Create: `src/metadata/metadata-service.ts` 及测试（按当前 CLI 输出适配）
- Modify: `main.ts`, `view.ts`, `styles.css`, `settings.ts`
- Create: `tests/fixtures/articles/`（见 Task 6 样本清单）

**Interfaces:** controller 消费 ResultStore、CatalogService、MetadataService；提供 `openArticle(sourcePath)`、`changeRender({theme,fontSize})`、`copyFormatted()`。所有方法返回 Promise；失败保持 last successful result。view 只订阅显示状态，不直接调用发布服务。

- [ ] 先做原生 ItemView 布局草图，验证 320／420／900px 和明暗主题。草图使用实际 Obsidian 样式与虚构文章，不用脱离宿主的品牌页面作为验收。
- [ ] 实现测试中的三个状态：无文章、已有成品、源文改变。核对唯一主操作、预览先出现、无建立会话／派生稿／常驻诊断。
- [ ] 用 `ItemView`／`Menu`／`Setting` 组合布局，局部 CSS 继承宿主变量；控制栏不遮挡文章，窗口重开尊重用户停靠位置。
- [ ] 预览 iframe 禁脚本；以当前 ownerDocument/window 创建 DOM，支持弹出窗口。生成 HTML 与显示 HTML 严格分开。
- [ ] 主题优先级：本文章明确选择 → 本次 Agent 指定 → CLI 实际默认；名称失效时说明并回到可用默认，不使用列表首项。
- [ ] 字号／主题变化仅在完成新 本地成品 后切换；连续修改取消旧本地请求，旧结果晚回不得覆盖新结果。
- [ ] 用原生小面板编辑资料，保留中文输入法组合、选区、焦点、滚动位置；资料限额来自 inspect。
- [ ] 带格式复制同时写 HTML/text；在真实公众号编辑器粘贴正文、列表、表格与图片样本，记录本地图片提示。失败不得显示成功 Notice。
- [ ] 手动键盘完成主题选择／复制；200% 文字、减少动态效果、默认明暗和 Minimal 明暗主题截图核对。
- [ ] 删除 main 的旧直连请求和被替代的 view.ts 代码；保留旧命令 ID 为新预览入口的兼容别名，不让已有快捷键失效。
- [ ] 运行 `npm run check`，检查发布产物没有旧 URL 调用或整套手工表单；提交。

**具体界面断言：**

```ts
expect(screen.queryByRole('button', { name: '建立/重建会话' })).toBeNull();
expect(screen.queryByText('派生 Markdown')).toBeNull();
expect(screen.getByTitle('公众号文章预览')).toHaveAttribute('sandbox', '');
expect(screen.getByRole('button', { name: '创建草稿' })).toBeVisible();
```

如不引入 testing-library，用现有 jsdom 原生查询实现同样断言；不为四个断言增加新的运行时框架。

## Task 4：现有命令完成一次草稿创建

**Files:** Create `src/publish/{draft-service,attempt-store,asset-bindings}.ts` 与测试；Create `src/ui/publish-modal.ts` 与测试；不改 CLI。

**Interfaces:**

```ts
type FrozenDraft = {
  resultId: string; htmlFile: string; htmlHash: string;
  account: { name: string; appid: string };
  title: string; author: string; digest: string;
  coverFile: string; coverHash: string;
  assets: Array<{ source: string; localFile: string; sha256: string }>;
};
type DraftOutcome =
  | { kind: 'completed'; mediaId: string; draftUrl?: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'unknown'; attemptId: string; message: string };
async function createConfirmedDraft(input: FrozenDraft): Promise<DraftOutcome>;
```

createConfirmedDraft 由插件最终确认调用；不对 Agent 暴露同名原生命令。

- [ ] 先写故障注入测试，确认前上传／草稿数=0，发布中 convert/preview 调用数=0。
- [ ] 单层原生确认 Modal 显示账号、封面和资料；已有唯一有效账号预选，最终确认不省略。
- [ ] 资料校验使用现有 `inspect ... --draft --cover ... --wechat-account ... --json` 的对应目标结果；不重复维护标题／摘要长度规则。
- [ ] 最终点击重新核对当前原文、成品、资料、封面和账号；用跨窗口独占文件锁及持久化记录防重复。
- [ ] 第一个上传前写 attempt.started。逐项调用现有 upload_image，读取 media_id/wechat_url；每步绑定同一账号，不自行上传、压缩或认证。
- [ ] 在已审阅 HTML 副本中仅替换与实际素材绑定的目标地址；无绑定引用明确报错，不能大范围字符串替换。保留标签、正文与样式。
- [ ] 封面使用上传返回的 media_id；草稿 JSON 使用既有 articles 数组，将处理后的已审阅 HTML 放入 content。
- [ ] 调用现有 `create_draft <json-file> --wechat-account <name> --json` 一次；直接账号省略命名参数并验证身份。
- [ ] 仅有效返回 media_id 才显示成功；超时／断线／进程退出后记录 unknown，不自动再创建。
- [ ] 双击、两个窗口、相同结果换 attemptId、关窗重启验证无第二次草稿请求。保护只承诺本插件主流程，不宣称能阻止用户另开终端直接调用 CLI。
- [ ] 素材已上传时如后续失败，明确记录阶段；不说“没有任何变化”，不自动清理远端素材。
- [ ] 实际公众号测试需要新的明确授权；先完成全部无副作用测试，真实项未执行保持未验收。
- [ ] 检查通过后提交。

**关键断言：**

```text
最终确认前：runner 中 upload_image/create_draft 调用数=0
发布阶段：runner 中 convert/preview 调用数=0
模拟草稿端收到的正文：除绑定图片地址之外，DOM 文本／标签／style 与预览一致
双击／重启／unknown：create_draft 调用次数≤1
```

## Task 5：通用 Agent 与首次接入

**Files:** Create `skills/obsidian-md2wechat/SKILL.md`, `docs/AGENT-COMPATIBILITY.md`, `docs/FIRST-RUN.md`；Modify 插件 README/settings；CLI 仓库 skill 不改。

- [ ] 技能只增加 capture、工作目录、现有 preview 和 present 约定；排版判断复用原 md2wechat skill，不复制 catalog／模块示例全集。
- [ ] 用户用一句“排版 Obsidian 当前文章”发起，多个 Vault 时明确目标，不让 Agent 猜错文章。
- [ ] 指定读取 inputFile，沿用归一素材路径；默认不引入新素材，不改原笔记。
- [ ] 格式化、layout validate、inspect、preview 全成功才 present；source_changed/superseded 必须如实报告未成为当前版。
- [ ] Agent 到展示结束，不执行上传或创建；宿主权限仍走其正常机制，不自动导入账号／密钥。
- [ ] 接入帮助可同时显示多个宿主，不选默认，不劫持其他聊天窗口。
- [ ] 逐个实测 Claude Code、Codex、Claudian、WorkBuddy、ZCode；记录产品版本、系统、skill 哈希和真实回环结果，未测不能打支持勾号。
- [ ] CLI 定位可检测常见安装路径与用户明确路径，不拼接任意配置成 shell；只有失败时展示帮助。
- [ ] 旧配置不在新链路就绪前清除，也不自动迁移密钥；回退旧版仍能使用原配置。
- [ ] 提交安装说明，不包含真实用户路径、账号和文章。

## Task 6：异常、视觉、90 分与发布

**Files:** Create `scripts/workbench-e2e.mjs`, `scripts/recovery-smoke.mjs`, `docs/verification/{experience-matrix,scorecard}.md`；Modify manifest/package/versions/README/CHANGELOG/RELEASE。

- [ ] 建立至少 10 篇短文、长文、标题列表、宽表格、代码、引用、模块、相对／远程图片和复杂路径样本，注明不可改的事实。
- [ ] 实机验证 capture→现有 CLI→present→确认全过程，不直接注入成功状态。
- [ ] 回归改一个字、主题切换中改稿、改名、删除、关窗、重启、候选写一半、磁盘失败，旧成功结果不丢。
- [ ] 回归双宿主、双文章、双 Vault、双窗口、晚到、重复结果，不能串稿。
- [ ] 回归缺 CLI、转换错误、缺图片、账号失效、封面变化、创建超时；按对应操作降级，不阻断无关功能。
- [ ] 默认明暗／Minimal 明暗，320/360/420/640/900px、弹出窗口、200% 文字、减少动态效果和键盘焦点实际截图检查。
- [ ] 带格式内容实际粘贴公众号编辑器；本地图片不能粘贴时明确提示，不默默降级纯文本。
- [ ] 两位非开发者对新旧排版盲评；10 位目标用户测试首次接入与独立完成，不口头教用户绕过缺陷。
- [ ] 按设计 U1–A2 填20项证据，每项5分；全部★通过且≥90才标记体验完成。
- [ ] 全部发现修复后跑一次 `npm run check` 和最终发布资产检查。CLI 未改动，不把重跑整个 CLI 全仓作为每个插件任务的固定成本。
- [ ] 使用三个发布文件演练干净安装、升级和回退；Obsidian 最低安装器与运行版实际符合新入口要求。
- [ ] 具名宿主／系统／用户／真实草稿条件不足时只交付候选版并标未验收，不伪填分数。
- [ ] 根据用户授权另行合并／发布，不自动替换现用 Obsidian、发布文章或删除远端草稿。

## CLI 必要性复核

已运行当前 CLI 的帮助及源码核对、临时正文／素材 inspect 实验，并通过现有预览原样输出／失败不覆盖与草稿内容保留测试。证明普通文件预览及已给定内容创建具备基础；不代表真实上传、最终公众号和所有复杂图片都通过。

stdin/source-path、统一审阅包、CLI 全局创建记录可能对未来多个客户端有价值，但本轮没有必须升级的证据。仅当实际失败无法用小范围笔记适配解决，或插件被迫复制大段 CLI 业务时，才重新提出带失败样本的最小 CLI 改动。

## 覆盖检查与下一步

| 要求 | 对应任务 |
|---|---|
| 官方接力 | 0、2、5 |
| 当前正文与图片 | 1、2、6 |
| 原生预览与复制 | 3、6 |
| 成品恢复与并发 | 2、6 |
| 现有 CLI 创建已审阅内容 | 4、6 |
| 多宿主与首次接入 | 5、6 |
| 90 分、发布与回退 | 6 |

下一步先执行 Task 0 和 Task 1 的隔离验证。只有读到正确当前正文、图片完整、真实预览正确，才推进完整界面；本轮不对 md2wechat CLI 做任何改动。
