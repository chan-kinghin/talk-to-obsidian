import { App, TFile } from 'obsidian';
import type { VaultTool } from '../../types';

export function createUpdateNoteTool(app: App): VaultTool {
  return {
    definition: {
      name: 'update_note',
      description: 'Replace the entire content of an existing note. Use this to rewrite a note completely.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note to update',
          },
          content: {
            type: 'string',
            description: 'New content to replace the entire note with',
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

      await app.vault.modify(file, content);

      return JSON.stringify({ success: true, path: file.path });
    },
  };
}
