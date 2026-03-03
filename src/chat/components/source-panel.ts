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
    this.containerEl = parentEl.createDiv({ cls: 'vault-chat-sources vault-chat-hidden' });
    this.onLinkClick = onLinkClick;
    this.resolveLinkFn = resolveLink;
  }

  update(text: string): void {
    const links = extractWikiLinks(text);
    if (links.length === 0) {
      this.containerEl.classList.add('vault-chat-hidden');
      return;
    }

    this.containerEl.empty();
    this.containerEl.classList.remove('vault-chat-hidden');

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
    this.containerEl.classList.add('vault-chat-hidden');
  }
}
