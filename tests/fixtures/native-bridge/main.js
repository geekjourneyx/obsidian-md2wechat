const { Plugin, MarkdownView } = require('obsidian');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = class Probe extends Plugin {
  async onload() {
    this.registerCliHandler('md2wechat-probe:capture', 'Read the active editor buffer', null, async () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file) throw new Error('No active Markdown editor');
      return JSON.stringify({ ok: true, marker: view.editor.getValue(), source: view.file.path });
    });
    this.registerCliHandler('md2wechat-probe:present', 'Prove asynchronous output', {
      marker: { value: '<text>', description: 'Round-trip marker', required: true },
    }, async ({ marker }) => {
      await new Promise(resolve => setTimeout(resolve, 200));
      await fs.writeFile(path.join(this.app.vault.adapter.getBasePath(), 'probe-result.json'), JSON.stringify({ marker }));
      return JSON.stringify({ ok: true, marker });
    });
  }
};
