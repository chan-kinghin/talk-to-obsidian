import { App, TFile } from 'obsidian';
import type { VaultTool } from '../../types';

export function createSearchByTagTool(app: App): VaultTool {
  return {
    definition: {
      name: 'search_by_tag',
      description: 'Find all notes that have a specific tag. Returns note titles and paths.',
      parameters: {
        type: 'object',
        properties: {
          tag: {
            type: 'string',
            description: 'Tag to search for (with or without # prefix)',
          },
        },
        required: ['tag'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const rawTag = String(args.tag ?? '').trim();
      if (!rawTag) {
        return JSON.stringify({ error: 'Tag cannot be empty' });
      }

      // Normalize: ensure tag starts with #
      const normalizedTag = rawTag.startsWith('#') ? rawTag : `#${rawTag}`;

      const results: { title: string; path: string }[] = [];
      const files = app.vault.getMarkdownFiles();

      for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache) continue;

        const hasFrontmatterTag = cache.frontmatter?.tags?.some?.(
          (t: string) => `#${t.replace(/^#/, '')}` === normalizedTag
        );

        const hasInlineTag = cache.tags?.some(
          (t) => t.tag === normalizedTag
        );

        if (hasFrontmatterTag || hasInlineTag) {
          results.push({
            title: file.basename,
            path: file.path,
          });
        }
      }

      return JSON.stringify(results);
    },
  };
}
