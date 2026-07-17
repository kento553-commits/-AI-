# 私とAIの確定申告 Chrome拡張

ChatGPTの会話ページから、現在表示されている会話を取得し、Webアプリの思考レシート候補フォームへ送るための拡張機能です。

取得はpopupのボタンを押した時だけ行います。見られたくない会話や個人情報を含む会話では使わないでください。

## 構成

- `manifest.json`: Chrome拡張の設定
- `popup.html`: 拡張機能popupの画面
- `popup.js`: popupからWebアプリを開く処理
- `content-script.js`: ChatGPTページから会話本文を取得する処理

## 読み込み方法

1. Chromeで `chrome://extensions/` を開きます。
2. 右上の「デベロッパー モード」をオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」を押します。
4. この `chrome-extension` フォルダを選択します。

manifest.json を変更した後は、`chrome://extensions/` の拡張機能カードで再読み込みボタンを押してください。`chrome.storage.local が使えません` と表示される場合は、古い権限のまま動いている可能性があります。

## 使い方

1. ChatGPTの会話ページを開きます。
2. Chromeツールバーの拡張機能アイコンから「私とAIの確定申告」を開きます。
3. `この会話を思考レシートにする` を押します。
4. 会話データが拡張機能の `chrome.storage.local` に `pendingConversationDraft` として一時保存されます。
5. Webアプリが `?source=extension` 付きの短いURLで開きます。
6. GitHub Pages側のcontent scriptが一時保存データを `AI_RECEIPT_DRAFT` messageとしてReactアプリへ渡します。
7. 読み込み後、一時保存データは削除されます。
8. Webアプリ側のSTEP2に、思考レシート候補が表示されます。

## 送信するデータ

- `aiService`: `ChatGPT`
- `url`: 現在の会話URL
- `capturedAt`: 取得日時
- `conversationTitle`: 会話タイトル
- `messages`: `user` / `assistant` の会話本文

Webアプリ側では自動保存せず、ユーザーが候補フォームを確認・編集してからレシートを発行します。

会話全文はURLに入れません。URLには `source=extension` などの短い情報だけを付けます。

## WebアプリURL

現在は `popup.js` の `WEB_APP_URL` で以下に固定しています。

```text
https://kento553-commits.github.io/-AI-/
```
