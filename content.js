// GitHub AI Assistant - Content Script
// Detects GitHub repo pages, injects floating button, and manages sidebar UI

(function () {
  "use strict";

  if (document.getElementById("ghai-floating-btn")) return;

  // ── Signal Files ──────────────────────────────────────────────────
  // Files that reveal architecture, dependencies, and project structure.
  // Auto-selected when file context is loaded.

  const SIGNAL_FILES = [
    "package.json", "package-lock.json",
    "tsconfig.json", "tsconfig.base.json",
    "requirements.txt", "setup.py", "setup.cfg", "pyproject.toml", "Pipfile",
    "Cargo.toml", "go.mod", "go.sum",
    "Gemfile", "build.gradle", "build.gradle.kts", "pom.xml",
    "Makefile", "CMakeLists.txt",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".env.example", ".env.sample",
    "vercel.json", "netlify.toml", "fly.toml", "railway.json",
    "webpack.config.js", "vite.config.ts", "vite.config.js",
    "next.config.js", "next.config.mjs", "nuxt.config.ts",
    "tailwind.config.js", "tailwind.config.ts",
    ".eslintrc.json", ".eslintrc.js",
    "jest.config.js", "jest.config.ts", "vitest.config.ts",
    "Procfile", "app.json", "render.yaml",
  ];

  // Only auto-fetch signal files under this size (bytes)
  const SIGNAL_FILE_MAX_SIZE = 50000;
  // Total context cap for file content sent to AI
  const FILE_CONTEXT_CHAR_LIMIT = 15000;

  // ── State ─────────────────────────────────────────────────────────

  let state = {
    sidebarOpen: false,
    activeTab: "summary",
    owner: null,
    repo: null,
    readme: null,
    summary: null,
    apiKey: null,
    githubToken: null,
    model: "gpt-4o-mini",
    chatHistory: [],
    loading: false,
    // File context
    fileTree: null,       // Array of { path, size }
    selectedFiles: new Set(),
    fileContents: {},     // path -> content
    fileContextEnabled: true,
  };

  // ── GitHub Page Detection ─────────────────────────────────────────

  function parseRepoFromURL() {
    const match = window.location.pathname.match(/^\/([^/]+)\/([^/]+)\/?/);
    if (!match) return null;
    const owner = match[1];
    const repo = match[2];
    const excluded = [
      "settings", "marketplace", "explore", "notifications",
      "new", "organizations", "login", "signup", "features",
      "enterprise", "pricing", "sponsors", "topics", "trending",
      "collections", "events", "about", "customer-stories",
    ];
    if (excluded.includes(owner)) return null;
    return { owner, repo };
  }

  function isRepoPage() {
    return parseRepoFromURL() !== null;
  }

  // ── Markdown Rendering (lightweight) ──────────────────────────────

  function renderMarkdown(text) {
    if (!text) return "";
    return text
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/^[\s]*[-*] (.+)$/gm, "<li>$1</li>")
      .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>")
      .replace(/^(.+)/, "<p>$1</p>")
      .replace(/<p><\/p>/g, "")
      .replace(/<p><(h[1-3]|ul|ol)/g, "<$1")
      .replace(/<\/(h[1-3]|ul|ol)><\/p>/g, "</$1>");
  }

  // ── Create UI Elements ────────────────────────────────────────────

  function createFloatingButton() {
    const btn = document.createElement("button");
    btn.id = "ghai-floating-btn";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      <span class="ghai-btn-tooltip">Explain Repo</span>
    `;
    btn.addEventListener("click", toggleSidebar);
    document.body.appendChild(btn);
    return btn;
  }

  function createSidebar() {
    const overlay = document.createElement("div");
    overlay.id = "ghai-sidebar-overlay";
    overlay.addEventListener("click", closeSidebar);
    document.body.appendChild(overlay);

    const sidebar = document.createElement("div");
    sidebar.id = "ghai-sidebar";
    sidebar.innerHTML = `
      <div class="ghai-header">
        <div class="ghai-header-title">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          GitHub AI Assistant
        </div>
        <button class="ghai-close-btn" id="ghai-close-btn">&times;</button>
      </div>

      <div class="ghai-repo-info" id="ghai-repo-info">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="#8b949e"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>
        <strong id="ghai-repo-name">Loading...</strong>
      </div>

      <div class="ghai-tabs">
        <button class="ghai-tab ghai-active" data-tab="summary">Summary</button>
        <button class="ghai-tab" data-tab="chat">Chat</button>
        <button class="ghai-tab" data-tab="files">Files</button>
        <button class="ghai-tab" data-tab="settings">Settings</button>
      </div>

      <div class="ghai-tab-content ghai-active" id="ghai-tab-summary">
        <div id="ghai-summary-area"></div>
      </div>

      <div class="ghai-tab-content" id="ghai-tab-chat">
        <div class="ghai-chat-messages" id="ghai-chat-messages"></div>
        <div class="ghai-chat-input-row">
          <input type="text" class="ghai-chat-input" id="ghai-chat-input" placeholder="Ask about this repo..." />
          <button class="ghai-chat-send-btn" id="ghai-chat-send-btn">Send</button>
        </div>
      </div>

      <div class="ghai-tab-content" id="ghai-tab-files">
        <div id="ghai-files-area"></div>
      </div>

      <div class="ghai-tab-content" id="ghai-tab-settings">
        <div class="ghai-settings-group">
          <label class="ghai-settings-label" for="ghai-api-key">OpenAI API Key</label>
          <span class="ghai-settings-sublabel">Stored locally. Only sent to OpenAI's API.</span>
          <input type="password" class="ghai-settings-input" id="ghai-api-key" placeholder="sk-..." autocomplete="off" />
        </div>
        <div class="ghai-settings-group">
          <label class="ghai-settings-label" for="ghai-github-token">GitHub Token <span style="color:#8b949e;font-weight:400">(optional)</span></label>
          <span class="ghai-settings-sublabel">Required for private repos. Also raises rate limit from 60 to 5,000 req/hr. Use a fine-grained token with read-only repo access.</span>
          <input type="password" class="ghai-settings-input" id="ghai-github-token" placeholder="ghp_... or github_pat_..." autocomplete="off" />
        </div>
        <div class="ghai-settings-group">
          <label class="ghai-settings-label" for="ghai-model-select">Model</label>
          <select class="ghai-settings-select" id="ghai-model-select">
            <option value="gpt-4o-mini">GPT-4o Mini (fast, affordable)</option>
            <option value="gpt-4o">GPT-4o (best quality)</option>
            <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
            <option value="gpt-4.1">GPT-4.1</option>
            <option value="o4-mini">o4-mini (reasoning)</option>
          </select>
        </div>
        <button class="ghai-save-btn" id="ghai-save-settings-btn">Save Settings</button>
        <div id="ghai-settings-status"></div>
      </div>
    `;
    document.body.appendChild(sidebar);

    // Event listeners
    document.getElementById("ghai-close-btn").addEventListener("click", closeSidebar);
    sidebar.querySelectorAll(".ghai-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });
    document.getElementById("ghai-save-settings-btn").addEventListener("click", saveSettings);
    document.getElementById("ghai-chat-send-btn").addEventListener("click", sendChatMessage);
    document.getElementById("ghai-chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    return sidebar;
  }

  // ── Sidebar Controls ──────────────────────────────────────────────

  function toggleSidebar() {
    state.sidebarOpen ? closeSidebar() : openSidebar();
  }

  function openSidebar() {
    const parsed = parseRepoFromURL();
    if (!parsed) return;

    state.owner = parsed.owner;
    state.repo = parsed.repo;
    state.sidebarOpen = true;

    document.getElementById("ghai-repo-name").textContent = `${state.owner}/${state.repo}`;

    document.getElementById("ghai-sidebar-overlay").classList.add("ghai-visible");
    document.getElementById("ghai-sidebar").classList.add("ghai-open");

    loadSettings().then(() => {
      if (state.activeTab === "summary") initSummaryTab();
      else if (state.activeTab === "files") initFilesTab();
    });
  }

  function closeSidebar() {
    state.sidebarOpen = false;
    document.getElementById("ghai-sidebar-overlay").classList.remove("ghai-visible");
    document.getElementById("ghai-sidebar").classList.remove("ghai-open");
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll(".ghai-tab").forEach((tab) => {
      tab.classList.toggle("ghai-active", tab.dataset.tab === tabName);
    });
    document.querySelectorAll(".ghai-tab-content").forEach((c) => c.classList.remove("ghai-active"));
    document.getElementById(`ghai-tab-${tabName}`).classList.add("ghai-active");

    if (tabName === "summary") initSummaryTab();
    else if (tabName === "chat") initChatTab();
    else if (tabName === "files") initFilesTab();
    else if (tabName === "settings") initSettingsTab();
  }

  // ── Settings ──────────────────────────────────────────────────────

  async function loadSettings() {
    if (!isContextValid()) {
      showInvalidContextError();
      return;
    }
    return new Promise((resolve) => {
      chrome.storage.local.get(["ghaiApiKey", "ghaiModel", "ghaiGithubToken"], (result) => {
        state.apiKey = result.ghaiApiKey || null;
        state.model = result.ghaiModel || "gpt-4o-mini";
        state.githubToken = result.ghaiGithubToken || null;
        resolve();
      });
    });
  }

  function saveSettings() {
    if (!isContextValid()) {
      showInvalidContextError();
      return;
    }
    const apiKeyInput = document.getElementById("ghai-api-key");
    const githubTokenInput = document.getElementById("ghai-github-token");
    const modelSelect = document.getElementById("ghai-model-select");
    const statusDiv = document.getElementById("ghai-settings-status");

    const apiKey = apiKeyInput.value.trim();
    const githubToken = githubTokenInput.value.trim();
    const model = modelSelect.value;

    if (!apiKey) {
      statusDiv.innerHTML = '<div class="ghai-status ghai-status-error" style="margin-top:12px">Please enter an OpenAI API key.</div>';
      return;
    }

    if (!apiKey.startsWith("sk-")) {
      statusDiv.innerHTML = '<div class="ghai-status ghai-status-warning" style="margin-top:12px">API key should start with "sk-". Please verify your key.</div>';
      return;
    }

    if (githubToken && !githubToken.startsWith("ghp_") && !githubToken.startsWith("github_pat_")) {
      statusDiv.innerHTML = '<div class="ghai-status ghai-status-warning" style="margin-top:12px">GitHub token should start with "ghp_" or "github_pat_". Please verify.</div>';
      return;
    }

    const data = { ghaiApiKey: apiKey, ghaiModel: model };
    if (githubToken) {
      data.ghaiGithubToken = githubToken;
    } else {
      // Clear token if removed
      chrome.storage.local.remove("ghaiGithubToken");
    }

    chrome.storage.local.set(data, () => {
      state.apiKey = apiKey;
      state.model = model;
      state.githubToken = githubToken || null;
      statusDiv.innerHTML = '<div class="ghai-status ghai-status-success" style="margin-top:12px">Settings saved successfully!</div>';
      setTimeout(() => { statusDiv.innerHTML = ""; }, 3000);
    });
  }

  function initSettingsTab() {
    const apiKeyInput = document.getElementById("ghai-api-key");
    const githubTokenInput = document.getElementById("ghai-github-token");
    const modelSelect = document.getElementById("ghai-model-select");
    if (state.apiKey) apiKeyInput.value = state.apiKey;
    if (state.githubToken) githubTokenInput.value = state.githubToken;
    modelSelect.value = state.model;
  }

  // ── Files Tab ─────────────────────────────────────────────────────

  async function initFilesTab() {
    const area = document.getElementById("ghai-files-area");

    if (!state.apiKey) {
      area.innerHTML = '<div class="ghai-status ghai-status-warning">Please add your OpenAI API key in Settings first.</div>';
      return;
    }

    if (state.fileTree) {
      renderFileTree(area);
      return;
    }

    area.innerHTML = `
      <div class="ghai-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Load project files for deeper AI analysis</p>
        <p style="color:#6b7280;font-size:12px;">Key config files are auto-selected. You can add more.</p>
      </div>
      <button class="ghai-generate-btn" id="ghai-load-files-btn">Load File Tree</button>
    `;
    document.getElementById("ghai-load-files-btn").addEventListener("click", loadFileTree);
  }

  async function loadFileTree() {
    const area = document.getElementById("ghai-files-area");
    if (state.loading) return;
    state.loading = true;

    area.innerHTML = '<div class="ghai-loading"><div class="ghai-spinner"></div><span>Fetching file tree...</span></div>';

    try {
      const result = await sendMessage({
        type: "FETCH_FILE_TREE",
        owner: state.owner,
        repo: state.repo,
      });
      if (!result.success) throw new Error(result.error);

      state.fileTree = result.data;

      // Auto-select signal files that exist in the repo
      state.selectedFiles.clear();
      for (const file of state.fileTree) {
        const basename = file.path.split("/").pop();
        if (SIGNAL_FILES.includes(basename) && file.size <= SIGNAL_FILE_MAX_SIZE) {
          state.selectedFiles.add(file.path);
        }
      }

      renderFileTree(area);
    } catch (err) {
      if (err.message === "PRIVATE_REPO_NO_TOKEN") {
        area.innerHTML = `
          <div class="ghai-status ghai-status-warning">
            This appears to be a <strong>private repository</strong>. Add a GitHub token in <strong>Settings</strong> to access its files.
          </div>
          <button class="ghai-generate-btn" id="ghai-goto-settings-btn2" style="background:#21262d;margin-top:4px;">Go to Settings</button>
        `;
        document.getElementById("ghai-goto-settings-btn2").addEventListener("click", () => switchTab("settings"));
        state.loading = false;
        return;
      }
      area.innerHTML = `
        <div class="ghai-status ghai-status-error">${escapeHtml(err.message)}</div>
        <button class="ghai-generate-btn" id="ghai-retry-files-btn" style="margin-top:12px">Retry</button>
      `;
      document.getElementById("ghai-retry-files-btn").addEventListener("click", loadFileTree);
    } finally {
      state.loading = false;
    }
  }

  function renderFileTree(area) {
    const selectedCount = state.selectedFiles.size;
    const totalFiles = state.fileTree.length;

    // Group files by top-level directory
    const groups = {};
    const rootFiles = [];

    for (const file of state.fileTree) {
      const parts = file.path.split("/");
      if (parts.length === 1) {
        rootFiles.push(file);
      } else {
        const dir = parts[0];
        if (!groups[dir]) groups[dir] = [];
        groups[dir].push(file);
      }
    }

    let html = `
      <div class="ghai-files-header">
        <div class="ghai-files-stats">
          <strong>${selectedCount}</strong> files selected for AI context
          <span style="color:#8b949e;margin-left:4px;">(${totalFiles} total)</span>
        </div>
        <div class="ghai-files-actions">
          <button class="ghai-files-action-btn" id="ghai-fetch-selected-btn">Fetch &amp; Save to Context</button>
          <button class="ghai-files-action-btn ghai-secondary" id="ghai-clear-files-btn">Clear All</button>
        </div>
      </div>
      <div class="ghai-files-search">
        <input type="text" class="ghai-settings-input" id="ghai-file-search" placeholder="Search files..." style="margin-bottom:0;" />
      </div>
      <div class="ghai-file-list" id="ghai-file-list">
    `;

    // Render root files first
    for (const file of rootFiles) {
      html += renderFileItem(file);
    }

    // Render directories
    const sortedDirs = Object.keys(groups).sort();
    for (const dir of sortedDirs) {
      const dirFiles = groups[dir];
      const selectedInDir = dirFiles.filter((f) => state.selectedFiles.has(f.path)).length;
      html += `
        <div class="ghai-file-dir" data-dir="${escapeHtml(dir)}">
          <div class="ghai-file-dir-header" data-dir="${escapeHtml(dir)}">
            <span class="ghai-dir-arrow">&#9654;</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8b949e" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span class="ghai-dir-name">${escapeHtml(dir)}/</span>
            <span class="ghai-dir-count">${dirFiles.length} files${selectedInDir > 0 ? `, ${selectedInDir} selected` : ""}</span>
          </div>
          <div class="ghai-file-dir-items" style="display:none;">
      `;
      for (const file of dirFiles) {
        html += renderFileItem(file);
      }
      html += `</div></div>`;
    }

    html += "</div>";

    // Show context status
    if (Object.keys(state.fileContents).length > 0) {
      const contextSize = Object.values(state.fileContents).join("").length;
      html += `<div class="ghai-status ghai-status-info" style="margin-top:12px">${Object.keys(state.fileContents).length} files loaded into AI context (${Math.round(contextSize / 1000)}K chars)</div>`;
    }

    area.innerHTML = html;

    // Bind events
    document.getElementById("ghai-fetch-selected-btn").addEventListener("click", fetchSelectedFiles);
    document.getElementById("ghai-clear-files-btn").addEventListener("click", () => {
      state.selectedFiles.clear();
      state.fileContents = {};
      renderFileTree(area);
    });

    // File search
    document.getElementById("ghai-file-search").addEventListener("input", (e) => {
      filterFileList(e.target.value.toLowerCase());
    });

    // Directory toggles
    area.querySelectorAll(".ghai-file-dir-header").forEach((header) => {
      header.addEventListener("click", () => {
        const dir = header.parentElement;
        const items = dir.querySelector(".ghai-file-dir-items");
        const arrow = header.querySelector(".ghai-dir-arrow");
        const isOpen = items.style.display !== "none";
        items.style.display = isOpen ? "none" : "block";
        arrow.style.transform = isOpen ? "" : "rotate(90deg)";
      });
    });

    // File checkboxes
    area.querySelectorAll(".ghai-file-check").forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const path = e.target.dataset.path;
        if (e.target.checked) {
          state.selectedFiles.add(path);
        } else {
          state.selectedFiles.delete(path);
        }
        // Update stats
        const statsEl = area.querySelector(".ghai-files-stats");
        if (statsEl) {
          statsEl.innerHTML = `<strong>${state.selectedFiles.size}</strong> files selected for AI context <span style="color:#8b949e;margin-left:4px;">(${state.fileTree.length} total)</span>`;
        }
      });
    });
  }

  function renderFileItem(file) {
    const checked = state.selectedFiles.has(file.path) ? "checked" : "";
    const basename = file.path.split("/").pop();
    const sizeStr = file.size > 1024 ? `${Math.round(file.size / 1024)}KB` : `${file.size}B`;
    const isSignal = SIGNAL_FILES.includes(basename);
    const loaded = state.fileContents[file.path] ? ' ghai-file-loaded' : '';

    return `
      <label class="ghai-file-item${loaded}" data-path="${escapeHtml(file.path)}">
        <input type="checkbox" class="ghai-file-check" data-path="${escapeHtml(file.path)}" ${checked} />
        <span class="ghai-file-name${isSignal ? ' ghai-signal-file' : ''}">${escapeHtml(file.path.split("/").pop())}</span>
        ${file.path.includes("/") ? `<span class="ghai-file-path">${escapeHtml(file.path)}</span>` : ""}
        <span class="ghai-file-size">${sizeStr}</span>
      </label>
    `;
  }

  function filterFileList(query) {
    const items = document.querySelectorAll(".ghai-file-item");
    const dirs = document.querySelectorAll(".ghai-file-dir");

    if (!query) {
      items.forEach((el) => (el.style.display = ""));
      dirs.forEach((el) => {
        el.style.display = "";
        el.querySelector(".ghai-file-dir-items").style.display = "none";
        el.querySelector(".ghai-dir-arrow").style.transform = "";
      });
      return;
    }

    items.forEach((el) => {
      const path = el.dataset.path || "";
      el.style.display = path.toLowerCase().includes(query) ? "" : "none";
    });

    dirs.forEach((el) => {
      const visibleItems = el.querySelectorAll('.ghai-file-item:not([style*="display: none"])');
      if (visibleItems.length > 0) {
        el.style.display = "";
        el.querySelector(".ghai-file-dir-items").style.display = "block";
        el.querySelector(".ghai-dir-arrow").style.transform = "rotate(90deg)";
      } else {
        el.style.display = "none";
      }
    });
  }

  async function fetchSelectedFiles() {
    const area = document.getElementById("ghai-files-area");
    if (state.loading || state.selectedFiles.size === 0) return;

    state.loading = true;
    const fetchBtn = document.getElementById("ghai-fetch-selected-btn");
    if (fetchBtn) {
      fetchBtn.disabled = true;
      fetchBtn.textContent = "Fetching...";
    }

    try {
      const paths = [...state.selectedFiles];
      const result = await sendMessage({
        type: "FETCH_FILES",
        owner: state.owner,
        repo: state.repo,
        paths: paths,
      });

      if (!result.success) throw new Error(result.error);

      // Merge new file contents, respecting the total char limit
      let totalChars = 0;
      const newContents = {};

      for (const [path, content] of Object.entries(result.data)) {
        if (totalChars + content.length > FILE_CONTEXT_CHAR_LIMIT) break;
        newContents[path] = content;
        totalChars += content.length;
      }

      state.fileContents = newContents;
      renderFileTree(area);
    } catch (err) {
      const statusHtml = `<div class="ghai-status ghai-status-error" style="margin-top:12px">${escapeHtml(err.message)}</div>`;
      area.insertAdjacentHTML("beforeend", statusHtml);
    } finally {
      state.loading = false;
    }
  }

  // Build file context string for AI prompts
  function buildFileContext() {
    if (!state.fileContextEnabled || Object.keys(state.fileContents).length === 0) {
      return "";
    }

    let context = "";
    for (const [path, content] of Object.entries(state.fileContents)) {
      context += `\n--- ${path} ---\n${content}\n`;
    }
    return context;
  }

  // ── Summary Tab ───────────────────────────────────────────────────

  function initSummaryTab() {
    const area = document.getElementById("ghai-summary-area");

    if (!state.apiKey) {
      area.innerHTML = '<div class="ghai-status ghai-status-warning">Please add your OpenAI API key in Settings to use this extension.</div>';
      return;
    }

    if (state.summary) {
      const hasFiles = Object.keys(state.fileContents).length > 0;
      area.innerHTML = `
        <button class="ghai-generate-btn" id="ghai-regenerate-btn">Regenerate Summary</button>
        ${hasFiles ? '<div class="ghai-status ghai-status-info" style="margin-bottom:12px">Summary includes context from ' + Object.keys(state.fileContents).length + ' project files.</div>' : ""}
        <div class="ghai-summary-content">${renderMarkdown(state.summary)}</div>
      `;
      document.getElementById("ghai-regenerate-btn").addEventListener("click", () => {
        state.summary = null;
        generateSummary();
      });
      return;
    }

    area.innerHTML = `
      <div class="ghai-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <p>Analyze this repository with AI</p>
        <p style="color:#6b7280;font-size:12px;">Fetches README and metadata to generate insights</p>
      </div>
      <button class="ghai-generate-btn" id="ghai-generate-btn">Generate Summary</button>
    `;
    document.getElementById("ghai-generate-btn").addEventListener("click", generateSummary);
  }

  async function generateSummary() {
    const area = document.getElementById("ghai-summary-area");
    if (state.loading) return;
    state.loading = true;

    area.innerHTML = '<div class="ghai-loading"><div class="ghai-spinner"></div><span>Fetching repository data...</span></div>';

    try {
      // Check repo access first
      let repoDescription = "";
      const repoResult = await sendMessage({ type: "FETCH_REPO_INFO", owner: state.owner, repo: state.repo });
      if (!repoResult.success) {
        if (repoResult.error === "PRIVATE_REPO_NO_TOKEN") {
          area.innerHTML = `
            <div class="ghai-status ghai-status-warning">
              This appears to be a <strong>private repository</strong>. To analyze it, add a GitHub token in the <strong>Settings</strong> tab with read access to this repo.
            </div>
            <button class="ghai-generate-btn ghai-secondary-btn" id="ghai-goto-settings-btn" style="background:#21262d;margin-top:4px;">Go to Settings</button>
          `;
          document.getElementById("ghai-goto-settings-btn").addEventListener("click", () => switchTab("settings"));
          state.loading = false;
          return;
        }
        throw new Error(repoResult.error);
      }
      repoDescription = repoResult.data.description || "";

      if (!state.readme) {
        const readmeResult = await sendMessage({ type: "FETCH_README", owner: state.owner, repo: state.repo });
        if (!readmeResult.success) throw new Error(readmeResult.error);
        state.readme = readmeResult.data;
      }

      area.innerHTML = '<div class="ghai-loading"><div class="ghai-spinner"></div><span>AI is analyzing the repository...</span></div>';

      const aiResult = await sendMessage({
        type: "AI_SUMMARY",
        readme: state.readme,
        repoName: `${state.owner}/${state.repo}`,
        repoDescription: repoDescription,
        fileContext: buildFileContext(),
      });

      if (!aiResult.success) throw new Error(aiResult.error);
      state.summary = aiResult.data;

      const hasFiles = Object.keys(state.fileContents).length > 0;
      area.innerHTML = `
        <button class="ghai-generate-btn" id="ghai-regenerate-btn">Regenerate Summary</button>
        ${hasFiles ? '<div class="ghai-status ghai-status-info" style="margin-bottom:12px">Summary includes context from ' + Object.keys(state.fileContents).length + ' project files.</div>' : ""}
        <div class="ghai-summary-content">${renderMarkdown(state.summary)}</div>
      `;
      document.getElementById("ghai-regenerate-btn").addEventListener("click", () => {
        state.summary = null;
        generateSummary();
      });
    } catch (err) {
      area.innerHTML = `
        <div class="ghai-status ghai-status-error">${escapeHtml(err.message)}</div>
        <button class="ghai-generate-btn" id="ghai-retry-btn" style="margin-top:12px">Retry</button>
      `;
      document.getElementById("ghai-retry-btn").addEventListener("click", generateSummary);
    } finally {
      state.loading = false;
    }
  }

  // ── Chat Tab ──────────────────────────────────────────────────────

  function initChatTab() {
    const messagesDiv = document.getElementById("ghai-chat-messages");
    const input = document.getElementById("ghai-chat-input");
    const sendBtn = document.getElementById("ghai-chat-send-btn");

    if (!state.apiKey) {
      messagesDiv.innerHTML = '<div class="ghai-status ghai-status-warning">Please add your OpenAI API key in Settings to use this extension.</div>';
      input.disabled = true;
      sendBtn.disabled = true;
      return;
    }

    input.disabled = false;
    sendBtn.disabled = false;

    if (state.chatHistory.length === 0) {
      const hasFiles = Object.keys(state.fileContents).length > 0;
      messagesDiv.innerHTML = `
        <div class="ghai-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>Ask anything about this repository</p>
          <p style="color:#6b7280;font-size:12px;">e.g. "What does this repo do?" or "Is this production ready?"</p>
          ${hasFiles ? '<p style="color:#6366f1;font-size:12px;margin-top:8px;">File context active (' + Object.keys(state.fileContents).length + ' files loaded)</p>' : '<p style="color:#6b7280;font-size:11px;margin-top:8px;">Tip: Load files in the Files tab for richer answers</p>'}
        </div>
      `;
    }

    input.focus();
  }

  async function sendChatMessage() {
    const input = document.getElementById("ghai-chat-input");
    const messagesDiv = document.getElementById("ghai-chat-messages");
    const sendBtn = document.getElementById("ghai-chat-send-btn");
    const question = input.value.trim();

    if (!question || state.loading) return;

    state.loading = true;
    input.value = "";
    sendBtn.disabled = true;
    input.disabled = true;

    if (state.chatHistory.length === 0) messagesDiv.innerHTML = "";

    state.chatHistory.push({ role: "user", content: question });
    appendChatMessage("user", question);

    const loadingId = "ghai-chat-loading-" + Date.now();
    const loadingDiv = document.createElement("div");
    loadingDiv.id = loadingId;
    loadingDiv.className = "ghai-loading";
    loadingDiv.innerHTML = '<div class="ghai-spinner"></div><span>Thinking...</span>';
    messagesDiv.appendChild(loadingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
      // Check repo access if we haven't loaded anything yet
      if (!state.readme) {
        const repoCheck = await sendMessage({ type: "FETCH_REPO_INFO", owner: state.owner, repo: state.repo });
        if (!repoCheck.success && repoCheck.error === "PRIVATE_REPO_NO_TOKEN") {
          const loadingEl = document.getElementById(loadingId);
          if (loadingEl) loadingEl.remove();
          appendChatMessage("ai", "This is a **private repository**. Please add a GitHub token in the **Settings** tab to access it.");
          state.chatHistory.push({ role: "ai", content: "Private repo — token needed." });
          state.loading = false;
          sendBtn.disabled = false;
          input.disabled = false;
          return;
        }

        const readmeResult = await sendMessage({ type: "FETCH_README", owner: state.owner, repo: state.repo });
        if (readmeResult.success) state.readme = readmeResult.data;
      }

      const aiResult = await sendMessage({
        type: "AI_CHAT",
        readme: state.readme || "No README available.",
        summary: state.summary || "",
        repoName: `${state.owner}/${state.repo}`,
        question: question,
        fileContext: buildFileContext(),
      });

      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      if (!aiResult.success) throw new Error(aiResult.error);

      state.chatHistory.push({ role: "ai", content: aiResult.data });
      appendChatMessage("ai", aiResult.data);
    } catch (err) {
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();
      appendChatMessage("ai", `Error: ${err.message}`);
    } finally {
      state.loading = false;
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  function appendChatMessage(role, content) {
    const messagesDiv = document.getElementById("ghai-chat-messages");
    const msgDiv = document.createElement("div");
    msgDiv.className = `ghai-chat-msg ghai-${role}`;
    msgDiv.innerHTML = role === "ai" ? renderMarkdown(content) : escapeHtml(content);
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function isContextValid() {
    try {
      return !!chrome.runtime.id;
    } catch {
      return false;
    }
  }

  function showInvalidContextError() {
    closeSidebar();
    const btn = document.getElementById("ghai-floating-btn");
    if (btn) btn.remove();
    const overlay = document.getElementById("ghai-sidebar-overlay");
    if (overlay) overlay.remove();
    const sidebar = document.getElementById("ghai-sidebar");
    if (sidebar) sidebar.remove();

    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:999999;background:#2d1216;color:#f85149;border:1px solid #da3633;padding:12px 18px;border-radius:10px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:320px;";
    banner.innerHTML = '<strong>GitHub AI Assistant</strong><br>Extension was updated. Please <a href="javascript:location.reload()" style="color:#79c0ff;text-decoration:underline;">refresh the page</a> to continue.';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 15000);
  }

  function sendMessage(msg) {
    if (!isContextValid()) {
      showInvalidContextError();
      return Promise.reject(new Error("Extension context invalidated. Please refresh the page."));
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          if (chrome.runtime.lastError.message.includes("Extension context invalidated")) {
            showInvalidContextError();
          }
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Listen for toolbar icon click ─────────────────────────────────

  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === "TOGGLE_SIDEBAR") toggleSidebar();
  });

  // ── URL Change Detection (SPA navigation) ─────────────────────────

  let lastURL = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastURL) {
      lastURL = location.href;
      handleNavigation();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function handleNavigation() {
    const btn = document.getElementById("ghai-floating-btn");
    if (isRepoPage()) {
      if (btn) btn.style.display = "flex";
      const parsed = parseRepoFromURL();
      if (parsed && (parsed.owner !== state.owner || parsed.repo !== state.repo)) {
        state.readme = null;
        state.summary = null;
        state.chatHistory = [];
        state.fileTree = null;
        state.selectedFiles.clear();
        state.fileContents = {};
        if (state.sidebarOpen) {
          state.owner = parsed.owner;
          state.repo = parsed.repo;
          document.getElementById("ghai-repo-name").textContent = `${state.owner}/${state.repo}`;
          switchTab(state.activeTab);
        }
      }
    } else {
      if (btn) btn.style.display = "none";
      if (state.sidebarOpen) closeSidebar();
    }
  }

  // ── Initialize ────────────────────────────────────────────────────

  function init() {
    if (!isRepoPage()) return;
    createFloatingButton();
    createSidebar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
