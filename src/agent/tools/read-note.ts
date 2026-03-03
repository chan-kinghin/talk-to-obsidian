import { App, TFile } from 'obsidian';
import type { VaultTool } from '../../types';

export function createReadNoteTool(app: App): VaultTool {
  return {
    definition: {
      name: 'read_note',
      description: 'Read the full content of a note, or a specific section under a heading. Use this after discovering a relevant note via search or metadata.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note file',
          },
          heading: {
            type: 'string',
            description: 'Optional heading to read only that section (e.g. "## Summary")',
          },
        },
        required: ['path'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const path = String(args.path ?? '');
      const heading = args.heading ? String(args.heading) : undefined;

      if (!path) {
        return JSON.stringify({ error: 'Path cannot be empty' });
      }

      const file = app.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return JSON.stringify({ error: `File not found: ${path}` });
      }

      const content = await app.vault.read(file);

      if (!heading) {
        return content;
      }

      // Extract section under the specified heading
      const section = extractSection(content, heading);
      if (section === null) {
        return JSON.stringify({ error: `Heading not found: ${heading}` });
      }

      return section;
    },
  };
}

function extractSection(content: string, heading: string): string | null {
  const lines = content.split('\n');
  const normalizedHeading = heading.replace(/^#+\s*/, '').toLowerCase().trim();

  let startIndex = -1;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].toLowerCase().trim();

      if (text === normalizedHeading) {
        startIndex = i;
        headingLevel = level;
        break;
      }
    }
  }

  if (startIndex === -1) {
    return null;
  }

  // Find the end of the section (next heading of same or higher level)
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= headingLevel) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
}
