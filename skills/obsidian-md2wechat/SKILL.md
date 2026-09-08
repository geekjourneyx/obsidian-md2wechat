---
name: obsidian-md2wechat
description: Format the current Obsidian article with the existing md2wechat CLI and return its preview to the Obsidian publishing plugin. Use when the user asks to typeset an Obsidian note for WeChat.
---

# Obsidian article handoff

Requires desktop Obsidian and installer 1.12.7+, its official CLI enabled, the MD2WeChat Publisher plugin, and the existing md2wechat CLI. Works through local commands and files; no Agent-specific API or server is involved.

1. Identify the intended Vault. If several are open and the user has not identified one, ask which Vault; never guess a different article. The Vault selector precedes the command:

   ```text
   obsidian vault="<vault>" md2wechat-publisher:capture
   ```

   Optionally append `source="<vault-relative-note.md>"` only when the user specifies another article. Parse the returned JSON. On an error, report the actual error and do not fall back to an arbitrary disk note.

2. Read `inputFile`. For a request to refine an earlier result, also read `previousResult.markdownFile` when returned, while respecting its stale/current state. The input file contains the captured editor content and normalized image references. Read the installed md2wechat skill when available and use existing `md2wechat capabilities`, `themes list`, and `layout` commands as needed. Preserve facts, claims, and author intent. Write the formatted Markdown to `<workDir>/formatted.md`. Preserve normalized `assets/...` references; do not modify the original note or introduce new images by default.

3. Validate any layout modules with existing `md2wechat layout validate` following its actual help. Run:

   ```text
   md2wechat inspect "<workDir>/formatted.md" --json
   md2wechat preview "<workDir>/formatted.md" --theme <chosen-theme> --output "<workDir>/preview.html" --json
   ```

   Save the complete real preview stdout as `<workDir>/preview-response.json`. Require successful `PREVIEW_READY`, `status=completed`, and the actual nonempty output file. Do not fabricate the response file or substitute locally generated HTML. Do not overwrite the captured `input.md`.

4. Return the result through the same Vault:

   ```text
   obsidian vault="<vault>" md2wechat-publisher:present request=<requestId> markdown="<workDir>/formatted.md" preview="<workDir>/preview.html" response="<workDir>/preview-response.json"
   ```

   `presented` means the plugin adopted the result. `source_changed` means the source changed and the result is retained for comparison but cannot be used to create a draft. `superseded` means a newer request exists; do not claim the older result became current.

The handoff ends at preview. The user confirms account, cover and article details in Obsidian. This flow does not authorize uploading images or creating/publishing drafts from the Agent. Do not run `upload_image`, `create_draft`, or conversion options that upload/publish as part of formatting.

If the CLI is missing or disabled, explain the one missing setup step. A conversion endpoint/configuration failure belongs to existing md2wechat configuration; do not silently rewrite the user's config, switch accounts, install a private bridge, or alter the CLI repository.
