# Plan: Add iMessage (BlueBubbles) & Telegram Bot Support

Add two new messaging integrations following the existing Feishu 3-layer pattern (bot → handler → formatter). Both are desktop-only, read-only mode, with user allowlist filtering.

---

## Stage 1: Shared Types & Allowlist Utility

**Goal**: Extend `PluginSettings` with `imessage` and `telegram` config sections, update `DEFAULT_SETTINGS`, and create a shared allowlist filter utility for incoming message authorization.
**Success Criteria**: `npx tsc --noEmit` passes. New settings types compile. AllowlistFilter correctly filters by user ID.
**Tests**: Manual — verify TypeScript compiles with `npx tsc --noEmit`.
**Files**:
src/types.ts (modify)
src/settings/settings.ts (modify)
src/utils/allowlist.ts (create)
**Depends on**: —
**Context**:
- See `src/types.ts:33-49` for the existing `PluginSettings` interface. Add `imessage` and `telegram` sections at the same level as `feishu`.
- `imessage` section needs: `enabled: boolean`, `serverUrl: string` (BlueBubbles server URL), `password: string` (BlueBubbles password), `allowedAddresses: string` (comma-separated phone numbers/emails).
- `telegram` section needs: `enabled: boolean`, `botToken: string`, `allowedUserIds: string` (comma-separated Telegram numeric user IDs).
- See `src/settings/settings.ts:1-19` for the `DEFAULT_SETTINGS` pattern. Add matching defaults with `enabled: false` and empty strings.
- `AllowlistFilter` utility: a simple class with `constructor(commaList: string)` that parses comma-separated values and exposes `isAllowed(id: string): boolean`. Empty allowlist = allow all (for convenience when no filter is configured).
**Status**: Not Started

## Stage 2: Telegram Bot Integration

**Goal**: Create `src/telegram/` with bot, handler, and formatter following the Feishu 3-layer pattern. Uses Telegram Bot API HTTP long-polling (no webhook, no external deps — uses native `fetch`).
**Success Criteria**: `npx tsc --noEmit` passes. Telegram module compiles independently.
**Tests**: Manual — verify TypeScript compiles.
**Files**:
src/telegram/telegram-bot.ts (create)
src/telegram/telegram-handler.ts (create)
src/telegram/telegram-formatter.ts (create)
src/feishu/feishu-bot.ts (read-only ref)
src/feishu/feishu-handler.ts (read-only ref)
src/feishu/feishu-formatter.ts (read-only ref)
src/types.ts (read-only ref)
**Depends on**: Stage 1
**Context**:
- **telegram-bot.ts**: Follow `src/feishu/feishu-bot.ts` pattern (event listeners, status tracking, connect/disconnect lifecycle). Use Telegram Bot API via native `fetch` — NO external npm dependency. Implement `getUpdates` long-polling loop in `connect()`. Parse incoming messages from `result[].message.text`. Export `TelegramMessageEvent` interface with `messageId: number`, `chatId: number`, `userId: number`, `username: string`, `text: string`. Use `sendMessage` API to reply. Poll interval: 1 second. Timeout: 30 seconds for long-polling.
- **telegram-handler.ts**: Follow `src/feishu/feishu-handler.ts:21-166` exactly. Same structure: constructor takes `(agentCore, bot, vaultName, allowlistFilter)`. `start()` attaches message listener. `handleMessage()` does: allowlist check → dedup → rate limit → `agentCore.run(text, [], 'readonly')` → collect events → format → send reply. Use same rate limit constants (100/min, 5/sec). Allowlist filter: call `allowlistFilter.isAllowed(String(event.userId))` before processing.
- **telegram-formatter.ts**: Follow `src/feishu/feishu-formatter.ts` pattern but output Telegram MarkdownV2 format instead of lark_md. Functions: `formatTelegramResponse(content, vaultName): string` and `formatTelegramError(message): string`. Convert `[[wiki-links]]` to bold text. Append source links as `obsidian://open` URIs. Escape MarkdownV2 special chars: `_*[]()~>#+\-=|{}.!`. Max message length: 4096 chars (Telegram limit), truncate if needed.
- Telegram Bot API base URL: `https://api.telegram.org/bot{token}/`
- Key endpoints: `getUpdates?offset={}&timeout=30`, `sendMessage` (POST with `chat_id`, `text`, `parse_mode: "MarkdownV2"`)
**Status**: Not Started

## Stage 3: iMessage (BlueBubbles) Integration

