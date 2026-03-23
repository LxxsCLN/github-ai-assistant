// GitHub AI Assistant - Background Service Worker
// All API keys and tokens are read from chrome.storage.local here,
// never passed from the content script. This keeps secrets out of
// the content script execution context.

// ── Helpers ─────────────────────────────────────────────────────────

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["ghaiApiKey", "ghaiModel", "ghaiGithubToken"], (result) => {
      resolve({
        apiKey: result.ghaiApiKey || null,
        model: result.ghaiModel || "gpt-4o-mini",
        githubToken: result.ghaiGithubToken || null,
      });
    });
  });
}

function githubHeaders(token) {
  const headers = { Accept: "application/vnd.github.v3+json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

// ── Message Handler ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request)
    .then((data) => sendResponse({ success: true, data }))
    .catch((err) => sendResponse({ success: false, error: err.message }));
  return true; // Keep channel open for async
});

async function handleMessage(request) {
  const settings = await getSettings();

  switch (request.type) {
    case "FETCH_README":
      return fetchReadme(request.owner, request.repo, settings.githubToken);

    case "FETCH_REPO_INFO":
      return fetchRepoInfo(request.owner, request.repo, settings.githubToken);

    case "FETCH_FILE_TREE":
      return fetchFileTree(request.owner, request.repo, settings.githubToken);

    case "FETCH_FILES":
      return fetchFiles(request.owner, request.repo, request.paths, settings.githubToken);

    case "AI_SUMMARY":
      if (!settings.apiKey) throw new Error("No API key configured.");
      return callOpenAI(
        settings.apiKey,
        settings.model,
        buildSummaryMessages(request.readme, request.repoName, request.repoDescription, request.fileContext)
      );

    case "AI_CHAT":
      if (!settings.apiKey) throw new Error("No API key configured.");
      return callOpenAI(
        settings.apiKey,
        settings.model,
        buildChatMessages(request.readme, request.summary, request.repoName, request.question, request.fileContext)
      );

    default:
      throw new Error(`Unknown message type: ${request.type}`);
  }
}

// ── GitHub API ──────────────────────────────────────────────────────

async function fetchReadme(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/readme`;
  const headers = githubHeaders(token);
  headers.Accept = "application/vnd.github.v3.raw";

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 404) return "No README found for this repository.";
    if (response.status === 403) throw new Error("GitHub API rate limit exceeded. Add a GitHub token in Settings for higher limits.");
    throw new Error(`GitHub API error: ${response.status}`);
  }
  const text = await response.text();
  return text.length > 8000 ? text.substring(0, 8000) + "\n\n[README truncated...]" : text;
}

async function fetchRepoInfo(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (!response.ok) {
    if (response.status === 404 && !token) {
      throw new Error("PRIVATE_REPO_NO_TOKEN");
    }
    if (response.status === 404) {
      throw new Error("Repository not found or token lacks access to this repo.");
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }
  return response.json();
}

async function fetchFileTree(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (!response.ok) {
    if (response.status === 404 && !token) {
      throw new Error("PRIVATE_REPO_NO_TOKEN");
    }
    throw new Error(`Failed to fetch file tree: ${response.status}`);
  }
  const data = await response.json();

  // Return a lightweight version: only files (no subtrees), with path and size
  return (data.tree || [])
    .filter((item) => item.type === "blob")
    .map((item) => ({ path: item.path, size: item.size }));
}

async function fetchFiles(owner, repo, paths, token) {
  const headers = githubHeaders(token);
  headers.Accept = "application/vnd.github.v3.raw";

  const results = {};
  // Fetch files in parallel, max 10 at a time
  const chunks = [];
  for (let i = 0; i < paths.length; i += 10) {
    chunks.push(paths.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const fetches = chunk.map(async (filePath) => {
      try {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
        const response = await fetch(url, { headers });
        if (!response.ok) {
          results[filePath] = `[Error: ${response.status}]`;
          return;
        }
        let text = await response.text();
        // Cap individual file at 3000 chars
        if (text.length > 3000) {
          text = text.substring(0, 3000) + "\n[File truncated...]";
        }
        results[filePath] = text;
      } catch {
        results[filePath] = "[Error fetching file]";
      }
    });
    await Promise.all(fetches);
  }

  return results;
}

// ── OpenAI API ──────────────────────────────────────────────────────

async function callOpenAI(apiKey, model, messages) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages,
      max_tokens: 2000,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const errorMsg = errorBody?.error?.message || `OpenAI API error: ${response.status}`;
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ── Prompt Builders ─────────────────────────────────────────────────

function buildSummaryMessages(readme, repoName, repoDescription, fileContext) {
  let context = `Repository: ${repoName}\nDescription: ${repoDescription || "No description provided"}\n\nREADME:\n${readme}`;

  if (fileContext) {
    context += `\n\nProject Files:\n${fileContext}`;
  }

  return [
    {
      role: "system",
      content:
        "You are a senior software engineer. Provide extremely concise, dense analysis. No filler, no fluff, no redundancy. Every sentence must add new information. Use short bullet points (1 line each). Use markdown formatting.",
    },
    {
      role: "user",
      content: `Analyze this GitHub repository.\n\n${context}\n\nReturn in this exact format (keep it short and dense):\n\n## Summary\n2-3 sentences max. What it does, who it's for.\n\n## Key Features\n- Short bullet points, max 5-6 items, one line each\n\n## Tech Stack\n- Just list the technologies, no descriptions\n\n## How It Works\n2-3 sentences max. Architecture and flow only.`,
    },
  ];
}

function buildChatMessages(readme, summary, repoName, question, fileContext) {
  let context = `Repository: ${repoName}\n\nRepository context:\n${summary || "No summary available yet."}\n\nREADME excerpt:\n${readme}`;

  if (fileContext) {
    context += `\n\nProject Files:\n${fileContext}`;
  }

  return [
    {
      role: "system",
      content:
        "You are an expert software engineer helping a developer understand a GitHub repository. Answer questions clearly and concisely using the provided repository context, including any project files shared. Use markdown formatting where appropriate.",
    },
    {
      role: "user",
      content: `${context}\n\nUser question: ${question}\n\nAnswer clearly and concisely.`,
    },
  ];
}

// ── Toolbar Icon ────────────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes("github.com")) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" }).catch(() => {
      // Content script not loaded on this tab — ignore
    });
  }
});
