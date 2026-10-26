# ChatGPT Counter

Shows how full your ChatGPT context window is, live.

- **Pill above the composer**: tokens in the current branch / context limit, a ring coloured by fill level (green < 70% < amber < 90% < red), a spinner while generating, and a live `+N` count of your draft.
- **Click it** for a breakdown by role (you / ChatGPT / tools), message count, "after send" percentage, a context-limit picker, and any feature limits ChatGPT reports (`limits_progress`: deep research, image gen, …).
- Uses `o200k_base`, the tokenizer GPT‑4o / GPT‑5 use, so counts are close. Excludes the system prompt, hidden reasoning, images and files.

## Install (Chrome / Brave / Edge)

1. Download this repo: `git clone https://github.com/ssgalib/chatgpt-counter.git`, or **Code → Download ZIP** and unzip it.
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `chatgpt-counter` folder (the one containing `manifest.json`).
4. Open or refresh [chatgpt.com](https://chatgpt.com).

To update: `git pull` (or download again), then click the reload icon on the extension's card and refresh ChatGPT.

## How to use

- Open any chat. The pill sits just above the message box and shows `tokens used / context limit`.
- Start typing: the `+N` badge shows how many tokens your draft adds.
- Click the pill to open the panel:
  - **Breakdown**: tokens from you, ChatGPT and tools, plus message count and what the fill will be after you send.
  - **Context limit**: *Auto* picks the limit for the current model; choose a fixed size if your plan's window differs. The choice is remembered.
  - **Feature limits**: remaining uses and reset times, when ChatGPT reports them.
  - **Refresh**: recount the conversation if the number looks stale.
- Press `Esc` or click outside to close the panel.
- When the ring turns amber (70%) or red (90%), the chat is close to its limit and older messages may start getting dropped; start a new chat to keep full context.

## How it works

- `src/bridge.js` runs in the page (MAIN world) and watches ChatGPT's own `/backend-api/conversation/*` fetches. It refetches the conversation after each reply, reusing the page's own auth header.
- `src/main.js` + `src/tokens.js` count tokens along the active branch only. Messages are cached so a reply only re-counts new text.
- The UI floats over the page next to the composer instead of being injected into ChatGPT's React tree, so ChatGPT UI updates rarely break it.

## Privacy

No permissions, no external requests. Everything stays in the tab. The chosen context limit is saved in `localStorage` on chatgpt.com.

## Test

`node test/tokens.test.js`
