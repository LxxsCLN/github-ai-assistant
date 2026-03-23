# Privacy Policy — GitHub AI Assistant

**Last updated:** March 22, 2026

## Overview

GitHub AI Assistant is a Chrome extension that analyzes GitHub repositories using AI. This privacy policy explains what data the extension accesses, how it is used, and how it is stored.

## Data Collection

**GitHub AI Assistant does not collect, store, or transmit any personal data to the extension developer or any third party.**

## Data Usage

### Data the Extension Accesses

| Data                                    | Purpose                                        | Where It Goes                   |
| --------------------------------------- | ---------------------------------------------- | ------------------------------- |
| Current page URL                        | To detect GitHub repository pages              | Stays local (never transmitted) |
| Repository README                       | To provide AI-powered analysis                 | Sent to OpenAI API only         |
| Repository metadata (name, description) | To provide context for AI analysis             | Sent to OpenAI API only         |
| Repository file tree                    | To let you select files for AI context         | Stays local (never transmitted) |
| Selected file contents                  | To provide deeper AI analysis                  | Sent to OpenAI API only         |
| Your OpenAI API key                     | To authenticate requests to OpenAI             | Sent to OpenAI API only         |
| Your GitHub token (optional)            | To access private repos and higher rate limits | Sent to GitHub API only         |
| Your model preference                   | To configure the AI model used                 | Stays local (never transmitted) |
| Chat messages you type                  | To generate AI responses about the repo        | Sent to OpenAI API only         |

### Data the Extension Does NOT Access

- Your GitHub password or OAuth session
- Your browsing history outside of GitHub
- Any files on your computer
- Any data from non-GitHub websites

## Data Storage

- **OpenAI API Key:** Stored locally using Chrome's `chrome.storage.local` API. Read only by the background service worker — never exposed to the content script or web page context.
- **GitHub Token:** Stored locally using `chrome.storage.local`. Only sent to GitHub's API for authentication. Never sent to OpenAI or any other service.
- **Preferences:** Your model selection is stored locally using `chrome.storage.local`.
- **Chat History:** Chat messages are stored in memory only for the current session. They are not persisted to disk and are lost when you close the sidebar or navigate away.
- **File Contents:** Selected file contents are stored in memory only for the current session. They are cleared when navigating to a different repository.
- **Summaries:** Generated summaries are stored in memory only for the current session.

## Third-Party Services

### OpenAI API

When you generate a summary or send a chat message, the extension sends data to OpenAI's API (`api.openai.com`). This data includes:

- The repository README content (truncated to ~8,000 characters)
- The repository name and description
- Selected project file contents (truncated, capped at ~15K characters total)
- Your chat messages
- Your API key (for authentication)

OpenAI's use of this data is governed by [OpenAI's API Usage Policies](https://openai.com/policies/usage-policies) and [Privacy Policy](https://openai.com/policies/privacy-policy). As of the latest policy, data sent via the API is **not used to train models**.

### GitHub API

The extension fetches repository data from GitHub's API (`api.github.com`). This includes:

- Repository README content
- Repository metadata (name, description, etc.)
- Repository file tree (list of file paths and sizes)
- Individual file contents (only files you explicitly select)

For public repos, these are unauthenticated requests. If you provide a GitHub token, it is sent as a Bearer token in the Authorization header to GitHub's API only — never to OpenAI or any other service.

## Permissions Justification

| Permission                                    | Justification                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `activeTab`                                   | Required to read the current tab's URL to detect GitHub repository pages          |
| `storage`                                     | Required to persist your API key and preferences locally                          |
| `host_permissions: github.com`                | Required to inject the assistant UI (floating button and sidebar) on GitHub pages |
| `host_permissions: api.github.com`            | Required to fetch repository README and metadata                                  |
| `host_permissions: api.openai.com`            | Required to send prompts to OpenAI for AI analysis                                |
| `host_permissions: raw.githubusercontent.com` | Required as a fallback for fetching raw README content                            |

## Data Retention

- **Local storage:** Data persists until you uninstall the extension or clear extension storage.
- **In-memory data:** Chat history, summaries, and file contents are cleared when you close the sidebar or navigate to a different repository.
- **OpenAI:** Data retention is governed by OpenAI's data retention policies. The extension developer has no access to data sent to OpenAI.

## Security

- **Keys never touch the content script.** Your OpenAI API key and GitHub token are read directly from `chrome.storage.local` by the background service worker. The content script never handles or sees these secrets, preventing exposure to the web page context.
- **Sandboxed storage.** `chrome.storage.local` is inaccessible to other extensions, websites, or injected scripts.
- **Strict Content Security Policy.** Manifest V3 enforces a strict CSP — no remote code, no `eval`, no inline scripts.
- **HTTPS only.** All API calls use TLS encryption.
- **No data exfiltration.** Data is only sent to `api.openai.com` and `api.github.com`. No other network requests are made.

## Children's Privacy

This extension is not directed at children under the age of 13 and does not knowingly collect any data from children.

## Changes to This Policy

Updates to this privacy policy will be reflected in this file with an updated "Last updated" date.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/LxxsCLN/github-ai-assistant/issues).
