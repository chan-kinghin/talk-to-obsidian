export class InputBar {
  private containerEl: HTMLElement;
  private textareaEl: HTMLTextAreaElement;
  private sendBtnEl: HTMLButtonElement;
  private onSubmit: (text: string) => void;

  constructor(parentEl: HTMLElement, onSubmit: (text: string) => void) {
    this.onSubmit = onSubmit;

    this.containerEl = parentEl.createDiv({ cls: 'vault-chat-input-bar' });

    const wrapperEl = this.containerEl.createDiv({ cls: 'vault-chat-input-wrapper' });

    this.textareaEl = wrapperEl.createEl('textarea', {
      cls: 'vault-chat-input',
      attr: {
        placeholder: 'Search your vault...',
        rows: '1',
      },
    });

    this.sendBtnEl = this.containerEl.createEl('button', {
      cls: 'vault-chat-send-btn',
      text: '\u2191',
      attr: {
        'aria-label': 'Send',
      },
    });

    this.setupListeners();
  }

  focus(): void {
    this.textareaEl.focus();
  }

  setEnabled(enabled: boolean): void {
    this.textareaEl.disabled = !enabled;
    this.sendBtnEl.disabled = !enabled;
  }

  clear(): void {
    this.textareaEl.value = '';
    this.autoResize();
  }

  private setupListeners(): void {
    this.textareaEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSubmit();
      }
    });

    this.sendBtnEl.addEventListener('click', () => {
      this.handleSubmit();
    });

    this.textareaEl.addEventListener('input', () => {
      this.autoResize();
    });
  }

  private handleSubmit(): void {
    const text = this.textareaEl.value.trim();
    if (text.length === 0) {
      return;
    }
    this.onSubmit(text);
    this.clear();
  }

  private autoResize(): void {
    this.textareaEl.style.height = 'auto';
    const scrollHeight = this.textareaEl.scrollHeight;
    const maxHeight = 120;
    this.textareaEl.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }
}
