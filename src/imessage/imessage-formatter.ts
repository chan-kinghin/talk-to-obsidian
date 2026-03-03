/**
 * Formats agent responses into plain text for iMessage.
 *
 * iMessage has limited rich-text support, so we strip markdown formatting
 * and convert [[wiki-links]] to plain text with obsidian:// URIs appended
 * as a Sources section at the bottom of the message.
 */

/** Maximum message length for iMessage replies. */
const MAX_MESSAGE_LENGTH = 20000;

/**
 * Format an agent response as a plain-text iMessage reply.
 * Strips markdown formatting and appends obsidian:// source links.
 */
export function formatIMessageResponse(
  content: string,
  vaultName: string
): string {
  const sources = extractWikiLinks(content);

  // Replace [[wiki-links]] with plain note names
  let body = content.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // Strip markdown formatting for plain-text readability
  body = stripMarkdown(body);

  // Append source links if any wiki-links were referenced
  if (sources.length > 0) {
    const sourceLines = sources.map((noteName) => {
      const uri = buildObsidianUri(vaultName, noteName);
      return `${noteName}: ${uri}`;
    });

    body += '\n\n---\nSources:\n' + sourceLines.join('\n');
  }

  // Truncate if needed
  if (body.length > MAX_MESSAGE_LENGTH) {
    body = body.slice(0, MAX_MESSAGE_LENGTH - 14) + '\n...(truncated)';
  }

  return body;
}

/**
 * Format an error message for iMessage.
 */
export function formatIMessageError(message: string): string {
  return `Error: ${message}`;
}

/**
 * Strip common markdown formatting to produce readable plain text.
 *
 * Handles:
 *   **bold** / __bold__       -> bold
 *   *italic* / _italic_       -> italic
 *   ~~strikethrough~~         -> strikethrough
 *   `inline code`             -> inline code (no backticks)
 *   ```code blocks```         -> preserved content, fences removed
 *   [link text](url)          -> link text (url)
 *   # headings                -> HEADINGS (uppercase for emphasis)
 */
function stripMarkdown(text: string): string {
  let result = text;

  // Remove fenced code block markers but keep content
  result = result.replace(/```[\s\S]*?```/g, (block) => {
    // Strip opening ``` (with optional language tag) and closing ```
    return block
      .replace(/^```[^\n]*\n?/, '')
      .replace(/\n?```$/, '');
  });

  // Inline code: remove backticks
  result = result.replace(/`([^`]+)`/g, '$1');

  // Bold: **text** or __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');

  // Italic: *text* or _text_ (single markers)
  // Be careful not to strip underscores in the middle of words
  result = result.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1');
  result = result.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');

  // Strikethrough: ~~text~~
  result = result.replace(/~~([^~]+)~~/g, '$1');

  // Markdown links: [text](url) -> text (url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Headings: # Heading -> HEADING
  result = result.replace(/^#{1,6}\s+(.+)$/gm, (_match, heading: string) => {
    return heading.toUpperCase();
  });

  return result;
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
 * Build an obsidian:// URI for opening a note in a specific vault.
 */
function buildObsidianUri(vaultName: string, noteName: string): string {
  const encodedVault = encodeURIComponent(vaultName);
  const encodedFile = encodeURIComponent(noteName);
  return `obsidian://open?vault=${encodedVault}&file=${encodedFile}`;
}
