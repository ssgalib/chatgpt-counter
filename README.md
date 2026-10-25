# ChatGPT Counter

Shows how full your ChatGPT context window is, live.

- **Pill above the composer**: tokens in the current branch / context limit, a ring coloured by fill level (green < 70% < amber < 90% < red), a spinner while generating, and a live `+N` count of your draft.
- **Click it** for a breakdown by role (you / ChatGPT / tools), message count, "after send" percentage, a context-limit picker, and any feature limits ChatGPT reports (`limits_progress`: deep research, image gen, …).
- Uses `o200k_base`, the tokenizer GPT‑4o / GPT‑5 use, so counts are close. Excludes the system prompt, hidden reasoning, images and files.

## Install (Chrome / Brave / Edge)

`chrome://extensions` → Developer mode → **Load unpacked** → pick this folder.

## How it works

- `src/bridge.js` runs in the page (MAIN world) and watches ChatGPT's own `/backend-api/conversation/*` fetches. It refetches the conversation after each reply, reusing the page's own auth header.
- `src/main.js` + `src/tokens.js` count tokens along the active branch only. Messages are cached so a reply only re-counts new text.
- The UI floats over the page next to the composer instead of being injected into ChatGPT's React tree, so ChatGPT UI updates rarely break it.

## Privacy

No permissions, no external requests. Everything stays in the tab. The chosen context limit is saved in `localStorage` on chatgpt.com.

## Test

`node test/tokens.test.js`
