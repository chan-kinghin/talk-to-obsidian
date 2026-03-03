import { App, TFile } from 'obsidian';
import type { VaultTool } from '../../types';

export function createGetOutgoingTool(app: App): VaultTool {
  return {
    definition: {
      name: 'get_outgoing_links',
      description: 'Get all notes that the specified note links TO (outgoing links). Use this to explore the knowledge graph outward.',
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

      const resolvedLinks = app.metadataCache.resolvedLinks[path];
      if (!resolvedLinks) {
        return JSON.stringify([]);
      }

      const outgoing: { title: string; path: string }[] = [];
      for (const targetPath of Object.keys(resolvedLinks)) {
        const targetFile = app.vault.getAbstractFileByPath(targetPath);
        if (targetFile instanceof TFile) {
          outgoing.push({
            title: targetFile.basename,
            path: targetFile.path,
          });
        }
      }

      return JSON.stringify(outgoing);
    },
  };
}
