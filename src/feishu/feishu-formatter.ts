/**
 * Formats agent responses into Feishu card message format.
 *
 * Converts markdown text to Feishu's lark_md format and wraps it in a
 * card message structure with source links as obsidian:// URIs.
 */

export interface FeishuCardMessage {
  msg_type: 'interactive';
  card: {
    header: {
      title: { tag: 'plain_text'; content: string };
      template?: string;
    };
    elements: FeishuCardElement[];
  };
}

type FeishuCardElement =
  | { tag: 'div'; text: { tag: 'lark_md'; content: string } }
  | { tag: 'hr' }
  | { tag: 'note'; elements: Array<{ tag: 'lark_md'; content: string }> };

/**
 * Convert a markdown agent response into a Feishu interactive card message.
 * Extracts [[wiki-links]] and appends them as obsidian:// URI source links.
 */
export function formatFeishuCard(
  content: string,
  vaultName: string
): FeishuCardMessage {
  const body = convertMarkdownToLarkMd(content);
  const sources = extractWikiLinks(content);

  const elements: FeishuCardElement[] = [
    { tag: 'div', text: { tag: 'lark_md', content: body } },
  ];

  if (sources.length > 0) {
    elements.push({ tag: 'hr' });

    const sourceLines = sources.map((noteName) => {
      const uri = buildObsidianUri(vaultName, noteName);
      return `[${noteName}](${uri})`;
    });

    elements.push({
      tag: 'note',
      elements: [
        { tag: 'lark_md', content: `Sources: ${sourceLines.join(' | ')}` },
      ],
    });
  }

  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: 'Vault Chat' },
        template: 'blue',
      },
      elements,
    },
  };
}

/**
 * Build a simple text-only Feishu card (for errors or short messages).
 */
export function formatFeishuErrorCard(message: string): FeishuCardMessage {
  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: 'Vault Chat' },
        template: 'red',
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: message } },
      ],
    },
  };
}

/**
 * Convert standard markdown to Feishu lark_md.
 * Feishu lark_md supports: **bold**, *italic*, ~~strikethrough~~,
 * [links](url), `code`, code blocks, and basic lists.
 * This function handles edge cases that differ from standard markdown.
 */
function convertMarkdownToLarkMd(md: string): string {
  // Feishu lark_md is largely compatible with standard markdown.
  // Main adjustments:
  // - Replace [[wiki-links]] with plain text (sources are shown separately)
  // - Truncate excessively long responses to stay within Feishu limits
  let result = md;

  // Replace [[wiki-links]] with bold text
  result = result.replace(/\[\[([^\]]+)\]\]/g, '**$1**');

  // Feishu card content limit is ~30,000 chars. Truncate if needed.
  const MAX_CONTENT_LENGTH = 28000;
  if (result.length > MAX_CONTENT_LENGTH) {
    result = result.slice(0, MAX_CONTENT_LENGTH) + '\n\n...(truncated)';
  }

  return result;
}

/**
 * Extract all [[wiki-link]] note names from markdown content.
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
