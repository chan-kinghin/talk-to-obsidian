import { EventRef, Vault, TFile, TAbstractFile } from 'obsidian';
import { FTSIndex } from './fts-index';
import { parseFrontmatter, extractTags, stripFrontmatter } from '../utils/frontmatter';
import { debounce } from '../utils/debounce';

export class VaultIndexer {
  private vault: Vault;
  private ftsIndex: FTSIndex;
  private debouncedUpdate: (file: TFile) => void;
  private debouncedRemove: (path: string) => void;

  constructor(vault: Vault, ftsIndex: FTSIndex) {
    this.vault = vault;
    this.ftsIndex = ftsIndex;

    this.debouncedUpdate = debounce((file: TFile) => {
      this.updateFile(file);
    }, 5000);

    this.debouncedRemove = debounce((path: string) => {
      this.removeFile(path);
    }, 5000);
  }

  async buildFullIndex(): Promise<number> {
    await this.ftsIndex.init();

    const files = this.vault.getMarkdownFiles();

    if (files.length === 0) {
      console.log('Vault Chat: No markdown files found in vault');
      return 0;
    }

    let indexed = 0;
    let skipped = 0;

    for (const file of files) {
      try {
        await this.indexFile(file);
        indexed++;
      } catch (e) {
        skipped++;
        console.warn(`Vault Chat: Skipped indexing ${file.path}:`, e);
      }
    }

    if (skipped > 0) {
      console.warn(`Vault Chat: Indexed ${indexed} files, skipped ${skipped} files due to errors`);
    } else {
      console.log(`Vault Chat: Indexed ${indexed} files`);
    }

    return indexed;
  }

  registerEventHandlers(): EventRef[] {
    return [
      this.vault.on('create', (file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.debouncedUpdate(file);
        }
      }),

      this.vault.on('modify', (file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.debouncedUpdate(file);
        }
      }),

      this.vault.on('delete', (file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.debouncedRemove(file.path);
        }
      }),

      this.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.debouncedRemove(oldPath);
          this.debouncedUpdate(file);
        }
      }),
    ];
  }

  async updateFile(file: TFile): Promise<void> {
    try {
      await this.ftsIndex.removeByPath(file.path);
      await this.indexFile(file);
    } catch (e) {
      console.error(`Vault Chat: Failed to update index for ${file.path}:`, e);
    }
  }

  async removeFile(path: string): Promise<void> {
    try {
      await this.ftsIndex.removeByPath(path);
    } catch (e) {
      console.error(`Vault Chat: Failed to remove ${path} from index:`, e);
    }
  }

  private async indexFile(file: TFile): Promise<void> {
    let content: string;
    try {
      content = await this.vault.cachedRead(file);
    } catch (e) {
      console.warn(`Vault Chat: Cannot read ${file.path}, skipping:`, e);
      return;
    }

    if (content.length === 0) {
      return; // Skip empty files
    }

    let frontmatter: Record<string, unknown> = {};
    try {
      frontmatter = parseFrontmatter(content);
    } catch (e) {
      // Malformed frontmatter -- index the file without tags
      console.warn(`Vault Chat: Malformed frontmatter in ${file.path}, indexing without tags`);
    }

    const tags = extractTags(frontmatter);
    const body = stripFrontmatter(content);

    if (body.trim().length === 0) {
      return; // Skip files with only frontmatter and no body
    }

    await this.ftsIndex.insertDocument({
      content: body,
      fileName: file.basename,
      filePath: file.path,
      tags,
    });
  }
}
