import { App, TFile } from 'obsidian';
import type { VaultTool } from '../../types';

export function createAppendNoteTool(app: App): VaultTool {
  return {
    definition: {
      name: 'append_to_note',
      description: 'Append content to the end of an existing note without overwriting existing content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note to append to',
          },
          content: {
            type: 'string',
            description: 'Content to append at the end of the note',
          },
        },
        required: ['path', 'content'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const path = String(args.path ?? '');
      const content = String(args.content ?? '');

      if (!path) {
        return JSON.stringify({ error: 'Path cannot be empty' });
      }

      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return JSON.stringify({ error: `File not found: ${path}` });
      }

      const existing = await app.vault.read(file);
      const separator = existing.endsWith('\n') ? '\n' : '\n\n';
      await app.vault.modify(file, existing + separator + content);

      return JSON.stringify({ success: true, path: file.path });
    },
  };
}
