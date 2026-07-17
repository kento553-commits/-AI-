const WEB_APP_URL = "https://kento553-commits.github.io/-AI-/";
const CHATGPT_EXTRACT_MESSAGE = "EXTRACT_CHATGPT_CONVERSATION";
const PENDING_CONVERSATION_KEY = "pendingConversationDraft";
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 1600;

const button = document.getElementById("createReceipt");
const statusText = document.getElementById("status");

button.addEventListener("click", async () => {
  setStatus("ChatGPTの会話を読み取っています...", true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      throw new Error("現在のタブを取得できませんでした。");
    }

    if (!isChatGptUrl(tab.url)) {
      throw new Error("まずChatGPTの会話ページを開いてから実行してください。");
    }

    const extracted = await requestConversationFromContentScript(tab.id);
    const rawConversation = normalizeConversation(extracted, tab);
    const messageCount = rawConversation.messages.length;

    if (messageCount === 0) {
      throw new Error("会話を取得できませんでした。ページを少しスクロールしてから再度お試しください。");
    }

    setStatus(`会話を${messageCount}件取得しました。`, true);
    await savePendingConversation(rawConversation);

    setStatus("会話データを一時保存しました。Webアプリを開きます。", true);
    await delay(200);

    await chrome.tabs.create({ url: createExtensionSourceUrl() });
    setStatus(`会話を${messageCount}件取得しました。Webアプリで候補を開きました。`, false);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : "会話を取得できませんでした。", false);
  }
});

function setStatus(message, busy) {
  statusText.textContent = message;
  button.disabled = busy;
}

function isChatGptUrl(url) {
  const value = String(url || "").toLowerCase();
  return value.includes("chatgpt.com") || value.includes("chat.openai.com");
}

async function requestConversationFromContentScript(tabId) {
  try {
    return await sendExtractMessage(tabId);
  } catch (error) {
    if (!isMissingContentScriptError(error)) throw error;

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"],
    });
    return sendExtractMessage(tabId);
  }
}

async function sendExtractMessage(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: CHATGPT_EXTRACT_MESSAGE,
    maxMessages: MAX_MESSAGES,
    maxMessageChars: MAX_MESSAGE_CHARS,
  });

  if (!response?.ok) {
    throw new Error(response?.error || "会話を取得できませんでした。");
  }

  return response.conversation;
}

function isMissingContentScriptError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /receiving end does not exist|could not establish connection/i.test(message);
}

function normalizeConversation(extracted, tab) {
  const capturedAt = formatCapturedAt(new Date());
  const url = extracted?.url || tab.url || "";
  const title = cleanupTitle(extracted?.conversationTitle || tab.title || "ChatGPTの会話");
  const messages = Array.isArray(extracted?.messages)
    ? extracted.messages
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          text: cleanupText(message.text),
        }))
        .filter((message) => message.text.length > 0)
    : [];

  return {
    aiService: "ChatGPT",
    url,
    capturedAt,
    conversationTitle: title,
    messages,
  };
}

function savePendingConversation(rawConversation) {
  if (!isStorageAvailable()) {
    throw new Error(
      "chrome.storage.local が使えません。chrome://extensions で拡張機能を再読み込みして、storage 権限を反映してください。",
    );
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      {
        [PENDING_CONVERSATION_KEY]: rawConversation,
      },
      () => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(`会話データを一時保存できませんでした: ${lastError.message}`));
          return;
        }
        resolve();
      },
    );
  });
}

function isStorageAvailable() {
  return Boolean(globalThis.chrome?.storage?.local);
}

function createExtensionSourceUrl() {
  const url = new URL(WEB_APP_URL);
  url.searchParams.set("source", "extension");
  return url.toString();
}

function formatCapturedAt(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function cleanupTitle(title) {
  const cleaned = cleanupText(title)
    .replace(/\s*[-|]\s*ChatGPT.*$/i, "")
    .replace(/^ChatGPT\s*[-|]\s*/i, "")
    .trim();
  return cleaned || "ChatGPTの会話";
}

function cleanupText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