**Goal**: Create `src/imessage/` with bot, handler, and formatter following the Feishu 3-layer pattern. Uses BlueBubbles REST API + WebSocket for real-time message events.
**Success Criteria**: `npx tsc --noEmit` passes. iMessage module compiles independently.
**Tests**: Manual — verify TypeScript compiles.
**Files**:
src/imessage/imessage-bot.ts (create)
src/imessage/imessage-handler.ts (create)
src/imessage/imessage-formatter.ts (create)
src/feishu/feishu-bot.ts (read-only ref)
src/feishu/feishu-handler.ts (read-only ref)
src/feishu/feishu-formatter.ts (read-only ref)
src/types.ts (read-only ref)
**Depends on**: Stage 1
**Context**:
- **imessage-bot.ts**: Follow `src/feishu/feishu-bot.ts` pattern. BlueBubbles uses WebSocket for real-time events + REST API for sending. Constructor takes `{ serverUrl, password }`. `connect()`: open WebSocket to `ws://{serverUrl}/socket.io/?...` (use native WebSocket). Listen for `new-message` events. `sendMessage(chatGuid, text)`: POST to `http://{serverUrl}/api/v1/message/text` with body `{ chatGuid, message: text, method: "private-api" }` and query param `password`. Export `IMessageEvent` interface with `messageGuid: string`, `chatGuid: string`, `senderAddress: string`, `text: string`, `isFromMe: boolean`. Filter out `isFromMe: true` messages.
- **imessage-handler.ts**: Follow `src/feishu/feishu-handler.ts:21-166` exactly. Same structure as Telegram handler. Allowlist filter uses `event.senderAddress` (phone number or email). Same complete-then-send, rate limiting, dedup pattern. Read-only mode only.
- **imessage-formatter.ts**: Follow `src/feishu/feishu-formatter.ts` but output plain text (iMessage has limited rich text support). Functions: `formatIMessageResponse(content, vaultName): string` and `formatIMessageError(message): string`. Convert `[[wiki-links]]` to plain text with `obsidian://open` URIs appended at bottom. Strip markdown formatting (bold, italic, code blocks → plain text). Max 20,000 char limit.
- BlueBubbles API docs: REST API uses `password` query param for auth. WebSocket uses Socket.IO protocol. Incoming messages have structure: `{ data: { guid, chats: [{ chatIdentifier }], handle: { address }, text, isFromMe } }`.
- BlueBubbles does NOT need to be an npm dependency — use native `fetch` for REST and native `WebSocket` for socket connection.
**Status**: Not Started

## Stage 4: Settings UI for Telegram & iMessage

**Goal**: Add settings UI sections for both Telegram and iMessage in the existing settings tab, following the Feishu section pattern. Desktop-only, with enable toggle, credential fields, allowlist field, and connection status indicator.
**Success Criteria**: `npx tsc --noEmit` passes. Settings tab renders new sections on desktop.
**Tests**: Manual — verify TypeScript compiles, open settings tab in Obsidian.
**Files**:
src/settings/settings-tab.ts (modify)
src/main.ts (read-only ref)
src/types.ts (read-only ref)
**Depends on**: Stage 1
**Context**:
- See `src/settings/settings-tab.ts:132-191` for the Feishu settings section pattern. Replicate this pattern twice for Telegram and iMessage.
- **Telegram section** (after Feishu): heading "Telegram Integration", status indicator, enable toggle, bot token field (password-masked), allowed user IDs text field (placeholder: "Comma-separated Telegram user IDs, e.g., 123456,789012"). Add description: "Leave empty to allow all users."
- **iMessage section** (after Telegram): heading "iMessage Integration (BlueBubbles)", status indicator, enable toggle, server URL field (placeholder: "http://localhost:1234"), password field (password-masked), allowed addresses field (placeholder: "Comma-separated phone numbers/emails, e.g., +1234567890,user@example.com"). Add description: "Leave empty to allow all senders."
- Connection status: call `this.plugin.getTelegramStatus()` and `this.plugin.getIMessageStatus()` — these methods will be added to main.ts in Stage 5.
- All sections wrapped in `if (Platform.isDesktop)` check, same as Feishu.
- Use `inputEl.type = 'password'` for sensitive fields (bot token, BlueBubbles password).
**Status**: Not Started

## Stage 5: Plugin Integration & Lifecycle

**Goal**: Wire Telegram and iMessage into the plugin lifecycle in `main.ts` — initialization, settings reload, disconnect on unload, and status accessor methods. Follow the existing `initFeishu()` pattern exactly.
**Success Criteria**: `npx tsc --noEmit` passes. `npm run build` produces `main.js` without errors. Both integrations initialize on desktop when enabled with valid credentials.
**Tests**: Manual — `npm run build` succeeds. Enable each integration in settings and verify connection logs in console.
**Files**:
src/main.ts (modify)
esbuild.config.mjs (read-only ref)
src/telegram/telegram-bot.ts (read-only ref)
src/telegram/telegram-handler.ts (read-only ref)
src/imessage/imessage-bot.ts (read-only ref)
src/imessage/imessage-handler.ts (read-only ref)
src/utils/allowlist.ts (read-only ref)
**Depends on**: Stage 1, Stage 2, Stage 3, Stage 4
**Context**:
- See `src/main.ts:24-31` for instance variable declarations. Add `private telegramBot` and `private imessageBot` (typed as their bot classes or `null`).
- See `src/main.ts:159-199` for `initFeishu()` pattern. Create `initTelegram()` and `initIMessage()` following the exact same pattern:
  1. Disconnect existing bot if any
  2. Check `Platform.isDesktop` and `settings.{platform}.enabled`
  3. Check credentials are set
  4. Check `agentCore` is initialized
  5. Dynamic import of bot and handler modules
  6. Construct bot, handler, and allowlist filter
  7. Call `handler.start()` then `bot.connect()`
  8. Wrap in try/catch with console.error
- See `src/main.ts:66-74` for `onLayoutReady()` — add `await this.initTelegram()` and `await this.initIMessage()` after `initFeishu()`.
- See `src/main.ts:77-89` for `onunload()` — add disconnect calls for both bots before existing cleanup.
- See `src/main.ts:100-106` for `saveSettings()` — add `await this.initTelegram()` and `await this.initIMessage()` calls.
- See `src/main.ts:91-98` for `loadSettings()` — add per-section spread for `telegram` and `imessage` sections.
- Add `getTelegramStatus()` and `getIMessageStatus()` accessor methods following `getFeishuStatus()` at line 201-206.
- Import types only (`import type`) for bot classes to keep them tree-shakeable.
**Status**: Not Started
