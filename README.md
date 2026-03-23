# GitHub AI Assistant

A Chrome extension that uses AI to instantly analyze any GitHub repository. Get summaries, key features, tech stack breakdowns, and chat with AI about the codebase — all without leaving GitHub.

## Features

- **Repository Summary** — One-click AI analysis of any GitHub repo: what it does, key features, tech stack, and architecture overview.
- **AI Chat** — Ask questions about the repository in a conversational interface. Great for understanding unfamiliar codebases.
- **File Context** — Load project files (package.json, Dockerfile, config files, etc.) to give the AI deeper understanding for more accurate answers.
- **Private Repo Support** — Add a GitHub token to analyze private repositories and get higher API rate limits.
- **GitHub Detection** — Automatically detects when you're on a GitHub repository page and shows the assistant button.
- **SPA-Aware** — Handles GitHub's client-side navigation seamlessly.
- **Privacy-First** — All secrets are stored locally and handled in the background service worker. No data is collected or transmitted to third parties.

## Installation

### From Source (Developer Mode)

1. Clone or download this repository:

   ```bash
   git clone https://github.com/LxxsCLN/github-ai-assisant.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the `github-ai-assisant` folder

5. The extension icon will appear in your toolbar

### Setup

1. Navigate to any GitHub repository (e.g., `https://github.com/facebook/react`)
2. Click the floating purple button in the bottom-right corner
3. Go to the **Settings** tab
4. Enter your [OpenAI API key](https://platform.openai.com/api-keys)
5. (Optional) Enter a [GitHub personal access token](https://github.com/settings/tokens) for private repos
6. Choose your preferred model
7. Click **Save Settings**

## Usage

### Generating a Summary

1. Visit any GitHub repository page
2. Click the floating button (bottom-right corner) or the extension icon in the toolbar
3. Click **Generate Summary**
4. The AI will fetch the README and metadata, then produce a structured analysis

### Loading File Context

1. Open the sidebar and switch to the **Files** tab
2. Click **Load File Tree** to see all files in the repository
3. Key config files (package.json, Dockerfile, etc.) are auto-selected
4. Check/uncheck files to customize what the AI sees
5. Click **Fetch & Save to Context**
6. Now Summary and Chat will use these files for richer, more accurate answers

### Chatting with AI

1. Open the sidebar on any repository
2. Switch to the **Chat** tab
3. Ask any question about the repository
4. The AI uses the README, summary, and loaded file context to answer your questions

### Example Questions

- "What does this repo do?"
- "Can I use this for building a REST API?"
- "Is this production ready?"
- "What's the learning curve for this project?"
- "How does the authentication work?"
- "Would this repo fit my use case? I need X, Y, Z..."

## Supported Models

| Model          | Description                    |
| -------------- | ------------------------------ |
| `gpt-4o-mini`  | Fast and affordable (default)  |
| `gpt-4o`       | Best quality for complex repos |
| `gpt-4.1-mini` | Latest mini model              |
| `gpt-4.1`      | Latest full model              |
| `o4-mini`      | Reasoning model                |

## Architecture

```
┌─────────────────────────────────────────┐
│  Content Script (content.js)            │
│  - Detects GitHub repo pages            │
│  - Injects floating button & sidebar    │
│  - Manages tabs, chat, file selection   │
│  - Never handles API keys directly      │
├─────────────────────────────────────────┤
│  Background Service Worker (background.js)
│  - Reads keys from chrome.storage.local │
│  - Proxies GitHub API calls (w/ token)  │
│  - Proxies OpenAI API calls             │
│  - Fetches file tree & file contents    │
├─────────────────────────────────────────┤
│  Chrome Storage (local)                 │
│  - Stores OpenAI API key                │
│  - Stores GitHub token (optional)       │
│  - Stores model preference              │
└─────────────────────────────────────────┘
```

## Security

- **API keys never touch the content script.** The background service worker reads keys directly from `chrome.storage.local` and makes all API calls. This prevents any injected page script from accessing your secrets.
- **Chrome storage is sandboxed.** `chrome.storage.local` is inaccessible to websites and other extensions.
- **Manifest V3 enforces strict CSP.** No remote code execution, no `eval`, no inline scripts.
- **HTTPS only.** All API calls go over TLS to `api.openai.com` and `api.github.com`.
- **Minimal permissions.** Only `activeTab`, `storage`, and the specific API host URLs.

## Permissions

| Permission                  | Why                                             |
| --------------------------- | ----------------------------------------------- |
| `activeTab`                 | To detect the current GitHub page URL           |
| `storage`                   | To save your API key and preferences locally    |
| `github.com`                | To inject the assistant UI on GitHub pages      |
| `api.github.com`            | To fetch repository README, metadata, and files |
| `api.openai.com`            | To send prompts to OpenAI for analysis          |
| `raw.githubusercontent.com` | Fallback for fetching raw file content          |

## API Keys & Tokens

### OpenAI API Key (required)

- Stored locally in Chrome's extension storage
- Read only by the background service worker
- Only sent directly to OpenAI's API
- Never transmitted to any other server

Get your API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

### GitHub Token (optional)

- Enables access to private repositories
- Raises GitHub API rate limit from 60 to 5,000 requests/hour
- Use a [fine-grained personal access token](https://github.com/settings/tokens?type=beta) with read-only repository access
- Stored locally, only sent to GitHub's API

## Development

The extension uses **Manifest V3** with no build step required:

```
github-ai-assisant/
├── manifest.json      # Extension manifest (Manifest V3)
├── background.js      # Service worker for API calls
├── content.js         # Content script (UI + logic)
├── content.css        # Sidebar and button styles
├── icons/             # Extension icons
├── README.md
├── PRIVACY.md
└── LICENSE
```

To develop:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Reload the GitHub page to see changes

## Limitations

- File content is capped at ~15K characters total to stay within token limits
- Individual files are truncated at 3,000 characters
- README content is truncated to ~8,000 characters
- Requires an active OpenAI API key with available credits
- GitHub API rate limits apply (60/hr unauthenticated, 5,000/hr with token)

## License

MIT
