/**
 * AllowlistFilter — filters incoming messages by user ID or address.
 *
 * Parses a comma-separated string of allowed identifiers.
 * An empty allowlist permits all senders (convenience default).
 */
export class AllowlistFilter {
  private allowed: Set<string>;

  constructor(commaList: string) {
    this.allowed = new Set(
      commaList
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    );
  }

  /**
   * Returns true if the given ID is allowed.
   * If no allowlist was configured (empty), all IDs are allowed.
   */
  isAllowed(id: string): boolean {
    if (this.allowed.size === 0) {
      return true;
    }
    return this.allowed.has(id.trim());
  }
}
