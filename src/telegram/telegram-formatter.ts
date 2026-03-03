/**
 * Formats agent responses into plain-text messages for Telegram.
 *
 * Uses plain text (no parse_mode) for reliability -- avoids the
 * complexity and fragility of Telegram MarkdownV2 escaping.
 * Extracts [[wiki-links]] and appends them as obsidian:// URIs.
 */

/** Telegram message character limit */
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Format an agent response into a plain-text Telegram message.
 * Replaces [[wiki-links]] with plain text in the body and appends
 * obsidian:// source URIs at the bottom.
 */
export function formatTelegramResponse(content: string, vaultName: string): string {
  const sources = extractWikiLinks(content);

  // Replace [[wiki-links]] with plain text in the body
  let body = content.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // Append source links if any wiki-links were found
  if (sources.length > 0) {
    const sourceLines = sources.map((noteName) => {
      const uri = buildObsidianUri(vaultName, noteName);
      return `  ${noteName}: ${uri}`;
    });

    body += '\n\n---\nSources:\n' + sourceLines.join('\n');
  }

  // Truncate to Telegram's message limit
  if (body.length > MAX_MESSAGE_LENGTH) {
    const suffix = '\n\n...(truncated)';
    body = body.slice(0, MAX_MESSAGE_LENGTH - suffix.length) + suffix;
  }

  return body;
}

/**
 * Format an error message for Telegram (plain text).
 */
export function formatTelegramError(message: string): string {
  const text = `Error: ${message}`;
  if (text.length > MAX_MESSAGE_LENGTH) {
    return text.slice(0, MAX_MESSAGE_LENGTH - 3) + '...';
  }
  return text;
}

/**
 * Extract all [[wiki-link]] note names from markdown content.
 * Returns deduplicated list preserving first-occurrence order.
 */
function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      links.push(name);
    }
  }

  return links;
}

/**
 * Build an obsidian:// URI for opening a note.
 */
function buildObsidianUri(vaultName: string, noteName: string): string {
  const encodedVault = encodeURIComponent(vaultName);
  const encodedFile = encodeURIComponent(noteName);
  return `obsidian://open?vault=${encodedVault}&file=${encodedFile}`;
}
