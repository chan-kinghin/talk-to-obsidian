import { create, insert, remove, search, count } from '@orama/orama';
import type { SearchResult } from '../types';

// Use a simple type for the Orama instance since the generic types are complex
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OramaDB = any;

const SCHEMA = {
  content: 'string' as const,
  fileName: 'string' as const,
  filePath: 'string' as const,
  tags: 'string[]' as const,
};

interface IndexedDoc {
  content: string;
  fileName: string;
  filePath: string;
  tags: string[];
}

/** Maximum content length to index per file (100KB). Larger files get truncated. */
const MAX_CONTENT_LENGTH = 100_000;

export class FTSIndex {
  private db: OramaDB | null = null;

  async init(): Promise<void> {
    this.db = await create({
      schema: SCHEMA,
    });
  }

  async insertDocument(doc: IndexedDoc): Promise<void> {
    if (!this.db) {
      throw new Error('FTS index not initialized');
    }

    // Truncate very large content to prevent memory issues
    const content = doc.content.length > MAX_CONTENT_LENGTH
      ? doc.content.slice(0, MAX_CONTENT_LENGTH)
      : doc.content;

    await insert(this.db, {
      content,
      fileName: doc.fileName,
      filePath: doc.filePath,
      tags: doc.tags,
    });
  }

  async removeByPath(filePath: string): Promise<void> {
    if (!this.db) {
      return; // Nothing to remove if index not initialized
    }

    try {
      const results = await search(this.db, {
        term: filePath,
        properties: ['filePath'],
        limit: 10,
      });

      for (const hit of results.hits) {
        const doc = hit.document as IndexedDoc;
        if (doc.filePath === filePath) {
          await remove(this.db, hit.id);
        }
      }
    } catch (e) {
      console.warn(`Vault Chat: Failed to remove "${filePath}" from index:`, e);
    }
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    if (!this.db) {
      return [];
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return [];
    }

    try {
      const results = await search(this.db, {
        term: trimmedQuery,
        limit,
        properties: ['content', 'fileName', 'tags'],
      });

      return results.hits.map((hit: { document: IndexedDoc; score: number }) => {
        const doc = hit.document;
        const snippet = this.extractSnippet(doc.content, trimmedQuery);
        return {
          fileName: doc.fileName,
          filePath: doc.filePath,
          snippet,
          score: hit.score,
          tags: doc.tags,
        };
      });
    } catch (e) {
      console.error('Vault Chat: Search error:', e);
      return [];
    }
  }

  async getDocumentCount(): Promise<number> {
    if (!this.db) {
      return 0;
    }
    try {
      return await count(this.db);
    } catch (e) {
      console.error('Vault Chat: Count error:', e);
      return 0;
    }
  }

  async clear(): Promise<void> {
    await this.init();
  }

  private extractSnippet(content: string, query: string): string {
    const maxLength = 150;
    const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();

    if (body.length === 0) {
      return '';
    }

    const lowerBody = body.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const terms = lowerQuery.split(/\s+/).filter(t => t.length > 2);

    let bestPos = -1;
    for (const term of terms) {
      const pos = lowerBody.indexOf(term);
      if (pos !== -1) {
        bestPos = pos;
        break;
      }
    }

    if (bestPos === -1) {
      return body.slice(0, maxLength) + (body.length > maxLength ? '...' : '');
    }

    const start = Math.max(0, bestPos - 40);
    const end = Math.min(body.length, start + maxLength);
    let snippet = body.slice(start, end);

    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < body.length) {
      snippet = snippet + '...';
    }

    return snippet;
  }
}
