import { TFile, TFolder, Vault } from 'obsidian';
import type { VaultTool } from '../../types';

export function createListFolderTool(vault: Vault): VaultTool {
  return {
    definition: {
      name: 'list_folder',
      description: 'List files and subfolders in a vault folder. Use this to browse the vault structure. If no path is given, lists the vault root.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Folder path to list (default: vault root "/")',
          },
        },
        required: [],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const path = String(args.path ?? '/').replace(/^\/+/, '');

      const folder = path === ''
        ? vault.getRoot()
        : vault.getAbstractFileByPath(path);

      if (!folder || !(folder instanceof TFolder)) {
        return JSON.stringify({ error: `Folder not found: ${path || '/'}` });
      }

      const items = folder.children.map((child) => ({
        name: child.name,
        type: child instanceof TFile ? 'file' : 'folder',
      }));

      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return JSON.stringify(items);
    },
  };
}
