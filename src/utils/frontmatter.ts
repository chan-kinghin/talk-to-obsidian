/**
 * Parse YAML frontmatter from markdown content.
 * Returns a key-value object from the YAML block between --- delimiters.
 * Returns an empty object if no frontmatter or if parsing fails.
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
  if (!content || typeof content !== 'string') {
    return {};
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }

  const yaml = match[1];
  const result: Record<string, unknown> = {};

  try {
    for (const line of yaml.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, colonIndex).trim();
      let value: unknown = trimmed.slice(colonIndex + 1).trim();

      if (!key) {
        continue;
      }

      // Parse YAML-style arrays: [item1, item2]
      if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        value = value
          .slice(1, -1)
          .split(',')
          .map((s: string) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s: string) => s.length > 0);
      }
      // Parse booleans
      else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      }
      // Parse numbers
      else if (typeof value === 'string' && value !== '' && !isNaN(Number(value))) {
        value = Number(value);
      }
      // Strip surrounding quotes from strings
      else if (typeof value === 'string' && value.length >= 2) {
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
      }

      result[key] = value;
    }
  } catch {
    // Malformed frontmatter -- return whatever was parsed so far
    return result;
  }

  return result;
}

/**
 * Extract tags from frontmatter. Handles both array and string formats.
 */
export function extractTags(frontmatter: Record<string, unknown>): string[] {
  const tags = frontmatter['tags'];
  if (Array.isArray(tags)) {
    return tags.map(String);
  }
  if (typeof tags === 'string') {
    return tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }
  return [];
}

/**
 * Strip frontmatter from markdown content, returning just the body.
 */
export function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}
