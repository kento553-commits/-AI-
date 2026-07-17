const CHATGPT_EXTRACT_MESSAGE = "EXTRACT_CHATGPT_CONVERSATION";
const PENDING_CONVERSATION_KEY = "pendingConversationDraft";
const EXTENSION_CONVERSATION_MESSAGE = "AI_RECEIPT_DRAFT";
const EXTENSION_CONVERSATION_ACK = "AI_RECEIPT_DRAFT_RECEIVED";

if (isWebAppPage()) {
  startWebAppBridge();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== CHATGPT_EXTRACT_MESSAGE) return false;

  try {
    const conversation = extractChatGptConversation({
      maxMessages: message.maxMessages,
      maxMessageChars: message.maxMessageChars,
    });
    sendResponse({ ok: true, conversation });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "会話を取得できませんでした。",
    });
  }

  return true;
});

function startWebAppBridge() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("source") !== "extension") return;

  if (!isStorageAvailable()) {
    console.warn(
      "[AI Receipt] chrome.storage.local が使えません。拡張機能を再読み込みして storage 権限を反映してください。",
    );
    return;
  }

  console.info("[AI Receipt] GitHub Pages bridge started.");

  let intervalId = null;

  const stopPosting = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== EXTENSION_CONVERSATION_ACK) return;

    stopPosting();
    removePendingConversation();
    console.info("[AI Receipt] Draft delivered and temporary storage removed.");
  });

  chrome.storage.local.get([PENDING_CONVERSATION_KEY], (result) => {
    if (chrome.runtime?.lastError) {
      console.warn("[AI Receipt] 一時保存された会話データを取得できませんでした。", chrome.runtime.lastError);
      return;
    }

    const conversation = result[PENDING_CONVERSATION_KEY];
    if (!isRawConversation(conversation)) {
      console.warn("[AI Receipt] 一時保存された会話データが見つかりません。", {
        key: PENDING_CONVERSATION_KEY,
      });
      return;
    }

    const messageCount = conversation.messages.length;
    const postConversation = () => {
      window.postMessage(
        {
          type: EXTENSION_CONVERSATION_MESSAGE,
          payload: conversation,
        },
        window.location.origin,
      );
    };

    let attempts = 0;
    console.info(`[AI Receipt] Posting draft to React app. messages=${messageCount}`);
    postConversation();
    intervalId = setInterval(() => {
      attempts += 1;
      if (attempts > 40) {
        stopPosting();
        console.warn("[AI Receipt] React app did not acknowledge the draft message.");
        return;
      }
      postConversation();
    }, 250);
  });
}

function removePendingConversation() {
  if (!isStorageAvailable()) return;
  chrome.storage.local.remove(PENDING_CONVERSATION_KEY);
}

function isStorageAvailable() {
  return Boolean(globalThis.chrome?.storage?.local);
}

function isWebAppPage() {
  return (
    window.location.hostname === "kento553-commits.github.io" &&
    window.location.pathname.startsWith("/-AI-/")
  );
}

function isRawConversation(value) {
  return (
    value &&
    typeof value === "object" &&
    Array.isArray(value.messages) &&
    value.messages.some(
      (message) =>
        message &&
        typeof message === "object" &&
        typeof message.text === "string",
    )
  );
}

function extractChatGptConversation({ maxMessages = 24, maxMessageChars = 1600 } = {}) {
  const messages = collectChatGptMessages(maxMessages, maxMessageChars);
  const conversationTitle = findConversationTitle(messages);

  return {
    aiService: "ChatGPT",
    url: window.location.href,
    conversationTitle,
    messages,
  };
}

function collectChatGptMessages(limit, charLimit) {
  const nodes = Array.from(document.querySelectorAll("[data-message-author-role]"));
  const messages = nodes
    .map((node) => {
      const role = node.getAttribute("data-message-author-role") === "assistant" ? "assistant" : "user";
      const text = truncateText(cleanupPageText(extractMessageText(node)), charLimit);

      return {
        role,
        text,
      };
    })
    .filter((message) => message.text.length > 0);

  return uniqueMessages(messages).slice(-limit);
}

function extractMessageText(node) {
  const content =
    node.querySelector(".markdown") ||
    node.querySelector("[data-message-id]") ||
    node;

  const clone = content.cloneNode(true);
  clone
    .querySelectorAll(
      [
        "button",
        "svg",
        "style",
        "script",
        "textarea",
        "[aria-hidden='true']",
        "[data-testid='copy-turn-action-button']",
      ].join(","),
    )
    .forEach((element) => element.remove());

  return clone.textContent || "";
}

function findConversationTitle(messages) {
  const candidates = [
    document.querySelector("main h1")?.textContent,
    document.querySelector("h1")?.textContent,
    document.title,
    messages.find((message) => message.role === "user")?.text,
  ];

  const title = candidates.map(cleanupTitle).find(Boolean);
  return title || "ChatGPTの会話";
}

function cleanupTitle(title) {
  const cleaned = cleanupPageText(title)
    .replace(/\s*[-|]\s*ChatGPT.*$/i, "")
    .replace(/^ChatGPT\s*[-|]\s*/i, "")
    .trim();

  if (!cleaned || cleaned === "ChatGPT") return "";
  return truncateText(cleaned, 60);
}

function uniqueMessages(messages) {
  const seen = new Set();

  return messages.filter((message) => {
    const key = `${message.role}:${message.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function truncateText(text, maxLength) {
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function cleanupPageText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}
