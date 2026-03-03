import { App, TFile } from 'obsidian';
import type { VaultTool } from '../../types';

export function createGetBacklinksTool(app: App): VaultTool {
  return {
    definition: {
      name: 'get_backlinks',
      description: 'Get all notes that link TO the specified note (incoming links). Use this to explore the knowledge graph inward.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file',
          },
        },
        required: ['path'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const path = String(args.path ?? '');
      if (!path) {
        return JSON.stringify({ error: 'Path cannot be empty' });
      }

      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return JSON.stringify({ error: `File not found: ${path}` });
      }

      const backlinks: { title: string; path: string }[] = [];
      const resolvedLinks = app.metadataCache.resolvedLinks;

      for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
        if (links[path] !== undefined) {
          const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
          if (sourceFile instanceof TFile) {
            backlinks.push({
              title: sourceFile.basename,
              path: sourceFile.path,
            });
          }
        }
      }

      return JSON.stringify(backlinks);
    },
  };
}
