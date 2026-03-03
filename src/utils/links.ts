import { App, TFile } from 'obsidian';

/**
 * Extract all [[wiki-links]] from text content.
 * Returns array of link targets (the text inside [[ ]]).
 */
export function extractWikiLinks(text: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    links.push(match[1].trim());
  }

  return links;
}

/**
 * Resolve a wiki-link target to a file path using the Obsidian app.
 * Returns the file path if found, null otherwise.
 */
export function resolveWikiLink(app: App, linkText: string): string | null {
  // Try exact path first
  const exactFile = app.vault.getAbstractFileByPath(linkText);
  if (exactFile instanceof TFile) {
    return exactFile.path;
  }

  // Try with .md extension
  const mdFile = app.vault.getAbstractFileByPath(linkText + '.md');
  if (mdFile instanceof TFile) {
    return mdFile.path;
  }

  // Try metadataCache for short names
  const file = app.metadataCache.getFirstLinkpathDest(linkText, '');
  if (file) {
    return file.path;
  }

  return null;
}
