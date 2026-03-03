# Vault Chat — Obsidian Community Plugin

## Context

Build an Obsidian community plugin that lets users **chat with their vault via an agentic AI** — like Claude Code for your notes. Two interfaces:
1. **In-Obsidian chat panel** — sidebar view (desktop + mobile), full mode (read + write)
2. **Feishu bot** — query vault from phone via DM (desktop-only), read-only mode by default

**Approach**: Agentic tool-use (like OpenClaw/OpenCode), NOT traditional RAG. The LLM has vault tools and decides what to read/write. Progressive disclosure — search first, peek metadata, then read full notes. No pre-embedding, no vector DB, no chunking pipeline.

**Why this is better than RAG**: Simpler codebase, no index management, reads full notes (not lossy chunks), can follow vault graph, handles complex multi-step queries naturally.

---

## Architecture

```
[Feishu DM (Phone)]              [Obsidian Chat Panel]
  ↕ WebSocket (Feishu SDK)              ↕ DOM UI
  ↓ read-only mode                      ↓ full mode
[──────────── Agent Core ──────────────────]
  LLM (DashScope qwen-plus) with tool-use
  ↓ calls tools as needed (multi-step)
[──────────── Vault Tools ─────────────────]
  search_vault    read_note     list_folder
  get_metadata    get_backlinks get_outgoing_links
  search_by_tag   create_note   update_note
  ↕                              ↕
[FTS Index (Orama)]        [Obsidian Vault API]
  lightweight, no embeddings    direct file read/write
```

### Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Agent LLM | DashScope qwen-plus (configurable) | User has API key; tool-use capable; OpenAI-compatible endpoint option |
| Full-text search | Orama (<2kb) | Lightweight FTS for `search_vault` tool; no embeddings needed |
| Feishu | @larksuiteoapi/node-sdk WSClient | WebSocket long-connection, no public URL |
| Chat UI | Obsidian ItemView + DOM APIs | Works desktop + mobile, no React |
| Storage | Obsidian plugin data dir | Settings, chat history, FTS index |

---

## Agent Design

### Tool Set (Progressive Disclosure)

**Level 1 — Discover (broad, cheap)**
| Tool | Input | Output | Use |
|------|-------|--------|-----|
| `search_vault(query, limit?)` | search query | titles + 2-line snippets + paths | Find relevant notes by keyword |
| `list_folder(path?)` | folder path | file names + types | Browse vault structure |
| `search_by_tag(tag)` | tag name | note paths + titles | Filter by tag |

**Level 2 — Peek (medium)**
| Tool | Input | Output | Use |
|------|-------|--------|-----|
| `get_note_metadata(path)` | note path | frontmatter (tags, status, date, type) | Quick filtering without reading full note |
| `get_backlinks(path)` | note path | list of notes linking here | Explore graph inward |
| `get_outgoing_links(path)` | note path | list of notes linked from here | Explore graph outward |

**Level 3 — Read (specific, full content)**
| Tool | Input | Output | Use |
|------|-------|--------|-----|
| `read_note(path, heading?)` | note path, optional section | full note content or specific section | Read actual content |

**Level 4 — Write (mutate, full mode only)**
| Tool | Input | Output | Use |
|------|-------|--------|-----|
| `create_note(path, content, frontmatter?)` | path + content | created file path | Create new notes |
| `update_note(path, content)` | path + new content | success | Replace note content |
| `append_to_note(path, content)` | path + content to add | success | Append without overwriting |

### Agent Modes

| Mode | Available tools | When |
|------|----------------|------|
| **Read-only** | Level 1-3 only | Feishu bot (default), Obsidian panel (optional) |
| **Full** | Level 1-4 (all tools) | Obsidian chat panel (default) |

User can toggle mode in settings. Write tools in full mode still require LLM to confirm intent before writing.

### Conversation Memory (Session)

- Maintain conversation history within a session (array of user/assistant/tool messages)
- Pass recent history to LLM on each turn (sliding window, configurable max turns)
- Enables follow-up questions: "What about the second one?" / "Tell me more about that project"
- History cleared on "New Chat" or Obsidian restart
- Optional: persist last N conversations to plugin data dir for cross-restart continuity

### System Prompt

```
You are a knowledgeable assistant with access to the user's Obsidian vault.
You can search, browse, and read notes to answer questions.

Rules:
1. Use tools to find information. Do NOT guess or fabricate content.
2. Start broad (search/list), then read specific notes as needed.
3. Cite sources using [[Note Name]] wiki-link format.
4. If you can't find the answer, say so honestly.
5. Respond in the same language as the user's question.
6. When creating/updating notes, confirm the action with the user first.
```

### Tool-Use Flow Example

