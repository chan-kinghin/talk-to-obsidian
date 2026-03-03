import { extractWikiLinks } from '../../utils/links';

export class SourcePanel {
  private containerEl: HTMLElement;
  private onLinkClick: (filePath: string) => void;
  private resolveLinkFn: (linkText: string) => string | null;

  constructor(
    parentEl: HTMLElement,
    onLinkClick: (filePath: string) => void,
    resolveLink: (linkText: string) => string | null
  ) {
    this.containerEl = parentEl.createDiv({ cls: 'vault-chat-sources' });
    this.onLinkClick = onLinkClick;
    this.resolveLinkFn = resolveLink;
    this.containerEl.style.display = 'none';
  }

  update(text: string): void {
    const links = extractWikiLinks(text);
    if (links.length === 0) {
      this.containerEl.style.display = 'none';
      return;
    }

    this.containerEl.empty();
    this.containerEl.style.display = 'block';

    const headerEl = this.containerEl.createDiv({ cls: 'vault-chat-sources-header' });
    headerEl.textContent = 'Sources';

    const seen = new Set<string>();
    for (const link of links) {
      if (seen.has(link.toLowerCase())) continue;
      seen.add(link.toLowerCase());

      const filePath = this.resolveLinkFn(link);
      const linkEl = this.containerEl.createDiv({ cls: 'vault-chat-source-link' });
      linkEl.textContent = `[[${link}]]`;

      if (filePath) {
        linkEl.classList.add('vault-chat-source-link-resolved');
        linkEl.addEventListener('click', () => {
          this.onLinkClick(filePath);
        });
      } else {
        linkEl.classList.add('vault-chat-source-link-unresolved');
      }
    }
  }

  clear(): void {
    this.containerEl.empty();
    this.containerEl.style.display = 'none';
  }
}
