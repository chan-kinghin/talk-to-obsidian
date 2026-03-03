# Vault Chat

An Obsidian plugin that lets you **chat with your vault using an agentic AI** — like having a knowledgeable assistant that can search, read, and write your notes.

## How it works

Unlike traditional RAG (retrieval-augmented generation), Vault Chat uses an **agentic tool-use approach**. The LLM has access to vault tools and decides what to search, read, or write — progressively discovering relevant information through multiple steps.

**No embeddings, no vector database, no pre-processing pipeline.** Just a lightweight full-text search index and direct vault access.

## Features

- **Agentic chat** — Ask questions and the AI searches, reads, and synthesizes answers from your notes
- **Progressive disclosure** — The agent starts broad (search), peeks at metadata, then reads full notes as needed
- **10 vault tools** — Search, list folders, filter by tag, read metadata, explore backlinks/outgoing links, read notes, create/update/append notes
- **Two modes** — Read-only (search + read) or Full (includes write operations)
- **Session memory** — Follow-up questions work naturally within a conversation
- **Streaming responses** — Tokens appear incrementally as the AI thinks
- **Source citations** — Clickable `[[wiki-links]]` to jump to referenced notes
- **Tool activity visibility** — See what the agent is doing (collapsible in chat)
- **Feishu bot** (optional) — Query your vault from your phone via Feishu DM (desktop only)
- **Any OpenAI-compatible LLM** — DashScope, OpenAI, Anthropic, Ollama, etc.

## Installation

### From community plugins (recommended)

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Search for "Vault Chat"
4. Click Install, then Enable

### Via BRAT (beta)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. In BRAT settings, click "Add beta plugin"
3. Enter: `chan-kinghin/talk-to-obsidian`

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/chan-kinghin/talk-to-obsidian/releases)
2. Create a folder: `<your-vault>/.obsidian/plugins/vault-chat/`
3. Copy the three files into that folder
4. Restart Obsidian and enable the plugin in Settings > Community Plugins

## Setup

1. **Get an API key** from your LLM provider (e.g., [DashScope](https://dashscope.console.aliyun.com/), [OpenAI](https://platform.openai.com/))
2. Open Settings > Vault Chat
3. Enter your API key, endpoint, and model name
4. Click "Test" to verify the connection
5. Open the chat panel via the ribbon icon or the command "Open Vault Chat"

### Default configuration

| Setting | Default |
|---------|---------|
| Endpoint | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Model | `qwen-plus` |
| Mode | Read-only |
| Max conversation turns | 20 |
| Max tool rounds | 10 |

You can use **any OpenAI-compatible endpoint** — just change the endpoint URL and model name.

## Usage

Open the Vault Chat panel from the ribbon icon (chat bubble) or run the command "Open Vault Chat".

**Example queries:**
- "What are my active projects?"
- "Find all notes tagged with #meeting from this month"
- "Summarize my reading notes on machine learning"
- "Create a summary note from my recent meeting notes" (full mode)

The agent will search your vault, read relevant notes, and synthesize an answer with `[[source]]` citations you can click to jump to.

### Mode toggle

- **Read-only** — Can search, browse, and read notes (Level 1-3 tools)
- **Full** — Can also create, update, and append notes (Level 4 tools)

Toggle between modes using the button in the chat header.

## Feishu bot (optional)

Query your vault from your phone via Feishu DM. Desktop only, read-only mode.

### Setup

1. Create a Feishu app at [Feishu Open Platform](https://open.feishu.cn/)
2. Enable the "Bot" capability
3. Add event subscription for `im.message.receive_v1`
4. In Obsidian Settings > Vault Chat > Feishu Integration:
   - Enable the Feishu bot
   - Enter your App ID and App Secret
5. The bot connects via WebSocket (no public URL needed)

## Vault tools reference

| Level | Tool | Description |
|-------|------|-------------|
| 1 | `search_vault` | Full-text search across all notes |
| 1 | `list_folder` | Browse vault folder structure |
| 1 | `search_by_tag` | Find notes by tag |
| 2 | `get_note_metadata` | Read frontmatter (tags, status, dates) |
| 2 | `get_backlinks` | Find notes linking to a given note |
| 2 | `get_outgoing_links` | Find notes linked from a given note |
| 3 | `read_note` | Read full note content or a specific section |
| 4 | `create_note` | Create a new note (full mode only) |
| 4 | `update_note` | Replace note content (full mode only) |
| 4 | `append_to_note` | Append to a note (full mode only) |

## Development

```bash
git clone https://github.com/chan-kinghin/talk-to-obsidian.git
cd talk-to-obsidian
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/vault-chat/` directory.

## License

MIT