```
User: "What are my active projects and their status?"

Agent thinking:
  1. search_vault("project status active") → 6 results
  2. search_by_tag("project") → 8 results (some overlap)
  3. get_note_metadata on top 5 → check status: active → 3 match
  4. read_note on those 3 → get details
  5. Synthesize answer with [[citations]]

User: "Create a summary note from those"

Agent thinking (full mode):
  1. Already has context from previous turn (session memory)
  2. Compose summary content
  3. create_note("Projects/Active Projects Summary.md", content, {tags: [project, summary]})
  4. Confirm: "Created [[Active Projects Summary]] with 3 project summaries."
```

---

## Project Structure

```
obsidian-vault-chat/
├── src/
│   ├── main.ts                    # Plugin entry, registers views/commands
│   ├── types.ts                   # Shared interfaces
│   ├── settings/
│   │   ├── settings.ts            # Settings interface + defaults
│   │   └── settings-tab.ts        # PluginSettingTab UI
│   ├── agent/
│   │   ├── agent-core.ts          # LLM tool-use loop (send msg → get tool calls → execute → repeat)
│   │   ├── tool-registry.ts       # Register/manage available tools per mode
│   │   ├── tools/
│   │   │   ├── search-vault.ts    # FTS via Orama
│   │   │   ├── read-note.ts       # Read full note or section
│   │   │   ├── get-metadata.ts    # Frontmatter extraction
│   │   │   ├── list-folder.ts     # Folder listing
│   │   │   ├── get-backlinks.ts   # Backlink resolution
│   │   │   ├── get-outgoing.ts    # Outgoing link resolution
│   │   │   ├── search-by-tag.ts   # Tag-based search
│   │   │   ├── create-note.ts     # Create new note (full mode)
│   │   │   ├── update-note.ts     # Update note content (full mode)
│   │   │   └── append-note.ts     # Append to note (full mode)
│   │   └── prompt.ts              # System prompt builder
│   ├── search/
│   │   ├── fts-index.ts           # Orama full-text search index
│   │   └── indexer.ts             # Build/update FTS index from vault
│   ├── chat/
│   │   ├── chat-view.ts           # ItemView sidebar panel
│   │   ├── chat-store.ts          # Conversation history (session + optional persistence)
│   │   └── components/
│   │       ├── message-list.ts    # Message rendering (user/assistant/tool)
│   │       ├── input-bar.ts       # Text input + send + mode indicator
│   │       └── source-panel.ts    # Cited notes with clickable links
│   ├── feishu/
│   │   ├── feishu-bot.ts          # WSClient + EventDispatcher
│   │   ├── feishu-handler.ts      # Message → agent-core → format reply
│   │   └── feishu-formatter.ts    # Markdown → Feishu card message
│   └── utils/
│       ├── frontmatter.ts         # YAML frontmatter parser
│       ├── links.ts               # Wiki-link parser/resolver
│       └── debounce.ts            # File event debouncing for index
├── styles.css
├── manifest.json
├── package.json
├── tsconfig.json
└── esbuild.config.mjs
```

---

## Key Design Details

### Agent Core (tool-use loop)

```typescript
class AgentCore {
  async run(userMessage: string, history: ChatMessage[], mode: 'readonly' | 'full'): AsyncGenerator<AgentEvent> {
    const tools = this.toolRegistry.getTools(mode);
    const messages = [...history, { role: 'user', content: userMessage }];

    // Loop: LLM may call tools multiple times before final answer
    while (true) {
      const response = await this.llm.chat({
        messages,
        tools: tools.map(t => t.definition),
        stream: true,
      });

      if (response.toolCalls.length === 0) {
        // Final answer — no more tool calls
        yield { type: 'answer', content: response.content };
        break;
      }

      // Execute tool calls, add results to messages
      for (const call of response.toolCalls) {
        const result = await tools.execute(call.name, call.arguments);
        messages.push({ role: 'tool', toolCallId: call.id, content: result });
        yield { type: 'tool_use', tool: call.name, input: call.arguments, output: result };
      }

      // Safety: max 10 rounds to prevent infinite loops
      if (rounds++ > 10) break;
    }
  }
}
```

### FTS Index (lightweight, no embeddings)

- Built with Orama, full-text only (no vector field)
- Schema: `{ content, fileName, filePath, headingPath, tags }`
- Built on plugin load, incrementally updated via vault events (create/modify/delete/rename)
- Debounced updates (5s) to avoid rapid re-indexing during bulk edits
- Persisted to plugin data dir (JSON via Orama persist/restore)
- Used exclusively by `search_vault` tool — agent's entry point for discovery

### LLM Provider

- Default: DashScope qwen-plus (OpenAI-compatible chat completions with tool-use)
- Configurable: any OpenAI-compatible endpoint (Anthropic, OpenAI, Ollama, etc.)
- Streaming: token-by-token for chat panel, complete-then-send for Feishu
- Tool-use format: OpenAI function calling format (widely supported)

### Feishu Integration

