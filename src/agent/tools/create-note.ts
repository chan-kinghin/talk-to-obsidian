import { App, TFile, normalizePath } from 'obsidian';
import type { VaultTool } from '../../types';

export function createCreateNoteTool(app: App): VaultTool {
  return {
    definition: {
      name: 'create_note',
      description: 'Create a new note in the vault. Provide the path (including .md extension) and content. Optionally include frontmatter as an object.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path for the new note (e.g. "Projects/My Note.md")',
          },
          content: {
            type: 'string',
            description: 'Markdown content of the note',
          },
          frontmatter: {
            type: 'object',
            description: 'Optional YAML frontmatter fields (e.g. { tags: ["project"], status: "active" })',
          },
        },
        required: ['path', 'content'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const path = normalizePath(String(args.path ?? ''));
      const content = String(args.content ?? '');
      const frontmatter = args.frontmatter as Record<string, unknown> | undefined;

      if (!path) {
        return JSON.stringify({ error: 'Path cannot be empty' });
      }

      // Ensure path ends with .md
      const filePath = path.endsWith('.md') ? path : path + '.md';

      // Check if file already exists
      const existing = app.vault.getAbstractFileByPath(filePath);
      if (existing) {
        return JSON.stringify({ error: `File already exists: ${filePath}` });
      }

      // Build full content with optional frontmatter
      let fullContent = '';
      if (frontmatter && Object.keys(frontmatter).length > 0) {
        fullContent += '---\n';
        for (const [key, value] of Object.entries(frontmatter)) {
          if (Array.isArray(value)) {
            fullContent += `${key}: [${value.map(v => String(v)).join(', ')}]\n`;
          } else {
            fullContent += `${key}: ${String(value)}\n`;
          }
        }
        fullContent += '---\n\n';
      }
      fullContent += content;

      // Create parent directories if needed
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dir) {
        const dirExists = app.vault.getAbstractFileByPath(dir);
        if (!dirExists) {
          await app.vault.createFolder(dir);
        }
      }

      await app.vault.create(filePath, fullContent);

      return JSON.stringify({ success: true, path: filePath });
    },
  };
}
