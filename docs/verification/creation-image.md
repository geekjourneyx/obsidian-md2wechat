# Local image generation verification — 2026-09-12

Verified on this macOS development machine, outside Obsidian, through the actual `src/images/local-generator.ts` implementation bundled temporarily with esbuild. This is not an assertion of Windows, mobile, or complete UI compatibility.

## Result

One real request succeeded, with no retries. The existing md2wechat configuration supplied the Volcengine provider and `doubao-seedream-5-0-260128` model. The source configuration was not changed. The neutral prompt requested a ceramic cup and closed notebook on a light desk, with no text or people, in a horizontal composition.

Saved local output: `/private/tmp/md2wechat-local-cover-verification/b13bd388-e0d4-4df1-abd6-f959489518ee.png`.

Verified file: PNG, 3,592,548 bytes, 2848 × 1600 pixels. Opened and visually inspected: the image shows the requested cup and notebook with no visible text or people. No source note was read or written. No WeChat upload or draft request was made. This was a real provider request and may incur the account's normal image-generation charge; billing amount was not queried.

## Configuration and size

The installed CLI is 3.5.0. Its direct image commands require WeChat operations, so this implementation uses its documented configuration discovery to retrieve resolved image settings, then sends only the standalone image generation request. The CLI child process inherits the current environment: its normal environment-over-file configuration precedence is retained. There is no configuration initialization, migration, or new key setting.

The existing configuration contains the older generic `1024x1024` size. For non-Pro Seedream 5.0, an explicit pixel size below 3,686,400 pixels is normalized to `2K` for the request only. This successful request used `2K`. The tagged upstream provider documentation explicitly lists `2K` as the common Seedream 5.0 default: https://github.com/geekjourneyx/md2wechat-skill/blob/v3.5.0/docs/IMAGE_PROVISIONERS.md . The provider API documentation entry is https://www.volcengine.com/docs/82379/1541523 ; its redirected page was not readable through the browsing tool during this verification, so we do not claim its full current size matrix was inspected.

## Automated boundaries

16 tests pass in `src/images/local-generator.test.ts`: local saving; readiness without a paid call or secret output; HTTPS and WeChat host restrictions; unsupported provider; no forwarding of credentials to the download; generic errors without raw provider details; invalid file content; preflight and in-flight cancellation; private DNS rejection; maximum download size; redirect refusal; process-error redaction; undersized legacy configuration handling.

Generation and download use public DNS address checks with pinned connection lookup, a bounded overall duration and byte limits, and no retries. Configuration stdout is handled only in a dedicated process callback; neither it nor provider error bodies are logged. The output uses a unique filename and private file permissions. Current support is deliberately limited to the existing Volcengine provider. Only PNG and JPEG URL results are accepted; there is no unverified base64 path.

## 图片风格选择补充验证

真实 CLI `prompts list --kind image --json` 返回 25 种图片预设，其中 11 种封面和 3 种兼容封面的信息图，合计 14 种封面可选风格。界面数量不写死，按发现结果筛选。已知方案使用带用途前缀的中文短名，新增未知方案回退到说明或可读名称。

自动验证分别对 `infographic-handdrawn-sketchnote` 和 `infographic-apple-keynote-premium` 使用同一份自建段落执行 `generate_image --preset ... --article ... --plan --json`。两者返回 IMAGE_PLAN_READY、正确 preset、side_effects=false，提示词包含原段落且不同。这次只验证方案准备，没有发起新的付费生图或微信请求。正文窗口将实际所选 preset 传给这条路径，并追加不捏造原文以外事实或数据的约束；没有用统一的禁止文字要求覆盖信息图方案。
