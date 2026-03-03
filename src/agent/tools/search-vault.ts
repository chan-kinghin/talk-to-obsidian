import type { VaultTool } from '../../types';
import type { FTSIndex } from '../../search/fts-index';

export function createSearchVaultTool(ftsIndex: FTSIndex): VaultTool {
  return {
    definition: {
      name: 'search_vault',
      description: 'Search the vault using full-text search. Returns matching note titles, paths, and short snippets. Use this to discover relevant notes before reading them.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant notes',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 10)',
          },
        },
        required: ['query'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const query = String(args.query ?? '');
      const limit = typeof args.limit === 'number' ? args.limit : 10;

      if (!query.trim()) {
        return JSON.stringify({ error: 'Query cannot be empty' });
      }

      const results = await ftsIndex.search(query, limit);

      return JSON.stringify(
        results.map((r) => ({
          title: r.fileName,
          path: r.filePath,
          snippet: r.snippet,
          tags: r.tags,
        }))
      );
    },
  };
}
