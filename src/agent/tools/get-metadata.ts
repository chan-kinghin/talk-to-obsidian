import { App, TFile } from 'obsidian';
import type { VaultTool } from '../../types';

export function createGetMetadataTool(app: App): VaultTool {
  return {
    definition: {
      name: 'get_note_metadata',
      description: 'Get the frontmatter metadata of a note (tags, status, date, type, etc.) without reading the full content. Use this for quick filtering.',
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

      const cache = app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter ?? {};

      // Remove position info that Obsidian adds internally
      const { position, ...metadata } = frontmatter;

      return JSON.stringify({
        path: file.path,
        name: file.basename,
        metadata,
        created: file.stat.ctime,
        modified: file.stat.mtime,
        size: file.stat.size,
      });
    },
  };
}