- Conditionally loaded: `if (Platform.isDesktop && settings.feishu.enabled)`
- Dynamic import to avoid Node.js deps on mobile
- WebSocket long-connection via `@larksuiteoapi/node-sdk` (no public URL)
- Read-only mode by default (only Level 1-3 tools)
- Replies via Feishu card messages (rich text + `obsidian://` source links)
- Rate limit aware: 100 msgs/min, 5 msgs/sec

### Chat UI

- Obsidian ItemView in right sidebar
- Shows: user messages, assistant responses (streamed), tool-use activity (collapsible)
- Source panel: clickable `[[Note Name]]` citations open notes in Obsidian
- Mode toggle: read-only / full (shows current mode in header)
- New Chat button clears history
- Mobile-compatible: uses only DOM APIs, responsive CSS

---

## Implementation Stages

### Stage 1: Plugin Shell + FTS Index + Basic Search
**Goal**: Plugin loads, settings tab works, FTS index built from vault, basic chat panel with search-only (no LLM).

**Deliverables**:
- Plugin skeleton (manifest, esbuild, settings)
- Orama FTS index built from all .md files on load
- Incremental index updates on file events (create/modify/delete/rename)
- Chat panel in right sidebar (input bar + message list)
- Type a query → runs `search_vault` → shows ranked results
- No LLM call yet — just proving the FTS and UI work

**Files**: `main.ts`, `types.ts`, `settings/*`, `search/*`, `chat/chat-view.ts`, `chat/components/*`, `utils/frontmatter.ts`, config files, `styles.css`
**Success**: Plugin installs, search returns relevant notes, UI renders properly
**Depends on**: None

### Stage 2: Agent Core + Read-Only Tools
**Goal**: Full agentic loop — LLM with tool-use, progressive disclosure, multi-step reasoning.

**Deliverables**:
- Agent core: tool-use loop (send → tool calls → execute → repeat)
- All Level 1-3 tools implemented (search, read, metadata, links, tags, folder)
- Tool registry with read-only mode
- DashScope LLM provider (OpenAI-compatible format with tool-use)
- Streaming responses in chat panel
- Tool-use activity shown in chat (collapsible "searched vault for X", "read note Y")
- Source citations with clickable [[wiki-links]]

**Files**: `agent/*`, `agent/tools/*` (Level 1-3), `chat/components/source-panel.ts`
**Success**: Ask "What are my active projects?" → agent searches → reads notes → answers with citations
**Depends on**: Stage 1

### Stage 3: Session Memory + Write Tools
**Goal**: Conversation memory + full mode with write-back capability.

**Deliverables**:
- Chat store with sliding window history (configurable max turns)
- Follow-up questions work: "tell me more about that"
- Write tools: `create_note`, `update_note`, `append_to_note` (full mode only)
- Mode toggle in chat header (read-only / full)
- Write tools require LLM confirmation prompt before executing
- "New Chat" button clears history
- Optional: persist last N conversations across restarts

**Files**: `chat/chat-store.ts`, `agent/tools/*` (Level 4), `agent/tool-registry.ts` (mode filtering)
**Success**: Multi-turn conversation works; "Create a summary note" creates the note in vault
**Depends on**: Stage 2

### Stage 4: Feishu Bot Integration
**Goal**: Desktop-only Feishu bot, read-only mode, answers vault queries via DM.

**Deliverables**:
- Feishu WSClient connects when enabled (desktop only)
- Bot receives text DM → routes to agent core (read-only mode) → replies
- Feishu card message formatting (rich text + source links)
- Connection status in settings tab (connected/disconnected/error)
- Feishu section hidden on mobile
- Rate limiting and error handling

**Files**: `feishu/*`, settings/main modifications, esbuild config update
**Success**: Send question in Feishu DM → get vault-based answer on phone
**Depends on**: Stage 2

### Stage 5: Polish + Marketplace Submission
**Goal**: Error handling, docs, community plugin submission.

**Deliverables**:
- Error handling for all failure modes (no API key, bad key, network down, empty vault)
- Status indicator in chat header (green/yellow/red)
- Settings: "Test Connection" for LLM API + Feishu
- README with setup instructions, screenshots, Feishu setup guide
- `versions.json` populated
- PR to `obsidian-releases` repo

**Files**: Various (error handling improvements), `README.md`, `versions.json`
**Success**: Clean install experience, no console errors, handles all edge cases
**Depends on**: Stage 3, Stage 4

---

## Verification Plan

1. **Stage 1**: Install in test vault (~/Documents/Veritas), search for "project" → verify ranked results appear
2. **Stage 2**: Ask "What meetings did I have recently?" → agent searches → reads notes → answers with sources
3. **Stage 3**: Follow up "Summarize them into a new note" → agent creates note in vault → verify file exists
4. **Stage 4**: Create Feishu test app → send DM "What are my open tasks?" → verify bot replies
5. **Stage 5**: Test: no API key configured → helpful error; bad API key → clear message; empty vault → graceful empty state
