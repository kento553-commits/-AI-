const WEB_APP_URL = "http://localhost:5173/";

const button = document.getElementById("createReceipt");
const statusText = document.getElementById("status");

button.addEventListener("click", async () => {
  setStatus("会話を読み取っています...", true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      throw new Error("現在のタブを取得できませんでした。");
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractConversationFromPage,
    });

    const rawConversation = normalizeConversation(result, tab);
    const draft = encodeURIComponent(JSON.stringify(rawConversation));
    const url = `${WEB_APP_URL}?draft=${draft}`;

    await chrome.tabs.create({ url });
    setStatus("Webアプリを開きました。", false);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : "会話データを送れませんでした。", false);
  }
});

function setStatus(message, busy) {
  statusText.textContent = message;
  button.disabled = busy;
}

function normalizeConversation(extracted, tab) {
  const capturedAt = formatCapturedAt(new Date());
  const url = extracted?.url || tab.url || "";
  const title = extracted?.conversationTitle || tab.title || "無題の会話";
  const messages = Array.isArray(extracted?.messages) ? extracted.messages : [];

  return {
    aiService: extracted?.aiService || inferAiService(url),
    url,
    capturedAt,
    conversationTitle: cleanupTitle(title),
    messages: messages.length > 0 ? messages : fallbackMessages(title),
  };
}

function fallbackMessages(title) {
  return [
    {
      role: "user",
      text: cleanupText(title || "現在のAI会話"),
    },
  ];
}

function formatCapturedAt(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function cleanupTitle(title) {
  return cleanupText(title)
    .replace(/\s*[-|]\s*(ChatGPT|Claude|Gemini|Perplexity|NotebookLM|Copilot).*$/i, "")
    .trim();
}

function cleanupText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function inferAiService(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("chatgpt.com")) return "ChatGPT";
  if (value.includes("gemini.google.com")) return "Gemini";
  if (value.includes("claude.ai")) return "Claude";
  if (value.includes("perplexity.ai")) return "Perplexity";
  if (value.includes("notebooklm.google.com")) return "NotebookLM";
  if (value.includes("copilot.microsoft.com")) return "Copilot";
  return "その他";
}

function extractConversationFromPage() {
  const url = window.location.href;
  const aiService = inferServiceFromLocation(url);
  const conversationTitle = findConversationTitle();
  const messages = collectMessages();

  return {
    aiService,
    url,
    conversationTitle,
    messages,
  };

  function inferServiceFromLocation(currentUrl) {
    const value = String(currentUrl || "").toLowerCase();
    if (value.includes("chatgpt.com")) return "ChatGPT";
    if (value.includes("gemini.google.com")) return "Gemini";
    if (value.includes("claude.ai")) return "Claude";
    if (value.includes("perplexity.ai")) return "Perplexity";
    if (value.includes("notebooklm.google.com")) return "NotebookLM";
    if (value.includes("copilot.microsoft.com")) return "Copilot";
    return "その他";
  }

  function findConversationTitle() {
    const heading = document.querySelector("h1")?.textContent;
    const title = heading || document.title || "無題の会話";
    return cleanupPageText(title)
      .replace(/\s*[-|]\s*(ChatGPT|Claude|Gemini|Perplexity|NotebookLM|Copilot).*$/i, "")
      .trim();
  }

  function collectMessages() {
    const collectors = [
      collectChatGptMessages,
      collectClaudeMessages,
      collectGeminiMessages,
      collectGenericMessages,
    ];

    for (const collect of collectors) {
      const messages = collect();
      if (messages.length > 0) return messages.slice(-20);
    }

    return [];
  }

  function collectChatGptMessages() {
    return uniqueMessages(
      Array.from(document.querySelectorAll("[data-message-author-role]")).map((node) => ({
        role: normalizeRole(node.getAttribute("data-message-author-role")),
        text: cleanupPageText(node.textContent),
      })),
    );
  }

  function collectClaudeMessages() {
    return uniqueMessages(
      Array.from(document.querySelectorAll("[data-testid*='user'], [data-testid*='assistant']")).map(
        (node) => ({
          role: /user/i.test(node.getAttribute("data-testid") || "") ? "user" : "assistant",
          text: cleanupPageText(node.textContent),
        }),
      ),
    );
  }

  function collectGeminiMessages() {
    const nodes = Array.from(
      document.querySelectorAll("user-query, model-response, [data-test-id*='user'], [data-test-id*='response']"),
    );

    return uniqueMessages(
      nodes.map((node) => {
        const marker = `${node.tagName} ${node.getAttribute("data-test-id") || ""}`;
        return {
          role: /user|query/i.test(marker) ? "user" : "assistant",
          text: cleanupPageText(node.textContent),
        };
      }),
    );
  }

  function collectGenericMessages() {
    const nodes = Array.from(
      document.querySelectorAll("main article, main [role='article'], main [data-testid], main .message"),
    );

    return uniqueMessages(
      nodes.map((node, index) => ({
        role: inferRoleFromNode(node, index),
        text: cleanupPageText(node.textContent),
      })),
    );
  }

  function inferRoleFromNode(node, index) {
    const marker = [
      node.getAttribute("aria-label"),
      node.getAttribute("data-testid"),
      node.className,
      node.textContent?.slice(0, 80),
    ]
      .join(" ")
      .toLowerCase();

    if (/user|you|あなた|ユーザー/.test(marker)) return "user";
    if (/assistant|ai|回答|アシスタント|model/.test(marker)) return "assistant";
    return index % 2 === 0 ? "user" : "assistant";
  }

  function normalizeRole(role) {
    return role === "assistant" ? "assistant" : "user";
  }

  function uniqueMessages(messages) {
    const seen = new Set();
    return messages
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        text: cleanupPageText(message.text),
      }))
      .filter((message) => {
        if (!message.text || message.text.length < 2) return false;
        const key = `${message.role}:${message.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function cleanupPageText(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
  }
}
